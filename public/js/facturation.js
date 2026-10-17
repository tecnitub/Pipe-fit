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
    <a href="#/situations" class="${active === 'situations' ? 'active' : ''}">Situations de travaux ${attente ? `<span class="count">${attente} en attente</span>` : ''}</a>
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
  const a = affaireOf(affaireId), rg = retenueChantier(a);
  return Store.upsert('situations', { numero: '', affaireId, devisId: dv.id, date: isoDate(new Date()), statut: 'Brouillon', avancements: {}, factureId: '', commentaire: '',
    retenue: rg > 0, retenuePct: rg || num(a.retenueGarantie) || 5, saisie: 'pct' });
}

function facturerSituation(sit) {
  const dv = Store.get('devis', sit.devisId), c = Calc.situation(sit), s = Store.data.settings;
  const lignes = [];
  c.rows.forEach(r => {
    if (r.chap) { lignes.push({ type: 'chapitre', titre: r.titre, niveau: r.niveau }); return; }
    if (Math.abs(r.montant) >= 0.005) lignes.push({ num: r.num || '', designation: `${r.designation} – avancement ${fmt(r.prec, 1)} % → ${fmt(r.cumul, 1)} %`, unite: '', qte: 1, pu: r2(r.montant), tva: r.tva });
  });
  const f = Store.upsert('factures', {
    numero: '', situationId: sit.id, devisId: dv.id, affaireId: sit.affaireId, clientId: docClientId(dv), contactId: dv.contactId || '', siteId: dv.siteId || '', chargeId: docChargeId(dv) || '',
    objet: `${dv.objet || ''} – situation n° ${situationRang(sit)}`, date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))), statut: 'Émise',
    lignes: Calc.sansChapitresVides(lignes), ajustements: [], zoneId: '',
    retenuePct: c.retenuePct, ...champsTVA(dv),
  });
  Object.assign(sit, { statut: 'Acceptée', factureId: f.id, dateValidation: isoDate(new Date()) });
  Store.upsert('situations', sit);
  return f;
}

/* ---------- Onglet Situations : par chantier, ou toutes les situations ---------- */
const FILTRES_SITUATIONS = { q: '', client: '', charge: '', statut: '' };
const chantiersASituation = () => Store.all('affaires').filter(a => !a.archive && !estHorsDevis(a) && a.statut !== 'Clos' && Store.all('devis').some(d => d.affaireId === a.id && d.statut === 'Accepté'));
const ETAPES_SITUATION = [['Brouillon', '✏️ Saisie'], ['Proposée', '✉️ Envoyée'], ['Acceptée', '✅ Validée'], ['Facturée', '🧾 Facturée']];
function situationsTabs(actif) {
  const attente = Store.all('situations').filter(s => s.statut === 'Proposée').length;
  return `<div class="tabs"><a href="#/situations" class="${actif === 'chantiers' ? 'active' : ''}">Par chantier</a>
    <a href="#/situations?vue=liste" class="${actif === 'liste' ? 'active' : ''}">Toutes les situations ${attente ? `<span class="count">${attente} en attente de validation</span>` : ''}</a>
    <a href="#/factures">Factures et avoirs</a></div>`;
}
// Bilan d'un chantier : marché, cumul validé, retenues, situation en cours
function bilanSituations(a) {
  const dv = Store.all('devis').find(d => d.affaireId === a.id && d.statut === 'Accepté');
  const sits = dv ? situationsDe(dv.id) : [], validees = sits.filter(s => s.statut === 'Acceptée');
  const derniere = validees[validees.length - 1], c = derniere ? Calc.situation(derniere) : null;
  const marche = dv ? Calc.situation({ devisId: dv.id, affaireId: a.id, avancements: {} }).marche : 0;
  const retenues = sumBy(validees.map(s => Store.get('factures', s.factureId)).filter(Boolean), f => Calc.doc(f).retenue);
  return { dv, sits, validees, marche, cumul: c ? c.cumul : 0, pct: c && marche ? c.cumul / marche * 100 : 0, retenues, enCours: sits.find(s => s.statut === 'Brouillon' || s.statut === 'Proposée') };
}

Views.situations = (params, query) => {
  if (params[0]) return situationEditor(params[0]);
  const vueListe = query.get('vue') === 'liste' || ['q', 'client', 'charge', 'statut'].some(k => query.has(k));
  if (!vueListe) {
    const chantiers = chantiersASituation();
    return `<h1>Situations de travaux</h1>${situationsTabs('chantiers')}
    <p class="muted">Facturez à l'avancement : choisissez les lignes et le pourcentage (ou la quantité) réalisé, envoyez la situation par e-mail ; dès qu'elle est validée, la facture est créée et prête à partir.</p>
    ${chantiers.length ? `<div class="sit-chantiers">${chantiers.map(a => {
      const b = bilanSituations(a), rg = retenueChantier(a);
      return `<div class="card sit-ch">
        <div class="sit-ch-tete"><a href="#/chantier/${a.id}"><strong>${esc(a.code || '')}</strong> ${esc(a.nom || '')}</a><span class="muted small">${esc(clientName(a.clientId))}</span></div>
        <div class="sit-ch-chiffres"><span>Marché <strong>${eur(b.marche)}</strong></span><span>Facturé <strong>${eur(b.cumul)}</strong> (${pct(b.pct)})</span><span>Reste <strong>${eur(b.marche - b.cumul)}</strong></span></div>
        ${gauge(b.cumul, b.marche)}
        <div class="small muted">${b.validees.length} situation(s) validée(s) · retenue ${a.caution ? 'remplacée par une caution' : rg ? `${fmt(rg, 1)} % · ${eur(b.retenues)} retenus` : 'aucune'}</div>
        <div class="toolbar" style="margin:8px 0 0">${b.enCours ? `<a class="btn" href="#/situations/${b.enCours.id}">Reprendre la situation n° ${situationRang(b.enCours)} ${badge(b.enCours.statut)}</a>`
          : b.pct >= 99.995 ? '<span class="badge b-ok">Marché entièrement facturé</span>' : `<button data-nouvelle="${a.id}">+ Situation n° ${b.sits.length + 1}</button>`}</div></div>`;
    }).join('')}</div>` : '<p class="muted">Aucun chantier avec un devis accepté.</p>'}`;
  }
  const f = lireFiltres('situations', query, FILTRES_SITUATIONS);
  const list = Store.all('situations').filter(s => { const a = affaireOf(s.affaireId); return (!f.statut || s.statut === f.statut) && (!f.client || a.clientId === f.client) && (!f.charge || a.chargeId === f.charge)
    && correspond(f.q, s.numero, a.code, a.nom, clientName(a.clientId)); }).sort((a, b) => (b.numero || '~').localeCompare(a.numero || '~'));
  return `<h1>Situations de travaux</h1>${situationsTabs('liste')}
  ${barreFiltres(f, { clients: [...new Set(Store.all('situations').map(s => affaireOf(s.affaireId).clientId))], statuts: [['', 'Tous statuts'], ...STATUTS_SITUATION.map(s => [s, s === 'Acceptée' ? 'Validée' : s])], defauts: FILTRES_SITUATIONS })}
  ${list.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Chantier</th><th>Client</th><th>Statut</th><th class="num">Avancement cumulé</th><th class="num">Situation HT</th><th class="num">Retenue</th><th class="num">Net à payer TTC</th><th>Facture</th></tr>
  ${list.map(s => {
    const c = Calc.situation(s), a = affaireOf(s.affaireId), fa = Store.get('factures', s.factureId);
    return `<tr class="clickable" onclick="location.hash='#/situations/${s.id}'"><td><strong>${esc(s.numero || '…')}</strong> <span class="muted small">n° ${situationRang(s)}</span></td><td>${dateFr(s.date)}</td>
      <td>${esc(affaireLabel(a))}</td><td>${esc(clientName(a.clientId))}</td><td>${badgeSituation(s)}</td><td class="num">${pct(c.pctCumul)}</td><td class="num">${eur(c.montant)}</td>
      <td class="num">${c.retenue ? `${fmt(c.retenuePct, 1)} %` : '—'}</td><td class="num">${eur(c.netAPayer)}</td><td>${fa ? `<a href="#/facture/${fa.id}" onclick="event.stopPropagation()">${esc(fa.numero || '…')}</a>` : ''}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucune situation.</p>'}`;
};
const badgeSituation = s => (s.statut === 'Acceptée' ? `<span class="badge b-ok">Validée${s.factureId ? ' · facturée' : ''}</span>` : badge(s.statut));

/* ---------- Éditeur de situation ---------- */
const situationSel = { id: '', lignes: new Set() };
const MODES_SAISIE = [['pct', '% cumulé'], ['qte', 'Quantités réalisées'], ['montant', 'Montant HT cumulé']];
function situationEditor(id) {
  const sit = Store.get('situations', id);
  if (!sit) return '<p>Situation introuvable. <a href="#/situations">Retour</a></p>';
  if (situationSel.id !== id) Object.assign(situationSel, { id, lignes: new Set() });
  const c = Calc.situation(sit), a = affaireOf(sit.affaireId), dv = Store.get('devis', sit.devisId) || {};
  const edit = sit.statut === 'Brouillon', mode = sit.saisie || 'pct';
  const f = Store.get('factures', sit.factureId), bureau = ['admin', 'charge'].includes(Store.me.role);
  const doc = blDocument(sit, c, a, dv);
  const etape = f ? 3 : ['Brouillon', 'Proposée', 'Acceptée'].indexOf(sit.statut);
  const rgDefaut = retenueChantier(a);
  // Totaux « cette situation » par chapitre (affichés sur la ligne du chapitre)
  const totChap = c.rows.map((r, i) => {
    if (!r.chap) return 0;
    let t = 0;
    for (let k = i + 1; k < c.rows.length && !(c.rows[k].chap && (c.rows[k].niveau || 1) <= (r.niveau || 1)); k++) if (!c.rows[k].chap) t += c.rows[k].montant;
    return t;
  });
  const saisie = r => {
    if (!edit) return mode === 'qte' && r.qte ? `${fmt(r.cumul / 100 * r.qte, 2)} ${esc(r.unite)}` : mode === 'montant' ? eur(r.montantCumul) : `${fmt(r.cumul, 1)} %`;
    if (mode === 'qte' && r.qte) return `<input data-qte="${r.key}" type="number" step="any" min="${r2(r.prec / 100 * r.qte)}" max="${r.qte}" value="${r2(r.cumul / 100 * r.qte)}" aria-label="Quantité réalisée cumulée"> <span class="small muted">/ ${fmt(r.qte, 2)} ${esc(r.unite)}</span>`;
    if (mode === 'montant') return `<input data-mt="${r.key}" type="number" step="0.01" min="${r2(r.montantPrec)}" max="${r2(r.marche)}" value="${r2(r.montantCumul)}" aria-label="Montant cumulé HT">`;
    return `<input data-av="${r.key}" type="number" min="${r.prec}" max="100" step="any" value="${r.cumul}" aria-label="Avancement cumulé en %"> %`;
  };
  return `<div class="toolbar">
    <a href="#/situations" class="btn secondary">← Situations</a>
    <a href="#/chantier/${sit.affaireId}" class="btn secondary">Chantier ${esc(a.code || '')}</a>
    <span class="spacer"></span>
    <button class="secondary print-btn" onclick="window.print()">Imprimer</button>${boutonsEnvoi('situation', sit.id, 'Envoyer la situation')}
    ${f ? `<a class="btn secondary" href="#/facture/${f.id}">Facture ${esc(f.numero || '…')}</a>` : ''}
    ${sit.statut !== 'Acceptée' ? '<button class="danger" id="del">Supprimer</button>' : ''}
  </div>
  <h1 class="no-print">Situation n° ${situationRang(sit)} · ${esc(sit.numero || '')} ${badgeSituation(sit)}</h1>${envoisHtml('situations', sit.id)}
  <ol class="sit-etapes no-print">${ETAPES_SITUATION.map(([, l], i) => `<li class="${i < etape || (i === etape && f) ? 'fait' : i === etape ? 'ici' : ''}">${l}</li>`).join('')}</ol>
  <div class="card no-print sit-action">
    ${sit.statut === 'Brouillon' ? `<div><strong>1. Saisissez l'avancement</strong> des lignes à facturer, puis envoyez la situation à ${a.moeId ? 'la maîtrise d\'œuvre' : 'votre client'} pour validation.</div>
      <div class="toolbar" style="margin:8px 0 0">${bureau ? '<button id="envoyer">✉ Envoyer la situation par e-mail</button>' : ''}<button class="secondary" id="proposer">Marquer comme envoyée (sans e-mail)</button></div>`
    : sit.statut === 'Proposée' ? `<div><strong>2. En attente de validation</strong>${sit.dateEnvoi ? ` depuis le ${dateFr(sit.dateEnvoi)}` : ''}. Dès que ${a.moeId ? 'la maîtrise d\'œuvre' : 'le client'} valide, la facture est créée et l'e-mail préparé.</div>
      <div class="toolbar" style="margin:8px 0 0"><button id="accepter">✔ Situation validée : facturer</button><button class="secondary" id="refuser">Refusée</button><button class="secondary" id="brouillon">Corriger (repasser en saisie)</button></div>`
    : sit.statut === 'Refusée' ? `<div><strong>Situation refusée.</strong> Corrigez l'avancement puis renvoyez-la.</div><div class="toolbar" style="margin:8px 0 0"><button class="secondary" id="brouillon">Corriger (repasser en saisie)</button></div>`
    : `<div><strong>Situation validée${sit.dateValidation ? ` le ${dateFr(sit.dateValidation)}` : ''}</strong>${f ? ` · facture ${esc(f.numero || '…')} : net à payer ${eur(Calc.doc(f).netAPayer)}` : ''}.</div>
      ${f ? `<div class="toolbar" style="margin:8px 0 0"><a class="btn secondary" href="#/facture/${f.id}">Voir la facture</a>${boutonsEnvoi('facture', f.id, 'Envoyer la facture', false)}</div>` : ''}`}
  </div>
  ${a.okFacturation ? `<p class="note">Réception signée le ${dateFr(a.dateReception)} : feu vert pour facturer le solde des travaux.</p>` : ''}

  <div class="cards">
    <div class="card"><div class="label">Marché HT</div><div class="value">${eur(c.marche)}</div><div class="sub">Devis ${esc(dv.numero || '')}</div></div>
    <div class="card"><div class="label">Avancement cumulé</div><div class="value">${pct(c.pctCumul)}</div>${gauge(c.cumul, c.marche)}<div class="sub">${eur(c.cumul)} · précédent ${pct(c.pctPrec)}${c.prev ? ` (${esc(c.prev.numero)})` : ''}</div></div>
    <div class="card"><div class="label">Cette situation</div><div class="value">${eur(c.montant)} <span class="small muted">HT</span></div><div class="sub">${eur(c.ttc)} TTC · reste ${eur(c.marche - c.cumul)} HT</div></div>
    <div class="card"><div class="label">Net à payer</div><div class="value">${eur(c.netAPayer)}</div><div class="sub">${c.retenue ? `retenue de garantie ${fmt(c.retenuePct, 1)} % : − ${eur(c.retenue)}` : 'sans retenue de garantie'}</div></div>
  </div>

  <div class="card no-print">
    <div class="grid2">
      <div class="field"><label for="s-date">Situation arrêtée au</label><input id="s-date" type="date" value="${esc(sit.date)}" ${edit ? '' : 'disabled'}></div>
      <div class="field"><label for="s-com">Commentaire (imprimé sur la situation)</label><input id="s-com" value="${esc(sit.commentaire)}" ${edit ? '' : 'disabled'}></div>
    </div>
    <div class="sit-rg">
      <label class="check"><input type="checkbox" id="s-rg" ${c.retenuePct > 0 ? 'checked' : ''} ${edit ? '' : 'disabled'}> Retenue de garantie</label>
      <input id="s-rgpct" type="number" min="0" max="10" step="0.5" value="${esc(sit.retenuePct ?? (rgDefaut || 5))}" ${edit && c.retenuePct > 0 ? '' : 'disabled'} aria-label="Taux de retenue"> %
      <span class="muted small">${a.caution ? 'Le chantier est couvert par une caution bancaire : normalement sans retenue.' : rgDefaut ? `Taux du chantier : ${fmt(rgDefaut, 1)} % (5 % maximum, loi du 16 juillet 1971).` : 'Pas de retenue prévue sur le chantier.'}</span>
    </div>
    ${edit ? `<div class="sit-mode"><span class="small">Saisir en :</span><div class="seg" role="group" aria-label="Mode de saisie">${MODES_SAISIE.map(([k, l]) => `<button type="button" data-mode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="sit-sel" id="sit-sel">
      <span id="sel-info" class="small"></span>
      <label class="inline small">Mettre à <input id="sel-pct" type="number" min="0" max="100" step="any" style="width:76px"> % cumulé</label><button class="secondary small" id="sel-fixer">Appliquer</button>
      <label class="inline small">Ajouter <input id="sel-plus" type="number" min="0" max="100" step="any" style="width:76px"> %</label><button class="secondary small" id="sel-ajouter">Ajouter</button>
      <button class="secondary small" id="sel-solder">Solder (100 %)</button><button class="secondary small" id="sel-annuler">Rien cette fois</button>
    </div>` : ''}
  </div>

  <div class="table-wrap no-print" style="margin-top:12px"><table class="sit-table">
    <tr>${edit ? '<th class="sel-cell"><input type="checkbox" id="sel-tout" aria-label="Tout cocher"></th>' : ''}<th>N°</th><th>Désignation</th><th class="num">Marché HT</th><th class="num">% préc.</th><th class="num">${MODES_SAISIE.find(m => m[0] === mode)[1]}</th><th class="num">% cumulé</th><th class="num">Cette situation HT</th></tr>
    ${c.rows.map((r, i) => r.chap ? `<tr class="chap niv-${r.niveau || 1}">${edit ? `<td class="sel-cell"><input type="checkbox" data-selchap="${i}" aria-label="Cocher le chapitre"></td>` : ''}<td>${esc(r.num || '')}</td><td colspan="5">${esc(r.titre)}</td><td class="num">${totChap[i] ? eur(totChap[i]) : ''}</td></tr>`
      : `<tr class="${r.montant > 0.004 ? 'sit-facturee' : ''}">${edit ? `<td class="sel-cell"><input type="checkbox" data-sel="${r.key}" data-row="${i}" ${situationSel.lignes.has(r.key) ? 'checked' : ''} aria-label="Cocher la ligne"></td>` : ''}<td class="muted small">${esc(r.num || '')}</td>
        <td>${esc(r.designation)}${r.qte ? `<div class="muted small">${fmt(r.qte, 2)} ${esc(r.unite)}</div>` : ''}</td><td class="num">${eur(r.marche)}</td><td class="num muted">${fmt(r.prec, 1)} %</td>
        <td class="num sit-saisie">${saisie(r)}</td><td class="num">${fmt(r.cumul, 1)} %<div class="sit-barre"><span style="width:${Math.min(100, r.prec)}%"></span><span class="nouv" style="width:${Math.max(0, Math.min(100, r.cumul) - r.prec)}%"></span></div></td><td class="num"><strong>${r.montant > 0.004 ? eur(r.montant) : '—'}</strong></td></tr>`).join('')}
    <tr class="subtotal">${edit ? '<td></td>' : ''}<td></td><td>Total</td><td class="num">${eur(c.marche)}</td><td class="num">${pct(c.pctPrec)}</td><td></td><td class="num">${pct(c.pctCumul)}</td><td class="num">${eur(c.montant)}</td></tr>
  </table></div>

  <details class="no-print preview"><summary>Aperçu de la situation (document envoyé)</summary><div class="doc-print">${doc}</div></details>
  <div class="print-only doc-print">${doc}</div>`;
}

function blDocument(sit, c, a, dv) {
  const s = Store.data.settings;
  const dest = a.moeId ? entreprise(a.moeId) : entreprise(a.clientId);
  const destContact = Store.get('contacts', a.moeId ? a.moeContactId : a.contactId);
  const bill = billingSite(a.moeId || a.clientId), site = siteOf(a.clientId, a.siteId);
  const o = Doc.t('situation');
  const nums = c.rows.some(r => r.num);
  const cols = [nums && ['N°', r => esc(r.num || ''), ''], ['Désignation', r => esc(r.designation), 'Total'], o.marche && ['Marché HT', r => eur(r.marche), eur(c.marche)], ['% cumulé', r => `${fmt(r.cumul, 1)} %`, pct(c.pctCumul)],
    o.precedent && ['Cumulé HT', r => eur(r.montantCumul), eur(c.cumul)], o.precedent && ['Précédent HT', r => eur(r.montantPrec), eur(c.precedent)], ['Situation HT', r => eur(r.montant), eur(c.montant)]].filter(Boolean);
  return `${Doc.entete('situation', `${o.titre} N° ${situationRang(sit)}`, `N° ${esc(sit.numero || '…')} arrêtée au ${dateFr(sit.date)}<br>Chantier ${esc(a.code || '')} · Devis ${esc(dv.numero || '')}`)}
    <div class="doc-parties"><div>${a.moeId ? 'Maîtrise d\'œuvre' : 'Client'} : <strong>${esc(dest.nom || '—')}</strong>${bill ? `<br>${esc(fullAddress(bill))}` : ''}${destContact ? `<br>À l'attention de ${esc(contactName(destContact))}${destContact.fonction ? `, ${esc(destContact.fonction)}` : ''}` : ''}</div>
    <div>${o.maitreOuvrage ? `Maître d'ouvrage : <strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)} – ${esc(fullAddress(site))}` : ''}` : ''}</div></div>
    <p class="doc-objet"><strong>Objet :</strong> ${esc(dv.objet || a.nom)} – avancement des travaux au ${dateFr(sit.date)}</p>
    ${Doc.intro('situation')}${sit.commentaire ? `<p>${esc(sit.commentaire)}</p>` : ''}
    <div class="table-wrap"><table class="doc-lines${cols.length < 5 ? ' compact' : ''}"><tr>${cols.map((k, i) => `<th${i ? ' class="num"' : ''}>${k[0]}</th>`).join('')}</tr>
    ${c.rows.map(r => r.chap ? `<tr class="chap niv-${r.niveau || 1}">${nums ? `<td>${esc(r.num || '')}</td><td colspan="${cols.length - 1}">` : `<td colspan="${cols.length}">`}${esc(r.titre)}</td></tr>`
      : `<tr>${cols.map((k, i) => `<td${i ? ' class="num"' : ''}>${k[1](r)}</td>`).join('')}</tr>`).join('')}
    <tr class="subtotal">${cols.map((k, i) => `<td${i && k[0] !== 'Désignation' ? ' class="num"' : ''}>${k[2]}</td>`).join('')}</tr></table></div>
    <table class="totals"><tr><td>Montant de la situation HT</td><td class="num">${eur(c.montant)}</td></tr>
      <tr><td>${c.autoliquidation ? 'TVA autoliquidée (art. 283-2 nonies du CGI)' : 'TVA'}</td><td class="num">${eur(c.tva)}</td></tr>
      <tr class="${c.retenue ? '' : 'grand'}"><td>Montant TTC</td><td class="num">${eur(c.ttc)}</td></tr>
      ${c.retenue ? `<tr><td>Retenue de garantie ${fmt(c.retenuePct, 1)} %</td><td class="num">− ${eur(c.retenue)}</td></tr>
      <tr class="grand"><td>Net à payer TTC</td><td class="num">${eur(c.netAPayer)}</td></tr>` : ''}</table>
    ${mentionsTVA(dv)}
    ${Doc.pied('situation', '', o.signature ? `<div class="signatures"><div>Pour ${esc(s.societe)}<br>${esc(userName(a.chargeId))}</div><div>Bon pour accord de la maîtrise d'œuvre<br>Date et signature :</div></div>` : '')}`;
}

Views.situations.bind = (root, params, query) => {
  if (!params[0]) {
    if (query.get('vue') === 'liste' || ['q', 'client', 'charge', 'statut'].some(k => query.has(k))) bindFiltres(root, 'situations', lireFiltres('situations', query, FILTRES_SITUATIONS), FILTRES_SITUATIONS);
    root.querySelectorAll('[data-nouvelle]').forEach(b => b.onclick = () => { const s = nouvelleSituation(b.dataset.nouvelle); if (s) location.hash = `#/situations/${s.id}`; });
    return;
  }
  const sit = Store.get('situations', params[0]);
  if (!sit) return;
  const save = () => { Store.upsert('situations', sit); App.render(); };
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const c = Calc.situation(sit), ligne = k => c.rows.find(r => r.key === k);
  // Avancement cumulé d'une ligne, borné entre la situation précédente et 100 %
  const fixer = (k, v) => { const r = ligne(k); if (!r) return; sit.avancements = { ...(sit.avancements || {}), [k]: Math.round(Math.max(r.prec, Math.min(100, v)) * 10000) / 10000 }; };
  const borne = (el, v) => { if (v < num(el.min) - 1e-9) App.toast('On ne peut pas descendre sous la situation précédente.', 3500); };
  root.querySelectorAll('[data-av]').forEach(el => el.onchange = () => { borne(el, num(el.value)); fixer(el.dataset.av, num(el.value)); save(); });
  root.querySelectorAll('[data-qte]').forEach(el => el.onchange = () => { const r = ligne(el.dataset.qte); borne(el, num(el.value)); fixer(r.key, num(el.value) / r.qte * 100); save(); });
  root.querySelectorAll('[data-mt]').forEach(el => el.onchange = () => { const r = ligne(el.dataset.mt); borne(el, num(el.value)); fixer(r.key, r.marche ? num(el.value) / r.marche * 100 : 0); save(); });
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { sit.saisie = b.dataset.mode; save(); });

  // Lignes cochées (ou chapitres entiers) : pourcentage appliqué en une fois
  const sel = situationSel.lignes;
  const majSel = () => {
    const info = root.querySelector('#sel-info');
    if (info) info.innerHTML = sel.size ? `<strong>${sel.size} ligne${sel.size > 1 ? 's' : ''} cochée${sel.size > 1 ? 's' : ''}</strong> :` : 'Cochez des lignes ou des chapitres, ou appliquez à <strong>toutes les lignes</strong> :';
    root.querySelectorAll('[data-selchap]').forEach(cb => {
      const ks = clesChapitre(+cb.dataset.selchap);
      cb.checked = ks.length > 0 && ks.every(k => sel.has(k)); cb.indeterminate = !cb.checked && ks.some(k => sel.has(k));
    });
  };
  const clesChapitre = i => {
    const r0 = c.rows[i], out = [];
    for (let k = i + 1; k < c.rows.length && !(c.rows[k].chap && (c.rows[k].niveau || 1) <= (r0.niveau || 1)); k++) if (!c.rows[k].chap) out.push(c.rows[k].key);
    return out;
  };
  root.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => { if (cb.checked) sel.add(cb.dataset.sel); else sel.delete(cb.dataset.sel); majSel(); });
  root.querySelectorAll('[data-selchap]').forEach(cb => cb.onchange = () => {
    clesChapitre(+cb.dataset.selchap).forEach(k => { if (cb.checked) sel.add(k); else sel.delete(k); const x = root.querySelector(`[data-sel="${k}"]`); if (x) x.checked = cb.checked; });
    majSel();
  });
  const tout = root.querySelector('#sel-tout');
  if (tout) tout.onchange = () => { c.rows.filter(r => !r.chap).forEach(r => { if (tout.checked) sel.add(r.key); else sel.delete(r.key); }); root.querySelectorAll('[data-sel]').forEach(x => { x.checked = tout.checked; }); majSel(); };
  majSel();
  const cibles = () => (sel.size ? [...sel] : c.rows.filter(r => !r.chap).map(r => r.key));
  const appliquer = fn => { cibles().forEach(k => fixer(k, fn(ligne(k)))); save(); };
  on('#sel-fixer', () => { const v = root.querySelector('#sel-pct').value; if (v === '') return notify('Indiquez le pourcentage cumulé.'); appliquer(() => num(v)); });
  on('#sel-ajouter', () => { const v = root.querySelector('#sel-plus').value; if (v === '') return notify('Indiquez le pourcentage à ajouter.'); appliquer(r => r.cumul + num(v)); });
  on('#sel-solder', () => appliquer(() => 100));
  on('#sel-annuler', () => appliquer(r => r.prec));

  // Retenue de garantie cochée sur la situation
  const rg = root.querySelector('#s-rg'), rgp = root.querySelector('#s-rgpct');
  if (rg) rg.onchange = () => { sit.retenue = rg.checked; if (rg.checked && !num(sit.retenuePct)) sit.retenuePct = retenueChantier(affaireOf(sit.affaireId)) || 5; save(); };
  if (rgp) rgp.onchange = () => { const v = num(rgp.value); if (v > 5) App.toast('Au-delà de 5 %, la retenue de garantie n\'est pas conforme à la loi du 16 juillet 1971.', 5000); sit.retenue = v > 0; sit.retenuePct = v; save(); };
  const d = root.querySelector('#s-date'); if (d) d.onchange = () => { sit.date = d.value; save(); };
  const cm = root.querySelector('#s-com'); if (cm) cm.onchange = () => { sit.commentaire = cm.value; save(); };

  // Envoi, validation, facture
  const montantOk = () => { if (Calc.situation(sit).montant <= 0) { notify('Le montant de cette situation est nul : saisissez l\'avancement des lignes à facturer.'); return false; } return true; };
  on('#envoyer', async () => {
    if (!montantOk()) return;
    if (!sit.numero) await Store.attendre('situations', sit.id);
    envoyerParMail('situation', sit.id);
  });
  on('#proposer', () => { if (!montantOk()) return; Object.assign(sit, { statut: 'Proposée', dateEnvoi: isoDate(new Date()) }); save(); App.toast('Situation marquée comme envoyée.'); });
  on('#accepter', async () => {
    const cs = Calc.situation(sit);
    if (!await ask(`${affaireOf(sit.affaireId).moeId ? 'La maîtrise d\'œuvre' : 'Le client'} a validé la situation ${sit.numero} (${eur(cs.montant)} HT, net à payer ${eur(cs.netAPayer)}). Créer la facture et préparer l'e-mail ?`, 'Facturer', false)) return;
    const f = facturerSituation(sit);
    location.hash = `#/facture/${f.id}`;
    await Store.attendre('factures', f.id);
    App.toast(`Facture ${f.numero || ''} créée`, 3000);
    if (['admin', 'charge'].includes(Store.me.role)) envoyerParMail('facture', f.id);
  });
  on('#refuser', () => { sit.statut = 'Refusée'; save(); });
  on('#brouillon', () => { sit.statut = 'Brouillon'; save(); });
  on('#del', () => ask(`Supprimer la situation ${sit.numero} ?`, 'Supprimer').then(ok => { if (ok) { Store.remove('situations', sit.id); location.hash = '#/situations'; } }));
};
