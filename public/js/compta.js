// Liaison comptable : journal des ventes (factures et avoirs) exporté au format du logiciel du comptable
// (Excel, CSV, FEC), suivi des pièces transmises et envoi par e-mail ; numérotation des factures et avoirs.
const COMPTA_DEFAUT = { journal: 'VT', journalLib: 'Ventes', compteClient: '411000', compteTravaux: '704000', compteLivraison: '708500', compteTVA: '445710', compteRG: '411700', auxiliaires: true, emailComptable: '' };
const comptaCfg = () => ({ ...COMPTA_DEFAUT, ...(Store.data.settings.compta || {}) });
// Compte auxiliaire client : celui de la fiche entreprise, sinon C + 7 premières lettres du nom
const compteAuxiliaire = eid => { const e = entreprise(eid); return (e.compteComptable || ('C' + normRecherche(e.nom).replace(/[^a-z0-9]/g, '').slice(0, 7)).toUpperCase()); };
const arrondi2 = v => Math.round(v * 100) / 100;

// Écritures d'une facture (ou d'un avoir, au sens inverse), équilibrées au centime
function ecrituresDe(f) {
  const c = comptaCfg(), t = Calc.doc(f), avoir = f.type === 'avoir', cid = docClientId(f), client = clientName(cid);
  const lib = `${avoir ? 'Avoir' : 'Facture'} ${f.numero || ''} ${client}`.slice(0, 60);
  const aux = c.auxiliaires ? compteAuxiliaire(cid) : '';
  const tva = arrondi2(t.tva), liv = arrondi2(t.livraison || 0), ttc = arrondi2(t.totalTTC), rg = arrondi2(t.retenue), net = arrondi2(ttc - rg);
  const travaux = arrondi2(ttc - tva - liv);
  const base = { journal: c.journal, date: f.date, piece: f.numero || '', echeance: avoir ? '' : f.echeance || '', chantier: affaireOf(f.affaireId).code || '', docId: f.id, clientLib: client };
  const l = [
    { ...base, compte: c.compteClient, aux, libelle: lib, d: net },
    rg ? { ...base, compte: c.compteRG, aux, libelle: `${lib} retenue de garantie`.slice(0, 60), d: rg } : null,
    { ...base, compte: c.compteTravaux, aux: '', libelle: lib, c: travaux },
    liv ? { ...base, compte: c.compteLivraison, aux: '', libelle: `${lib} livraison`.slice(0, 60), c: liv } : null,
    tva ? { ...base, compte: c.compteTVA, aux: '', libelle: `${lib} TVA`.slice(0, 60), c: tva } : null,
  ].filter(Boolean);
  // Un avoir inverse débit et crédit
  return l.map(e => ({ ...e, debit: arrondi2(avoir ? e.c || 0 : e.d || 0), credit: arrondi2(avoir ? e.d || 0 : e.c || 0) }));
}

const nombreFR = v => (v ? v.toFixed(2).replace('.', ',') : '0,00');
const dateFRc = s => (s ? s.split('-').reverse().join('/') : '');
function exportCSV(ecr) {
  const cel = v => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return '﻿' + [['Journal', 'Date', 'Pièce', 'Compte', 'Compte auxiliaire', 'Libellé', 'Débit', 'Crédit', 'Échéance', 'Chantier'],
    ...ecr.map(e => [e.journal, dateFRc(e.date), e.piece, e.compte, e.aux, e.libelle, nombreFR(e.debit), nombreFR(e.credit), dateFRc(e.echeance), e.chantier])]
    .map(r => r.map(cel).join(';')).join('\r\n');
}
// Fichier des écritures comptables (format FEC, article A47 A-1 du LPF) : 18 colonnes séparées par des tabulations
function exportFEC(ecr) {
  const c = comptaCfg(), ymd = s => (s || '').replace(/-/g, ''), auj = ymd(isoDate(new Date()));
  const pieces = [...new Set(ecr.map(e => e.piece))];
  const libCompte = { [c.compteClient]: 'Clients', [c.compteRG]: 'Clients retenues de garantie', [c.compteTravaux]: 'Travaux', [c.compteLivraison]: 'Ports et frais facturés', [c.compteTVA]: 'TVA collectée' };
  const net = s => String(s || '').replace(/[\t\r\n|]/g, ' ');
  return [['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'],
    ...ecr.map(e => [c.journal, c.journalLib, pieces.indexOf(e.piece) + 1, ymd(e.date), e.compte, libCompte[e.compte] || '', e.aux, e.aux ? e.clientLib : '', e.piece, ymd(e.date), e.libelle, nombreFR(e.debit), nombreFR(e.credit), '', '', auj, '', ''])]
    .map(r => r.map(net).join('\t')).join('\r\n');
}
function exportXLSX(ecr, titre) {
  const H = v => ({ v, s: 'head' });
  const rows = [[{ v: titre, s: 'title' }], [{ v: `${Store.data.settings.societe} · journal ${comptaCfg().journal} · ${ecr.length} écritures`, s: 'muted' }], [],
    ['Journal', 'Date', 'Pièce', 'Compte', 'Compte auxiliaire', 'Libellé', 'Débit', 'Crédit', 'Échéance', 'Chantier'].map(H),
    ...ecr.map(e => [e.journal, dateFRc(e.date), e.piece, e.compte, e.aux, e.libelle, { v: e.debit, s: 'eur' }, { v: e.credit, s: 'eur' }, dateFRc(e.echeance), e.chantier]),
    ['', '', '', '', '', { v: 'Totaux', s: 'bold' }, { v: arrondi2(sumBy(ecr, e => e.debit)), s: 'eur' }, { v: arrondi2(sumBy(ecr, e => e.credit)), s: 'eur' }]];
  return XLSX.build([{ name: 'Journal des ventes', cols: [8, 11, 16, 11, 14, 46, 13, 13, 11, 14], freeze: 4, rows }]);
}

/* ---------- Écran Facturation → Comptabilité ---------- */
const FILTRES_COMPTA = { du: '', au: '', etat: 'nontransmis' };
function piecesCompta(f) {
  return Store.all('factures').filter(x => x.numero && (!f.du || x.date >= f.du) && (!f.au || x.date <= f.au) && (f.etat === 'tous' || (f.etat === 'transmis' ? x.exportCompta : !x.exportCompta)))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.numero || '').localeCompare(b.numero || ''));
}
Views.compta = (params, query) => {
  const f = lireFiltres('compta', query, FILTRES_COMPTA), c = comptaCfg(), admin = Store.can('admin');
  const pieces = piecesCompta(f), ecr = pieces.flatMap(ecrituresDe);
  const td = arrondi2(sumBy(ecr, e => e.debit)), tc = arrondi2(sumBy(ecr, e => e.credit));
  const sansCompte = [...new Set(pieces.map(docClientId))].filter(id => !entreprise(id).compteComptable);
  return `<h1>Facturation</h1>${facturationTabs('compta')}
  <p class="muted">Journal des ventes à transmettre au comptable : une écriture par facture et par avoir (client, retenue de garantie, travaux, livraison, TVA).
    Importable dans la plupart des logiciels comptables (Sage, Cegid, EBP, Quadra, ACD, Pennylane…) en Excel ou CSV, ou au format FEC.</p>
  <div class="toolbar filtres">
    <label class="inline small">Du <input type="date" data-f="du" value="${esc(f.du)}"></label>
    <label class="inline small">au <input type="date" data-f="au" value="${esc(f.au)}"></label>
    <select data-f="etat" aria-label="Pièces"><option value="nontransmis" ${f.etat === 'nontransmis' ? 'selected' : ''}>Non encore transmises</option><option value="transmis" ${f.etat === 'transmis' ? 'selected' : ''}>Déjà transmises</option><option value="tous" ${f.etat === 'tous' ? 'selected' : ''}>Toutes</option></select>
    <button class="secondary small" id="cp-mois" type="button">Mois précédent</button>
  </div>
  <div class="cards">
    <div class="card"><div class="label">Pièces</div><div class="value">${pieces.length}</div><div class="sub">${pieces.filter(estAvoir).length} avoir(s)</div></div>
    <div class="card"><div class="label">Chiffre d'affaires HT</div><div class="value">${eur(sumBy(pieces, x => Calc.facture(x).ht))}</div><div class="sub">avoirs déduits</div></div>
    <div class="card"><div class="label">Écritures</div><div class="value">${ecr.length}</div><div class="sub ${td === tc ? 'pos' : 'neg'}">Débit ${eur(td)} · Crédit ${eur(tc)}${td === tc ? ' · équilibré' : ' · déséquilibré !'}</div></div>
  </div>
  ${sansCompte.length && c.auxiliaires ? `<p class="note small">${sansCompte.length} client(s) sans compte auxiliaire sur leur fiche : un compte est proposé automatiquement (${sansCompte.slice(0, 3).map(id => `${esc(clientName(id))} → ${esc(compteAuxiliaire(id))}`).join(', ')}${sansCompte.length > 3 ? '…' : ''}). Renseignez le compte de votre comptable dans la fiche entreprise.</p>` : ''}
  <div class="toolbar">
    <button class="dl-btn" id="cp-xlsx" ${pieces.length ? '' : 'disabled'}>Excel</button>
    <button class="secondary dl-btn" id="cp-csv" ${pieces.length ? '' : 'disabled'}>CSV</button>
    <button class="secondary dl-btn" id="cp-fec" ${pieces.length ? '' : 'disabled'}>FEC</button>
    ${['admin', 'charge'].includes(Store.me.role) ? `<button class="secondary" id="cp-mail" ${pieces.length ? '' : 'disabled'}>✉ Envoyer au comptable</button>` : ''}
    <label class="check small"><input type="checkbox" id="cp-marquer" checked> Marquer les pièces comme transmises après l'export</label>
    ${f.etat !== 'nontransmis' && pieces.some(x => x.exportCompta) ? '<button class="secondary small" id="cp-demarquer">Remettre « non transmises »</button>' : ''}
  </div>
  ${ecr.length ? `<div class="table-wrap"><table class="compact"><tr><th>Date</th><th>Pièce</th><th>Compte</th><th>Aux.</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th>Transmis</th></tr>
    ${ecr.map((e, i) => { const p = Store.get('factures', e.docId); const prem = i === 0 || ecr[i - 1].piece !== e.piece;
      return `<tr class="${prem ? 'piece-debut' : ''}"><td>${prem ? dateFr(e.date) : ''}</td><td>${prem ? `<a href="#/facture/${e.docId}">${esc(e.piece)}</a>` : ''}</td><td>${esc(e.compte)}</td><td>${esc(e.aux)}</td><td>${esc(e.libelle)}</td>
        <td class="num">${e.debit ? eur(e.debit) : ''}</td><td class="num">${e.credit ? eur(e.credit) : ''}</td><td>${prem && p.exportCompta ? dateFr(p.exportCompta.date) : ''}</td></tr>`; }).join('')}
    <tr class="subtotal"><td colspan="5">Totaux</td><td class="num">${eur(td)}</td><td class="num">${eur(tc)}</td><td></td></tr></table></div>` : '<p class="muted">Aucune pièce pour cette période.</p>'}

  <h2>Paramètres comptables</h2>
  <div class="card">
    <div class="grid2">${[['journal', 'Code journal'], ['journalLib', 'Libellé du journal'], ['compteClient', 'Compte clients (collectif)'], ['compteRG', 'Compte clients retenues de garantie'], ['compteTravaux', 'Compte de vente travaux'], ['compteLivraison', 'Compte livraison / port facturé'], ['compteTVA', 'Compte TVA collectée'], ['emailComptable', 'E-mail du cabinet comptable']]
      .map(([k, l]) => `<div class="field"><label for="cc-${k}">${l}</label><input id="cc-${k}" data-cc="${k}" value="${esc(c[k])}" ${admin ? '' : 'disabled'}></div>`).join('')}</div>
    <label class="check"><input type="checkbox" id="cc-aux" ${c.auxiliaires ? 'checked' : ''} ${admin ? '' : 'disabled'}> Comptes auxiliaires clients (compte de la fiche entreprise, sinon généré)</label>
    ${admin ? '<div class="modal-actions"><button id="cc-save">Enregistrer</button></div>' : ''}
  </div>`;
};

Views.compta.bind = (root, params, query) => {
  const f = lireFiltres('compta', query, FILTRES_COMPTA);
  bindFiltres(root, 'compta', f, FILTRES_COMPTA);
  const q = s => root.querySelector(s), on = (s, fn) => { const el = q(s); if (el) el.onclick = fn; };
  const pieces = () => piecesCompta(f), ecr = () => pieces().flatMap(ecrituresDe);
  const periode = () => (f.du || f.au ? `${f.du ? dateFr(f.du) : '…'} au ${f.au ? dateFr(f.au) : '…'}` : isoDate(new Date()));
  const nomFichierCompta = ext => `journal-ventes-${(f.du || '').slice(0, 7) || isoDate(new Date())}${f.au && f.au.slice(0, 7) !== (f.du || '').slice(0, 7) ? '_' + f.au.slice(0, 7) : ''}.${ext}`;
  const marquer = (ps, lot) => {
    if (!q('#cp-marquer').checked) return;
    ps.forEach(p => { p.exportCompta = { date: isoDate(new Date()), par: Store.me.nom, lot }; Store.upsert('factures', p); });
    App.render(); App.toast(`${ps.length} pièce(s) marquée(s) comme transmises`);
  };
  on('#cp-mois', () => { const d = new Date(); const deb = new Date(d.getFullYear(), d.getMonth() - 1, 1), fin = new Date(d.getFullYear(), d.getMonth(), 0); location.hash = lienFiltres('compta', { ...f, du: isoDate(deb), au: isoDate(fin) }); });
  on('#cp-xlsx', () => { const ps = pieces(); download(nomFichierCompta('xlsx'), exportXLSX(ecr(), `Journal des ventes du ${periode()}`), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); marquer(ps, 'Excel'); });
  on('#cp-csv', () => { const ps = pieces(); download(nomFichierCompta('csv'), exportCSV(ecr()), 'text/csv;charset=utf-8'); marquer(ps, 'CSV'); });
  on('#cp-fec', () => { const ps = pieces(); download(nomFichierCompta('txt').replace('journal-ventes', 'FEC-ventes'), exportFEC(ecr()), 'text/plain;charset=utf-8'); marquer(ps, 'FEC'); });
  on('#cp-demarquer', () => ask('Remettre ces pièces en « non transmises » ? Elles seront incluses dans le prochain export.', 'Confirmer', false).then(ok => {
    if (!ok) return;
    pieces().filter(p => p.exportCompta).forEach(p => { delete p.exportCompta; Store.upsert('factures', p); });
    App.render();
  }));
  on('#cp-mail', () => envoyerComptable(pieces(), ecr(), periode(), nomFichierCompta, ps => marquer(ps, 'E-mail')));
  on('#cc-save', async () => {
    const cfg = { ...comptaCfg(), auxiliaires: q('#cc-aux').checked };
    root.querySelectorAll('[data-cc]').forEach(el => { cfg[el.dataset.cc] = el.value.trim(); });
    try { await Store.saveSettings({ ...Store.data.settings, compta: cfg }); App.render(); App.toast('Paramètres comptables enregistrés'); }
    catch (e) { notify(e.message); }
  });
};

// Envoi au cabinet comptable : journal (Excel + CSV) et, au choix, les PDF des pièces
async function envoyerComptable(pieces, ecr, periode, nomFichierCompta, apres) {
  const me = await api('GET', '/api/me').catch(() => Store.me), c = comptaCfg();
  const m365 = me.m365 && me.email;
  const box = Modal.open(`<h2 style="margin-top:0">Envoyer au comptable</h2>
    <div class="field"><label for="ec-to">Destinataire</label><input id="ec-to" type="email" value="${esc(c.emailComptable)}" placeholder="cabinet@exemple.fr"></div>
    <div class="field"><label for="ec-objet">Objet</label><input id="ec-objet" value="${esc(`${Store.data.settings.societe} – journal des ventes du ${periode}`)}"></div>
    <div class="field"><label for="ec-corps">Message</label><textarea id="ec-corps" rows="7">${esc(`Bonjour,\n\nVeuillez trouver ci-joint le journal des ventes du ${periode} : ${pieces.length} pièce(s) (${pieces.filter(estAvoir).length} avoir(s)), chiffre d'affaires ${eur(sumBy(pieces, x => Calc.facture(x).ht))} HT.\n\nCordialement,\n${me.nom || ''}`)}</textarea></div>
    <label class="check"><input type="checkbox" id="ec-pdf" ${pieces.length <= 15 ? 'checked' : ''}> Joindre les PDF des ${pieces.length} facture(s) et avoir(s)${pieces.length > 15 ? ' (volumineux)' : ''}</label>
    <p class="muted small">${m365 ? `Envoi par Microsoft 365 depuis ${esc(me.email)} (copie dans vos éléments envoyés).` : 'Brouillon Outlook avec les pièces jointes (Microsoft 365 non configuré).'}</p>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ec-annuler">Annuler</button><button id="ec-ok">Envoyer</button></div>`);
  box.querySelector('#ec-annuler').onclick = Modal.close;
  box.querySelector('#ec-ok').onclick = async () => {
    const to = box.querySelector('#ec-to').value.trim();
    if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(to)) return notify('Adresse e-mail du comptable invalide.');
    const btn = box.querySelector('#ec-ok'); btn.disabled = true; btn.textContent = 'Préparation…';
    try {
      const pj = [{ nom: nomFichierCompta('xlsx'), bytes: exportXLSX(ecr, `Journal des ventes du ${periode}`), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { nom: nomFichierCompta('csv'), bytes: new TextEncoder().encode(exportCSV(ecr)), type: 'text/csv' }];
      if (box.querySelector('#ec-pdf').checked) for (const p of pieces) pj.push({ nom: nomFichier(`${estAvoir(p) ? 'Avoir' : 'Facture'} ${p.numero}`), bytes: await PDF.depuisHTML(factureDocument(p), p.numero), type: 'application/pdf' });
      const subject = box.querySelector('#ec-objet').value, html = Mails.html(box.querySelector('#ec-corps').value);
      if (m365) await api('POST', '/api/mail', { to: [to], cc: [], subject, html, type: 'compta', numero: periode, attachments: pj.map(p => ({ name: p.nom, base64: enBase64(p.bytes) })) });
      else download('envoi-comptable.eml', brouillonEML({ to: [to], cc: [], subject, html, pieces: pj }), 'message/rfc822');
      if (!c.emailComptable && Store.can('admin')) await Store.saveSettings({ ...Store.data.settings, compta: { ...c, emailComptable: to } }).catch(() => {});
      Modal.close(); App.toast(m365 ? `Journal envoyé à ${to}` : 'Brouillon téléchargé : ouvrez-le dans Outlook.', 4000);
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
