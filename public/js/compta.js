// Liaison comptable : journaux des ventes (factures et avoirs) et des achats (factures fournisseurs ventilées
// par chantier = section analytique), exportés au format du logiciel du comptable (Excel, CSV, FEC),
// suivi des pièces transmises et envoi par e-mail ; numérotation des factures et avoirs.
const COMPTA_DEFAUT = { journal: 'VT', journalLib: 'Ventes', compteClient: '411000', compteTravaux: '704000', compteLivraison: '708500', compteTVA: '445710', compteRG: '411700',
  journalAchats: 'HA', journalAchatsLib: 'Achats', compteFournisseur: '401000', compteAchats: '601000', compteTVADed: '445660', auxiliaires: true, emailComptable: '' };
const comptaCfg = () => ({ ...COMPTA_DEFAUT, ...(Store.data.settings.compta || {}) });
// Compte auxiliaire : celui de la fiche entreprise, sinon C (client) ou F (fournisseur) + 7 premières lettres du nom
const compteAuxiliaire = (eid, lettre = 'C') => { const e = entreprise(eid); return (e.compteComptable || (lettre + normRecherche(e.nom).replace(/[^a-z0-9]/g, '').slice(0, 7)).toUpperCase()); };
const arrondi2 = v => Math.round(v * 100) / 100;

// Écritures d'une facture (ou d'un avoir, au sens inverse), équilibrées au centime
function ecrituresDe(f) {
  const c = comptaCfg(), t = Calc.doc(f), avoir = f.type === 'avoir', cid = docClientId(f), client = clientName(cid);
  const lib = `${avoir ? 'Avoir' : 'Facture'} ${f.numero || ''} ${client}`.slice(0, 60);
  const aux = c.auxiliaires ? compteAuxiliaire(cid, 'C') : '';
  const tva = arrondi2(t.tva), liv = arrondi2(t.livraison || 0), ttc = arrondi2(t.totalTTC), rg = arrondi2(t.retenue), net = arrondi2(ttc - rg);
  const travaux = arrondi2(ttc - tva - liv), chantier = affaireOf(f.affaireId).code || '';
  const base = { journal: c.journal, journalLib: c.journalLib, date: f.date, piece: f.numero || '', echeance: avoir ? '' : f.echeance || '', col: 'factures', docId: f.id, tiersLib: client };
  const l = [
    { ...base, compte: c.compteClient, aux, libelle: lib, d: net },
    rg ? { ...base, compte: c.compteRG, aux, libelle: `${lib} retenue de garantie`.slice(0, 60), d: rg } : null,
    { ...base, compte: c.compteTravaux, aux: '', analytique: chantier, libelle: lib, c: travaux },
    liv ? { ...base, compte: c.compteLivraison, aux: '', analytique: chantier, libelle: `${lib} livraison`.slice(0, 60), c: liv } : null,
    tva ? { ...base, compte: c.compteTVA, aux: '', libelle: `${lib} TVA`.slice(0, 60), c: tva } : null,
  ].filter(Boolean);
  // Un avoir inverse débit et crédit
  return l.map(e => ({ ...e, analytique: e.analytique || '', debit: arrondi2(avoir ? e.c || 0 : e.d || 0), credit: arrondi2(avoir ? e.d || 0 : e.c || 0) }));
}

// Écritures d'une facture fournisseur : une ligne d'achat par chantier imputé (section analytique = n° de chantier),
// le reste non ventilé sans section, la TVA déductible et le fournisseur (montant négatif = avoir fournisseur, sens inverse)
function ecrituresAchat(x) {
  const c = comptaCfg(), t = Calc.achat(x), four = clientName(x.fournisseurId);
  const lib = `Fact. ${x.numeroFournisseur || x.ref || ''} ${four}`.slice(0, 60);
  const aux = c.auxiliaires ? compteAuxiliaire(x.fournisseurId, 'F') : '';
  const base = { journal: c.journalAchats, journalLib: c.journalAchatsLib, date: x.date, piece: x.ref || '', echeance: x.echeance || '', col: 'achats', docId: x.id, tiersLib: four, analytique: '' };
  const lignes = (x.imputations || []).filter(l => num(l.montantHT)).map(l => ({ ...base, compte: c.compteAchats, aux: '', analytique: affaireOf(l.affaireId).code || '', libelle: `${lib} ${l.libelle || ''}`.trim().slice(0, 60), m: arrondi2(num(l.montantHT)) }));
  const ht = arrondi2(t.ht), tva = arrondi2(t.tva), reste = arrondi2(ht - sumBy(lignes, l => l.m));
  if (Math.abs(reste) > 0.004) lignes.push({ ...base, compte: c.compteAchats, aux: '', libelle: `${lib} non ventilé`.slice(0, 60), m: reste });
  if (tva) lignes.push({ ...base, compte: c.compteTVADed, aux: '', libelle: `${lib} TVA déductible`.slice(0, 60), m: tva });
  lignes.push({ ...base, compte: c.compteFournisseur, aux, libelle: lib, m: -arrondi2(ht + tva) });
  // m > 0 : débit (charge, TVA), m < 0 : crédit (fournisseur)
  return lignes.map(e => ({ ...e, debit: e.m > 0 ? e.m : 0, credit: e.m < 0 ? -e.m : 0 }));
}
const ecrituresPiece = p => (p.col === 'achats' ? ecrituresAchat(p.doc) : ecrituresDe(p.doc));

const nombreFR = v => (v ? v.toFixed(2).replace('.', ',') : '0,00');
const dateFRc = s => (s ? s.split('-').reverse().join('/') : '');
const ENTETES_COMPTA = ['Journal', 'Date', 'Pièce', 'Compte', 'Compte auxiliaire', 'Libellé', 'Débit', 'Crédit', 'Échéance', 'Analytique (chantier)'];
function exportCSV(ecr) {
  const cel = v => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return '﻿' + [ENTETES_COMPTA, ...ecr.map(e => [e.journal, dateFRc(e.date), e.piece, e.compte, e.aux, e.libelle, nombreFR(e.debit), nombreFR(e.credit), dateFRc(e.echeance), e.analytique])]
    .map(r => r.map(cel).join(';')).join('\r\n');
}
// Fichier des écritures comptables (format FEC, article A47 A-1 du LPF) : 18 colonnes séparées par des tabulations
function exportFEC(ecr) {
  const c = comptaCfg(), ymd = s => (s || '').replace(/-/g, ''), auj = ymd(isoDate(new Date()));
  const num0 = {}, numero = e => { const k = `${e.journal}|${e.piece}`; if (!num0[k]) num0[k] = Object.keys(num0).filter(x => x.startsWith(e.journal + '|')).length + 1; return num0[k]; };
  const libCompte = { [c.compteClient]: 'Clients', [c.compteRG]: 'Clients retenues de garantie', [c.compteTravaux]: 'Travaux', [c.compteLivraison]: 'Ports et frais facturés', [c.compteTVA]: 'TVA collectée',
    [c.compteFournisseur]: 'Fournisseurs', [c.compteAchats]: 'Achats de matières et fournitures', [c.compteTVADed]: 'TVA déductible' };
  const net = s => String(s ?? '').replace(/[\t\r\n|]/g, ' ');
  const tri = [...ecr].sort((a, b) => a.journal.localeCompare(b.journal) || (a.date || '').localeCompare(b.date || ''));
  return [['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'],
    ...tri.map(e => [e.journal, e.journalLib, numero(e), ymd(e.date), e.compte, libCompte[e.compte] || '', e.aux, e.aux ? e.tiersLib : '', e.piece, ymd(e.date), e.libelle, nombreFR(e.debit), nombreFR(e.credit), '', '', auj, '', ''])]
    .map(r => r.map(net).join('\t')).join('\r\n');
}
function exportXLSX(ecr, titre) {
  const H = v => ({ v, s: 'head' });
  const feuille = (nom, l) => ({ name: nom, cols: [8, 11, 16, 11, 14, 46, 13, 13, 11, 16], freeze: 4, rows: [[{ v: `${titre} – ${nom.toLowerCase()}`, s: 'title' }], [{ v: `${Store.data.settings.societe} · ${l.length} écritures`, s: 'muted' }], [],
    ENTETES_COMPTA.map(H), ...l.map(e => [e.journal, dateFRc(e.date), e.piece, e.compte, e.aux, e.libelle, { v: e.debit, s: 'eur' }, { v: e.credit, s: 'eur' }, dateFRc(e.echeance), e.analytique]),
    ['', '', '', '', '', { v: 'Totaux', s: 'bold' }, { v: arrondi2(sumBy(l, e => e.debit)), s: 'eur' }, { v: arrondi2(sumBy(l, e => e.credit)), s: 'eur' }]] });
  const ventes = ecr.filter(e => e.col === 'factures'), achats = ecr.filter(e => e.col === 'achats');
  return XLSX.build([ventes.length || !achats.length ? feuille('Ventes', ventes) : null, achats.length ? feuille('Achats', achats) : null].filter(Boolean));
}

/* ---------- Écran Facturation → Comptabilité ---------- */
const FILTRES_COMPTA = { du: '', au: '', etat: 'nontransmis', journal: 'tous' };
const JOURNAUX = [['tous', 'Ventes et achats'], ['ventes', 'Ventes (factures, avoirs)'], ['achats', 'Achats (factures fournisseurs)']];
function piecesCompta(f) {
  const ok = x => (!f.du || x.date >= f.du) && (!f.au || x.date <= f.au) && (f.etat === 'tous' || (f.etat === 'transmis' ? x.exportCompta : !x.exportCompta));
  const ventes = f.journal === 'achats' ? [] : Store.all('factures').filter(x => x.numero && ok(x)).map(doc => ({ col: 'factures', doc }));
  const achats = f.journal === 'ventes' ? [] : Store.all('achats').filter(x => x.ref && num(x.montantHT) && x.fournisseurId && ok(x)).map(doc => ({ col: 'achats', doc }));
  return [...ventes, ...achats].sort((a, b) => a.col.localeCompare(b.col) * -1 || (a.doc.date || '').localeCompare(b.doc.date || '') || String(a.doc.numero || a.doc.ref).localeCompare(String(b.doc.numero || b.doc.ref)));
}
Views.compta = (params, query) => {
  const f = lireFiltres('compta', query, FILTRES_COMPTA), c = comptaCfg(), admin = Store.can('admin');
  const pieces = piecesCompta(f), ecr = pieces.flatMap(ecrituresPiece);
  const td = arrondi2(sumBy(ecr, e => e.debit)), tc = arrondi2(sumBy(ecr, e => e.credit));
  const ventes = pieces.filter(p => p.col === 'factures').map(p => p.doc), achats = pieces.filter(p => p.col === 'achats').map(p => p.doc);
  const sansCompte = [...new Set([...ventes.map(docClientId), ...achats.map(x => x.fournisseurId)])].filter(id => !entreprise(id).compteComptable);
  const aVentiler = achats.filter(x => Calc.achat(x).reste > 0.005 && !x.fraisGeneraux).length;
  return `<h1>Facturation</h1>${facturationTabs('compta')}
  <p class="muted">Écritures à transmettre au comptable. <strong>Ventes</strong> : une écriture par facture et par avoir (client, retenue de garantie, travaux, livraison, TVA collectée).
    <strong>Achats</strong> : une écriture par facture fournisseur (achats ventilés par chantier en section analytique, TVA déductible, fournisseur).
    Importable dans la plupart des logiciels comptables (Sage, Cegid, EBP, Quadra, ACD, Pennylane…) en Excel ou CSV, ou au format FEC.</p>
  <div class="toolbar filtres">
    <select data-f="journal" aria-label="Journal">${JOURNAUX.map(([v, l]) => `<option value="${v}" ${f.journal === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="inline small">Du <input type="date" data-f="du" value="${esc(f.du)}"></label>
    <label class="inline small">au <input type="date" data-f="au" value="${esc(f.au)}"></label>
    <select data-f="etat" aria-label="Pièces"><option value="nontransmis" ${f.etat === 'nontransmis' ? 'selected' : ''}>Non encore transmises</option><option value="transmis" ${f.etat === 'transmis' ? 'selected' : ''}>Déjà transmises</option><option value="tous" ${f.etat === 'tous' ? 'selected' : ''}>Toutes</option></select>
    <button class="secondary small" id="cp-mois" type="button">Mois précédent</button>
  </div>
  <div class="cards">
    <div class="card"><div class="label">Ventes</div><div class="value">${eur(sumBy(ventes, x => Calc.facture(x).ht))}</div><div class="sub">${ventes.length} pièce(s) dont ${ventes.filter(estAvoir).length} avoir(s) · HT</div></div>
    <div class="card"><div class="label">Achats</div><div class="value">${eur(sumBy(achats, x => Calc.achat(x).ht))}</div><div class="sub">${achats.length} facture(s) fournisseur · HT${aVentiler ? ` · <span class="warn-text">${aVentiler} non ventilée(s)</span>` : ''}</div></div>
    <div class="card"><div class="label">Écritures</div><div class="value">${ecr.length}</div><div class="sub ${td === tc ? 'pos' : 'neg'}">Débit ${eur(td)} · Crédit ${eur(tc)}${td === tc ? ' · équilibré' : ' · déséquilibré !'}</div></div>
  </div>
  ${sansCompte.length && c.auxiliaires ? `<p class="note small">${sansCompte.length} tiers sans compte auxiliaire sur leur fiche : un compte est proposé automatiquement (${sansCompte.slice(0, 3).map(id => `${esc(clientName(id))} → ${esc(compteAuxiliaire(id, achats.some(x => x.fournisseurId === id) && !ventes.some(v => docClientId(v) === id) ? 'F' : 'C'))}`).join(', ')}${sansCompte.length > 3 ? '…' : ''}). Renseignez le compte de votre comptable dans la fiche entreprise.</p>` : ''}
  <div class="toolbar">
    <button class="dl-btn" id="cp-xlsx" ${pieces.length ? '' : 'disabled'}>Excel</button>
    <button class="secondary dl-btn" id="cp-csv" ${pieces.length ? '' : 'disabled'}>CSV</button>
    <button class="secondary dl-btn" id="cp-fec" ${pieces.length ? '' : 'disabled'}>FEC</button>
    ${['admin', 'charge'].includes(Store.me.role) ? `<button class="secondary" id="cp-mail" ${pieces.length ? '' : 'disabled'}>✉ Envoyer au comptable</button>` : ''}
    <label class="check small"><input type="checkbox" id="cp-marquer" checked> Marquer les pièces comme transmises après l'export</label>
    ${f.etat !== 'nontransmis' && pieces.some(p => p.doc.exportCompta) ? '<button class="secondary small" id="cp-demarquer">Remettre « non transmises »</button>' : ''}
  </div>
  ${ecr.length ? `<div class="table-wrap"><table class="compact"><tr><th>Jal</th><th>Date</th><th>Pièce</th><th>Compte</th><th>Aux.</th><th>Analytique</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th>Transmis</th></tr>
    ${ecr.map((e, i) => { const p = Store.get(e.col, e.docId); const prem = i === 0 || ecr[i - 1].piece !== e.piece || ecr[i - 1].col !== e.col;
      return `<tr class="${prem ? 'piece-debut' : ''}"><td>${prem ? esc(e.journal) : ''}</td><td>${prem ? dateFr(e.date) : ''}</td><td>${prem ? `<a href="#/${e.col === 'achats' ? 'achats' : 'facture'}/${e.docId}">${esc(e.piece)}</a>` : ''}</td><td>${esc(e.compte)}</td><td>${esc(e.aux)}</td><td>${esc(e.analytique)}</td><td>${esc(e.libelle)}</td>
        <td class="num">${e.debit ? eur(e.debit) : ''}</td><td class="num">${e.credit ? eur(e.credit) : ''}</td><td>${prem && p.exportCompta ? dateFr(p.exportCompta.date) : ''}</td></tr>`; }).join('')}
    <tr class="subtotal"><td colspan="7">Totaux</td><td class="num">${eur(td)}</td><td class="num">${eur(tc)}</td><td></td></tr></table></div>` : '<p class="muted">Aucune pièce pour cette période.</p>'}

  <h2>Paramètres comptables</h2>
  <div class="card">
    <h3 style="margin-top:0">Ventes</h3>
    <div class="grid2">${[['journal', 'Code journal'], ['journalLib', 'Libellé du journal'], ['compteClient', 'Compte clients (collectif)'], ['compteRG', 'Compte clients retenues de garantie'], ['compteTravaux', 'Compte de vente travaux'], ['compteLivraison', 'Compte livraison / port facturé'], ['compteTVA', 'Compte TVA collectée']]
      .map(([k, l]) => `<div class="field"><label for="cc-${k}">${l}</label><input id="cc-${k}" data-cc="${k}" value="${esc(c[k])}" ${admin ? '' : 'disabled'}></div>`).join('')}</div>
    <h3>Achats</h3>
    <div class="grid2">${[['journalAchats', 'Code journal'], ['journalAchatsLib', 'Libellé du journal'], ['compteFournisseur', 'Compte fournisseurs (collectif)'], ['compteAchats', 'Compte d\'achats (matières et fournitures)'], ['compteTVADed', 'Compte TVA déductible']]
      .map(([k, l]) => `<div class="field"><label for="cc-${k}">${l}</label><input id="cc-${k}" data-cc="${k}" value="${esc(c[k])}" ${admin ? '' : 'disabled'}></div>`).join('')}</div>
    <div class="field"><label for="cc-emailComptable">E-mail du cabinet comptable</label><input id="cc-emailComptable" data-cc="emailComptable" value="${esc(c.emailComptable)}" ${admin ? '' : 'disabled'}></div>
    <label class="check"><input type="checkbox" id="cc-aux" ${c.auxiliaires ? 'checked' : ''} ${admin ? '' : 'disabled'}> Comptes auxiliaires clients et fournisseurs (compte de la fiche entreprise, sinon généré : C… / F…)</label>
    ${admin ? '<div class="modal-actions"><button id="cc-save">Enregistrer</button></div>' : ''}
  </div>`;
};

Views.compta.bind = (root, params, query) => {
  const f = lireFiltres('compta', query, FILTRES_COMPTA);
  bindFiltres(root, 'compta', f, FILTRES_COMPTA);
  const q = s => root.querySelector(s), on = (s, fn) => { const el = q(s); if (el) el.onclick = fn; };
  const pieces = () => piecesCompta(f), ecr = () => pieces().flatMap(ecrituresPiece);
  const periode = () => (f.du || f.au ? `${f.du ? dateFr(f.du) : '…'} au ${f.au ? dateFr(f.au) : '…'}` : isoDate(new Date()));
  const nomJournal = { tous: 'ecritures', ventes: 'journal-ventes', achats: 'journal-achats' }[f.journal] || 'ecritures';
  const titre = () => `${{ tous: 'Journaux des ventes et des achats', ventes: 'Journal des ventes', achats: 'Journal des achats' }[f.journal]} du ${periode()}`;
  const nomFichierCompta = ext => `${nomJournal}-${(f.du || '').slice(0, 7) || isoDate(new Date())}${f.au && f.au.slice(0, 7) !== (f.du || '').slice(0, 7) ? '_' + f.au.slice(0, 7) : ''}.${ext}`;
  const marquer = (ps, lot) => {
    if (!q('#cp-marquer').checked) return;
    ps.forEach(p => { p.doc.exportCompta = { date: isoDate(new Date()), par: Store.me.nom, lot }; Store.upsert(p.col, p.doc); });
    App.render(); App.toast(`${ps.length} pièce(s) marquée(s) comme transmises`);
  };
  on('#cp-mois', () => { const d = new Date(); const deb = new Date(d.getFullYear(), d.getMonth() - 1, 1), fin = new Date(d.getFullYear(), d.getMonth(), 0); location.hash = lienFiltres('compta', { ...f, du: isoDate(deb), au: isoDate(fin) }); });
  on('#cp-xlsx', () => { const ps = pieces(); download(nomFichierCompta('xlsx'), exportXLSX(ecr(), titre()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); marquer(ps, 'Excel'); });
  on('#cp-csv', () => { const ps = pieces(); download(nomFichierCompta('csv'), exportCSV(ecr()), 'text/csv;charset=utf-8'); marquer(ps, 'CSV'); });
  on('#cp-fec', () => { const ps = pieces(); download(`FEC-${nomFichierCompta('txt')}`, exportFEC(ecr()), 'text/plain;charset=utf-8'); marquer(ps, 'FEC'); });
  on('#cp-demarquer', () => ask('Remettre ces pièces en « non transmises » ? Elles seront incluses dans le prochain export.', 'Confirmer', false).then(ok => {
    if (!ok) return;
    pieces().filter(p => p.doc.exportCompta).forEach(p => { delete p.doc.exportCompta; Store.upsert(p.col, p.doc); });
    App.render();
  }));
  on('#cp-mail', () => envoyerComptable(pieces(), ecr(), periode(), titre(), nomFichierCompta, ps => marquer(ps, 'E-mail')));
  on('#cc-save', async () => {
    const cfg = { ...comptaCfg(), auxiliaires: q('#cc-aux').checked };
    root.querySelectorAll('[data-cc]').forEach(el => { cfg[el.dataset.cc] = el.value.trim(); });
    try { await Store.saveSettings({ ...Store.data.settings, compta: cfg }); App.render(); App.toast('Paramètres comptables enregistrés'); }
    catch (e) { notify(e.message); }
  });
};

// Envoi au cabinet comptable : écritures (Excel + CSV) et, au choix, les pièces (PDF des factures, factures fournisseurs jointes)
async function envoyerComptable(pieces, ecr, periode, titre, nomFichierCompta, apres) {
  const me = await api('GET', '/api/me').catch(() => Store.me), c = comptaCfg();
  const m365 = me.m365 && me.email;
  const ventes = pieces.filter(p => p.col === 'factures').map(p => p.doc), achats = pieces.filter(p => p.col === 'achats').map(p => p.doc);
  const pjAchats = achats.filter(x => x.pieceId);
  const box = Modal.open(`<h2 style="margin-top:0">Envoyer au comptable</h2>
    <div class="field"><label for="ec-to">Destinataire</label><input id="ec-to" type="email" value="${esc(c.emailComptable)}" placeholder="cabinet@exemple.fr"></div>
    <div class="field"><label for="ec-objet">Objet</label><input id="ec-objet" value="${esc(`${Store.data.settings.societe} – ${titre.charAt(0).toLowerCase() + titre.slice(1)}`)}"></div>
    <div class="field"><label for="ec-corps">Message</label><textarea id="ec-corps" rows="8">${esc(`Bonjour,\n\nVeuillez trouver ci-joint les écritures du ${periode} :\n${ventes.length ? `- ventes : ${ventes.length} pièce(s) (${ventes.filter(estAvoir).length} avoir(s)), ${eur(sumBy(ventes, x => Calc.facture(x).ht))} HT\n` : ''}${achats.length ? `- achats : ${achats.length} facture(s) fournisseur, ${eur(sumBy(achats, x => Calc.achat(x).ht))} HT (section analytique = n° de chantier)\n` : ''}\nCordialement,\n${me.nom || ''}`)}</textarea></div>
    ${ventes.length ? `<label class="check"><input type="checkbox" id="ec-pdf" ${ventes.length <= 15 ? 'checked' : ''}> Joindre les PDF des ${ventes.length} facture(s) et avoir(s)${ventes.length > 15 ? ' (volumineux)' : ''}</label>` : ''}
    ${pjAchats.length ? `<label class="check"><input type="checkbox" id="ec-pja" ${pjAchats.length <= 10 ? 'checked' : ''}> Joindre les ${pjAchats.length} facture(s) fournisseur numérisée(s)</label>` : ''}
    <p class="muted small">${m365 ? `Envoi par Microsoft 365 depuis ${esc(me.email)} (copie dans vos éléments envoyés).` : 'Brouillon Outlook avec les pièces jointes (Microsoft 365 non configuré).'}</p>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ec-annuler">Annuler</button><button id="ec-ok">Envoyer</button></div>`);
  box.querySelector('#ec-annuler').onclick = Modal.close;
  box.querySelector('#ec-ok').onclick = async () => {
    const to = box.querySelector('#ec-to').value.trim();
    if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(to)) return notify('Adresse e-mail du comptable invalide.');
    const btn = box.querySelector('#ec-ok'); btn.disabled = true; btn.textContent = 'Préparation…';
    try {
      const pj = [{ nom: nomFichierCompta('xlsx'), bytes: exportXLSX(ecr, titre), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { nom: nomFichierCompta('csv'), bytes: new TextEncoder().encode(exportCSV(ecr)), type: 'text/csv' }];
      if (box.querySelector('#ec-pdf') && box.querySelector('#ec-pdf').checked) for (const p of ventes) pj.push({ nom: nomFichier(`${estAvoir(p) ? 'Avoir' : 'Facture'} ${p.numero}`), bytes: await PDF.depuisHTML(factureDocument(p), p.numero), type: 'application/pdf' });
      if (box.querySelector('#ec-pja') && box.querySelector('#ec-pja').checked) for (const x of pjAchats) {
        const r = await fetch(fileUrl(x.pieceId)), b = new Uint8Array(await r.arrayBuffer()), pdf = x.pieceType === 'pdf';
        if (pdf) pj.push({ nom: nomFichier(`${x.ref} ${clientName(x.fournisseurId)} ${x.numeroFournisseur || ''}`), bytes: b, type: 'application/pdf' });
      }
      const subject = box.querySelector('#ec-objet').value, html = Mails.html(box.querySelector('#ec-corps').value);
      if (m365) await api('POST', '/api/mail', { to: [to], cc: [], subject, html, type: 'compta', numero: periode, attachments: pj.map(p => ({ name: p.nom, base64: enBase64(p.bytes) })) });
      else download('envoi-comptable.eml', brouillonEML({ to: [to], cc: [], subject, html, pieces: pj }), 'message/rfc822');
      if (!c.emailComptable && Store.can('admin')) await Store.saveSettings({ ...Store.data.settings, compta: { ...c, emailComptable: to } }).catch(() => {});
      Modal.close(); App.toast(m365 ? `Écritures envoyées à ${to}` : 'Brouillon téléchargé : ouvrez-le dans Outlook.', 4000);
      apres(pieces);
    } catch (e) { notify(e.message); btn.disabled = false; btn.textContent = 'Envoyer'; }
  };
}

/* ---------- Paramètres : numérotation des factures et avoirs ---------- */
function numerotationCarte() {
  return `<h2>Numérotation des factures et avoirs</h2>
  <div class="card" id="num-carte"><p class="muted small">Chargement…</p></div>`;
}
function bindNumerotation(root) {
  const carte = root.querySelector('#num-carte');
  if (!carte) return;
  api('GET', '/api/numerotation').then(etat => {
    const bloc = (cle, titre) => { const e = etat[cle], f = e.format; return `<fieldset class="doc-opts num-bloc" data-cle="${cle}"><legend>${titre}</legend>
      <div class="grid2">
        <div class="field"><label>Préfixe</label><input data-k="prefixe" value="${esc(f.prefixe)}" maxlength="12"></div>
        <div class="field"><label>Séparateur</label><select data-k="separateur">${[['-', 'tiret (-)'], ['/', 'barre (/)'], ['_', 'souligné (_)'], ['.', 'point (.)'], ['', 'aucun']].map(([v, l]) => `<option value="${v}" ${f.separateur === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Année</label><select data-k="annee">${[['AAAA', 'sur 4 chiffres (2026), remise à 1 chaque année'], ['AA', 'sur 2 chiffres (26), remise à 1 chaque année'], ['', 'sans année (suite continue)']].map(([v, l]) => `<option value="${v}" ${f.annee === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Nombre de chiffres</label><input data-k="chiffres" type="number" min="3" max="8" value="${esc(f.chiffres)}"></div>
        <div class="field"><label>Prochain numéro</label><input data-k="prochain" type="number" min="${e.dernier + 1}" value="${esc(e.prochain)}"></div>
        <div class="field"><label>Aperçu</label><output class="num-apercu">${esc(e.exemple)}</output></div>
      </div>
      <p class="muted small">${e.dernier ? `Dernier numéro attribué avec ce format : ${esc(e.racine)}${String(e.dernier).padStart(f.chiffres, '0')}.` : 'Aucun numéro encore attribué avec ce format.'} Reprise d'un autre logiciel : indiquez le prochain numéro à utiliser.</p></fieldset>`; };
    carte.innerHTML = `<p class="muted small" style="margin-top:0">Numéros attribués par le serveur, dans l'ordre chronologique et sans trou (aucune facture ne peut être supprimée). Un changement de format s'applique aux prochaines pièces.</p>
      ${bloc('facture', 'Factures')}${bloc('avoir', 'Avoirs')}<div class="modal-actions"><button id="num-save">Enregistrer la numérotation</button></div>`;
    const apercu = div => {
      const v = k => div.querySelector(`[data-k="${k}"]`).value, an = v('annee') === 'AAAA' ? String(new Date().getFullYear()) : v('annee') === 'AA' ? String(new Date().getFullYear()).slice(2) : '';
      div.querySelector('.num-apercu').textContent = [v('prefixe'), an].filter(Boolean).map(x => x + v('separateur')).join('') + String(Math.max(1, parseInt(v('prochain'), 10) || 1)).padStart(Math.min(8, Math.max(3, +v('chiffres') || 4)), '0');
    };
    carte.querySelectorAll('.num-bloc').forEach(div => div.querySelectorAll('[data-k]').forEach(el => { el.oninput = () => apercu(div); }));
    carte.querySelector('#num-save').onclick = async () => {
      try {
        const numerotation = {};
        carte.querySelectorAll('.num-bloc').forEach(div => { const v = k => div.querySelector(`[data-k="${k}"]`).value; numerotation[div.dataset.cle] = { prefixe: v('prefixe'), separateur: v('separateur'), annee: v('annee'), chiffres: +v('chiffres') }; });
        await Store.saveSettings({ ...Store.data.settings, numerotation });
        const nouvel = await api('GET', '/api/numerotation');
        for (const div of carte.querySelectorAll('.num-bloc')) {
          const cle = div.dataset.cle, voulu = parseInt(div.querySelector('[data-k="prochain"]').value, 10);
          if (voulu && voulu !== nouvel[cle].prochain) await api('PUT', '/api/numerotation', { cle, prochain: voulu });
        }
        App.toast('Numérotation enregistrée'); bindNumerotation(root);
      } catch (e) { notify(e.message); }
    };
  }).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
}
