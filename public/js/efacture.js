// Facturation électronique (réforme 2026) : réception des factures fournisseurs depuis la plateforme agréée
// (Factur-X, CII, UBL) et intégration en facture fournisseur ventilée ; émission de nos factures au format
// structuré CII (EN 16931) et en PDF Factur-X, déposées dans le dossier d'envoi de la plateforme.
const xmlEsc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const UNITES_CEFACT = { u: 'C62', unite: 'C62', pce: 'C62', ml: 'MTR', m: 'MTR', h: 'HUR', heure: 'HUR', kg: 'KGM', t: 'TNE', m2: 'MTK', 'm²': 'MTK', m3: 'MTQ', 'm³': 'MTQ', l: 'LTR', jour: 'DAY', j: 'DAY', semaine: 'WEE', forfait: 'LS', ens: 'LS', ensemble: 'LS' };
const uniteCefact = u => UNITES_CEFACT[normRecherche(u).replace(/\s/g, '')] || 'C62';
const montant = v => (Math.round(v * 100) / 100).toFixed(2);
const sirenDe = s => String(s || '').replace(/\D/g, '').slice(0, 9);

/* ---------- Émission : XML CII (Factur-X, profil EN 16931) ---------- */
function genererCII(f) {
  const s = Store.data.settings, c = Doc.cfg(), avoir = f.type === 'avoir', taux = num(s.tva);
  const cid = docClientId(f), cl = entreprise(cid), bill = billingSite(cid) || {}, site = siteOf(cid, f.siteId);
  const a = affaireOf(f.affaireId), orig = avoir ? Store.get('factures', f.factureId) : null, t = Calc.doc(f);
  const lignes = (f.lignes || []).filter(l => Calc.estPrix(l));
  const totLignes = lignes.reduce((x, l) => x + Math.round(Calc.ligneHT(l) * 100) / 100, 0);
  // Remises / majorations globales et livraison en remises et frais de pied de facture
  const ajust = (t.ajust || []).map(x => ({ charge: x.montant > 0, montant: Math.abs(Math.round(x.montant * 100) / 100), motif: x.libelle || (x.montant > 0 ? 'Majoration' : 'Remise') }));
  if (t.livraison) ajust.push({ charge: true, montant: Math.round(t.livraison * 100) / 100, motif: 'Livraison' });
  const charges = ajust.filter(x => x.charge).reduce((x, y) => x + y.montant, 0), remises = ajust.filter(x => !x.charge).reduce((x, y) => x + y.montant, 0);
  const base = totLignes + charges - remises, tva = Math.round(base * taux) / 100, ttc = base + tva;
  const d102 = d => `<udt:DateTimeString format="102">${String(d || '').replace(/-/g, '')}</udt:DateTimeString>`;
  const adresse = x => `<ram:PostalTradeAddress>${x.adresse ? `<ram:LineOne>${xmlEsc(x.adresse)}</ram:LineOne>` : ''}${x.cp ? `<ram:PostcodeCode>${xmlEsc(x.cp)}</ram:PostcodeCode>` : ''}${x.ville ? `<ram:CityName>${xmlEsc(x.ville)}</ram:CityName>` : ''}<ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`;
  const sAdr = /^(.*?)\s*[–-]\s*(\d{5})\s+(.+)$/.exec(s.adresse || '') || [];
  const notes = [avoir && f.motif ? `Motif de l'avoir : ${f.motif}` : '', t.retenue ? `Retenue de garantie ${fmt(f.retenuePct, 1)} % : ${montant(t.retenue)} EUR – net à payer ${montant(t.netAPayer)} EUR` : '',
    'Catégorie de l\'opération : prestation de services', a.code ? `Chantier ${a.code} – ${a.nom}` : ''].filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${xmlEsc(f.numero)}</ram:ID><ram:TypeCode>${avoir ? 381 : 380}</ram:TypeCode><ram:IssueDateTime>${d102(f.date)}</ram:IssueDateTime>${notes.map(n => `<ram:IncludedNote><ram:Content>${xmlEsc(n)}</ram:Content></ram:IncludedNote>`).join('')}</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lignes.map((l, i) => `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct>${l.num ? `<ram:SellerAssignedID>${xmlEsc(l.num)}</ram:SellerAssignedID>` : ''}<ram:Name>${xmlEsc(l.designation || 'Prestation')}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${(Math.round(Calc.pu(l) * 10000) / 10000).toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${uniteCefact(l.unite)}">${num(l.qte)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${taux}</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${montant(Calc.ligneHT(l))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('\n')}
<ram:ApplicableHeaderTradeAgreement>${f.refCommande ? `<ram:BuyerReference>${xmlEsc(f.refCommande)}</ram:BuyerReference>` : ''}
<ram:SellerTradeParty><ram:Name>${xmlEsc(s.societe)}</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenDe(s.siret)}</ram:ID></ram:SpecifiedLegalOrganization>${adresse({ adresse: sAdr[1] || s.adresse, cp: sAdr[2], ville: sAdr[3] })}${c.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${xmlEsc(c.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${c.tvaIntra ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xmlEsc(c.tvaIntra)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}</ram:SellerTradeParty>
<ram:BuyerTradeParty><ram:Name>${xmlEsc(cl.nom)}</ram:Name>${sirenDe(cl.siret) ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenDe(cl.siret)}</ram:ID></ram:SpecifiedLegalOrganization>` : ''}${adresse(bill)}${cl.tvaIntra ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xmlEsc(cl.tvaIntra)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}</ram:BuyerTradeParty>
${f.refCommande ? `<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${xmlEsc(f.refCommande)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>` : ''}</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>${site ? `<ram:ShipToTradeParty><ram:Name>${xmlEsc(site.libelle)}</ram:Name>${adresse(site)}</ram:ShipToTradeParty>` : ''}<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${d102(f.date)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${c.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xmlEsc(c.iban.replace(/\s/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ''}
<ram:ApplicableTradeTax><ram:CalculatedAmount>${montant(tva)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${montant(base)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:DueDateTypeCode>72</ram:DueDateTypeCode><ram:RateApplicablePercent>${taux}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
${ajust.map(x => `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>${x.charge}</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${montant(x.montant)}</ram:ActualAmount><ram:Reason>${xmlEsc(x.motif)}</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${taux}</ram:RateApplicablePercent></ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`).join('\n')}
${!avoir && f.echeance ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime>${d102(f.echeance)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>` : ''}
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${montant(totLignes)}</ram:LineTotalAmount><ram:ChargeTotalAmount>${montant(charges)}</ram:ChargeTotalAmount><ram:AllowanceTotalAmount>${montant(remises)}</ram:AllowanceTotalAmount><ram:TaxBasisTotalAmount>${montant(base)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${montant(tva)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${montant(ttc)}</ram:GrandTotalAmount><ram:DuePayableAmount>${montant(ttc)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
${orig ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${xmlEsc(orig.numero)}</ram:IssuerAssignedID><ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${String(orig.date || '').replace(/-/g, '')}</qdt:DateTimeString></ram:FormattedIssueDateTime></ram:InvoiceReferencedDocument>` : ''}
</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

// Fenêtre « Facture électronique » d'une facture ou d'un avoir
async function emettreEFacture(f) {
  const etat = await api('GET', '/api/efacture/etat').catch(() => ({}));
  const nom = `${(f.type === 'avoir' ? 'Avoir' : 'Facture')}-${f.numero}`.replace(/[^\w.-]+/g, '_');
  const cl = entreprise(docClientId(f));
  const manques = [!sirenDe(Store.data.settings.siret) && 'votre SIREN (Paramètres → Société)', !sirenDe(cl.siret) && `le SIRET du client ${cl.nom || ''}`, !f.numero && 'le numéro de la facture'].filter(Boolean);
  const box = Modal.open(`<h2 style="margin-top:0">Facture électronique ${esc(f.numero || '')}</h2>
    <p class="muted small">Depuis la réforme de 2026, les factures entre entreprises transitent par une plateforme agréée${etat.plateforme ? ` (la vôtre : <strong>${esc(etat.plateforme)}</strong>)` : ''}.
      Pipe-Fit CRM produit la facture au format structuré <strong>CII (Factur-X, profil EN 16931)</strong> et en <strong>PDF Factur-X</strong> (PDF lisible avec les données jointes), que la plateforme transmet au client.</p>
    ${manques.length ? `<p class="note warn-text">À compléter avant l'envoi : ${manques.map(esc).join(', ')}.</p>` : ''}
    <div class="toolbar">
      <button class="secondary" id="ef-xml">XML CII</button>
      <button class="secondary" id="ef-pdf">PDF Factur-X</button>
      ${etat.sortie ? '<button id="ef-depot">Déposer sur la plateforme</button>' : ''}
    </div>
    ${etat.sortie ? '' : '<p class="muted small">Pour déposer directement, configurez le dossier d\'envoi de votre plateforme (Achats → Factures électroniques → Configuration). Sinon, téléchargez les fichiers et importez-les sur votre plateforme.</p>'}
    ${f.efacture ? `<p class="small pos">Déposée le ${dateFr(f.efacture.date)} (${esc(f.efacture.mode)}).</p>` : ''}
    <div class="modal-actions"><button class="secondary" id="ef-fermer">Fermer</button></div>`);
  const q = s => box.querySelector(s);
  const pdf = () => PDF.depuisHTML(factureDocument(f), f.numero, { nom: 'factur-x.xml', xml: genererCII(f) });
  const noter = mode => { f.efacture = { date: isoDate(new Date()), mode }; Store.upsert('factures', f); };
  q('#ef-fermer').onclick = Modal.close;
  q('#ef-xml').onclick = () => { download(`${nom}.xml`, genererCII(f), 'application/xml'); };
  q('#ef-pdf').onclick = async () => { try { download(`${nom}.pdf`, await pdf(), 'application/pdf'); } catch (e) { notify(e.message); } };
  const dep = q('#ef-depot');
  if (dep) dep.onclick = async () => {
    dep.disabled = true;
    try { const r = await api('POST', '/api/efacture/emettre', { nom, xml: genererCII(f), pdfBase64: enBase64(await pdf()) }); noter('dossier plateforme'); Modal.close(); App.render(); App.toast(`Déposée : ${r.fichiers.join(', ')}`, 4000); }
    catch (e) { notify(e.message); dep.disabled = false; }
  };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-efacture]');
  if (!b) return;
  const f = Store.get('factures', b.dataset.efacture);
  if (f) emettreEFacture(f).catch(err => notify(err.message));
});

/* ---------- Réception : factures électroniques des fournisseurs ---------- */
// Fournisseur correspondant : SIREN, n° de TVA, puis raison sociale
function fournisseurDe(v) {
  const n = normRecherche(v.nom).replace(/[^a-z0-9]/g, '');
  return Store.all('entreprises').find(e => v.siren && sirenDe(e.siret) === v.siren) || Store.all('entreprises').find(e => v.tva && (e.tvaIntra || '').replace(/\s/g, '') === v.tva.replace(/\s/g, ''))
    || Store.all('entreprises').find(e => n && normRecherche(e.nom).replace(/[^a-z0-9]/g, '') === n);
}
// Imputation proposée : commande citée en référence (n° CF…), sinon n° de chantier trouvé dans la facture
function imputationProposee(ef) {
  const norm = x => String(x || '').toUpperCase().replace(/\s/g, '');
  const texte = norm([ef.refCommande, ef.refAcheteur, ...(ef.notes || []), ...(ef.lignes || []).map(l => l.designation)].join(' '));
  const cmd = Store.all('commandes').find(c => c.numero && (norm(ef.refCommande) === norm(c.numero) || texte.includes(norm(c.numero))));
  const ht = ef.type === 'avoir' ? -Math.abs(ef.totalHT) : ef.totalHT;
  if (cmd) return [{ affaireId: cmd.affaireId || '', commandeId: cmd.id, libelle: `Commande ${cmd.numero}`, montantHT: ht }];
  const af = Store.all('affaires').find(a => a.code && texte.includes(norm(a.code)));
  if (af) return [{ affaireId: af.id, commandeId: '', libelle: (ef.lignes || []).map(l => l.designation).filter(Boolean).slice(0, 2).join(', ').slice(0, 80), montantHT: ht }];
  return [];
}

const STATUTS_EF = { 'Reçue': 'b-warn', 'Intégrée': 'b-ok', 'Rejetée': 'b-bad' };
const FILTRES_EF = { q: '', statut: 'Reçue' };
Views.efactures = (params, query) => {
  if (params[0]) return efactureDetail(params[0]);
  const f = lireFiltres('efactures', query, FILTRES_EF), admin = Store.can('admin');
  const list = Store.all('efactures').filter(x => (!f.statut || x.statut === f.statut) && correspond(f.q, x.numero, x.vendeur && x.vendeur.nom, x.refCommande, x.refAcheteur))
    .sort((a, b) => (b.recueLe || '').localeCompare(a.recueLe || ''));
  const emises = Store.all('factures').filter(x => x.numero).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
  return `<h1>Achats</h1>${achatsTabs('efactures')}
  <p class="muted">Factures électroniques reçues de vos fournisseurs par votre plateforme agréée (Factur-X, CII ou UBL) : le fournisseur est reconnu par son SIREN, la commande ou le chantier par les références de la facture. Contrôlez puis intégrez : la facture fournisseur est créée et ventilée.</p>
  <div class="toolbar">
    <label class="btn">Importer un fichier (XML ou PDF Factur-X)<input type="file" id="ef-import" accept=".xml,.pdf,application/xml,text/xml,application/pdf" multiple hidden></label>
    <button class="secondary" id="ef-releve">Relever le dossier de la plateforme</button>
    ${document.body.classList.contains('demo') ? '<button class="secondary" id="ef-exemple">Recevoir une facture d\'exemple</button>' : ''}
  </div>
  ${barreFiltres(f, { recherche: 'Rechercher (fournisseur, n°, commande…)', statuts: [['Reçue', 'À traiter'], ['Intégrée', 'Intégrées'], ['Rejetée', 'Rejetées'], ['', 'Toutes']], defauts: FILTRES_EF })}
  ${list.length ? `<div class="table-wrap"><table><tr><th>Reçue le</th><th>Fournisseur</th><th>N°</th><th>Date</th><th>Références</th><th class="num">HT</th><th class="num">TTC</th><th>Format</th><th>Statut</th></tr>
    ${list.map(x => { const four = fournisseurDe(x.vendeur || {});
      return `<tr class="clickable" onclick="location.hash='#/efactures/${x.id}'"><td>${new Date(x.recueLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<br><span class="muted small">${esc(x.origine || '')}</span></td>
        <td>${esc((x.vendeur || {}).nom || '')}${four ? '' : ' <span class="badge b-warn">nouveau</span>'}</td><td>${esc(x.numero)}${x.type === 'avoir' ? ' <span class="badge b-warn">Avoir</span>' : ''}</td><td>${dateFr(x.date)}</td>
        <td class="small">${esc([x.refCommande, x.refAcheteur].filter(Boolean).join(' · '))}</td><td class="num">${eur(x.totalHT)}</td><td class="num">${eur(x.totalTTC)}</td><td>${esc(x.format)}${x.pdfId ? ' + PDF' : ''}</td><td><span class="badge ${STATUTS_EF[x.statut] || ''}">${esc(x.statut)}</span></td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucune facture électronique pour ces critères.</p>'}

  <h2>Factures émises</h2>
  <p class="muted small">Chaque facture et chaque avoir se télécharge au format CII ou PDF Factur-X, ou se dépose dans le dossier d'envoi de votre plateforme (bouton « Facture électronique » sur la facture).</p>
  <div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Client</th><th>SIREN client</th><th class="num">TTC</th><th>Facture électronique</th><th></th></tr>
    ${emises.map(x => { const cl = entreprise(docClientId(x)); return `<tr><td><a href="#/facture/${x.id}">${esc(x.numero)}</a>${x.type === 'avoir' ? ' <span class="badge b-warn">Avoir</span>' : ''}</td><td>${dateFr(x.date)}</td><td>${esc(cl.nom || '')}</td>
      <td>${sirenDe(cl.siret) ? esc(sirenDe(cl.siret)) : '<span class="warn-text small">manquant</span>'}</td><td class="num">${eur(Calc.facture(x).ttc)}</td><td>${x.efacture ? `<span class="badge b-ok">Déposée le ${dateFr(x.efacture.date)}</span>` : '<span class="muted small">non déposée</span>'}</td>
      <td><button class="small secondary" data-efacture="${x.id}">Facture électronique</button></td></tr>`; }).join('')}</table></div>

  ${admin ? '<h2>Configuration</h2><div class="card" id="ef-config"><p class="muted small">Chargement…</p></div>' : ''}`;
};

function efactureDetail(id) {
  const x = Store.get('efactures', id);
  if (!x) return '<p>Facture introuvable. <a href="#/efactures">Retour</a></p>';
  const v = x.vendeur || {}, four = fournisseurDe(v), imp = imputationProposee(x), achat = Store.get('achats', x.achatId);
  const ecart = Math.abs((x.totalHT || 0) + (x.totalTVA || 0) - (x.totalTTC || 0)) > 0.05;
  return `<div class="toolbar"><a href="#/efactures" class="btn secondary">← Factures électroniques</a><span class="spacer"></span>
    ${x.pdfId ? `<a class="btn secondary" href="${fileUrl(x.pdfId)}" target="_blank" rel="noopener">PDF</a>` : ''}${x.xmlId ? `<a class="btn secondary" href="${fileUrl(x.xmlId)}" download="${esc(x.numero || 'facture')}.xml">XML</a>` : ''}
    ${x.statut === 'Reçue' ? '<button class="secondary" id="efd-rejeter">Rejeter</button><button id="efd-integrer">Intégrer en facture fournisseur</button>' : ''}</div>
  <h1>${x.type === 'avoir' ? 'Avoir' : 'Facture'} ${esc(x.numero)} · ${esc(v.nom || '')} <span class="badge ${STATUTS_EF[x.statut] || ''}">${esc(x.statut)}</span></h1>
  ${achat ? `<p class="note">Intégrée : <a href="#/achats/${achat.id}">facture fournisseur ${esc(achat.ref || '')}</a>.</p>` : ''}
  ${x.statut === 'Rejetée' ? `<p class="note warn-text">Rejetée le ${dateFr(x.rejeteeLe)} : ${esc(x.motifRejet || '')}. Signalez aussi le rejet sur votre plateforme pour que le fournisseur en soit informé.</p>` : ''}
  <div class="cards">
    <div class="card"><div class="label">Fournisseur</div><div class="value" style="font-size:16px">${esc(v.nom || '—')}</div><div class="sub">SIREN ${esc(v.siren || '—')} · TVA ${esc(v.tva || '—')}<br>${four ? `<span class="pos">Reconnu : ${esc(four.nom)}</span>` : '<span class="warn-text">Inconnu : la fiche fournisseur sera créée</span>'}</div></div>
    <div class="card"><div class="label">Montants</div><div class="value">${eur(x.totalTTC)}</div><div class="sub">HT ${eur(x.totalHT)} · TVA ${eur(x.totalTVA)}${ecart ? ' · <span class="neg">totaux incohérents</span>' : ''}</div></div>
    <div class="card"><div class="label">Dates</div><div class="value" style="font-size:16px">${dateFr(x.date)}</div><div class="sub">échéance ${dateFr(x.echeance) || '—'} · format ${esc(x.format)}</div></div>
    <div class="card"><div class="label">Références</div><div class="value" style="font-size:16px">${esc(x.refCommande || '—')}</div><div class="sub">${x.refAcheteur ? `référence acheteur ${esc(x.refAcheteur)}` : ''}${x.refFacture ? ` · facture d'origine ${esc(x.refFacture)}` : ''}</div></div>
  </div>
  <h2>Imputation proposée</h2>
  ${imp.length ? `<p>${imp.map(l => `${l.commandeId ? `Commande <strong>${esc((Store.get('commandes', l.commandeId) || {}).numero || '')}</strong> · ` : ''}chantier <strong>${esc(affaireOf(l.affaireId).code || 'stock')}</strong> · ${eur(l.montantHT)} HT`).join('<br>')}</p>`
    : '<p class="muted">Aucune commande ni chantier reconnu dans les références : la facture sera créée « à ventiler ».</p>'}
  <h2>Lignes</h2>
  <div class="table-wrap"><table><tr><th>Désignation</th><th>Réf.</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Montant HT</th><th class="num">TVA</th></tr>
    ${(x.lignes || []).map(l => `<tr><td>${esc(l.designation)}</td><td>${esc(l.reference || '')}</td><td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite)}</td><td class="num">${eur(l.pu)}</td><td class="num">${eur(l.montantHT)}</td><td class="num">${fmt(l.tauxTVA, 1)} %</td></tr>`).join('')}</table></div>
  ${(x.notes || []).length ? `<h2>Mentions</h2><ul class="small">${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

function integrerEFacture(x) {
  let four = fournisseurDe(x.vendeur || {});
  const v = x.vendeur || {};
  if (!four) four = Store.upsert('entreprises', { nom: v.nom || 'Fournisseur', categorie: 'Fournisseur', siret: v.siret || v.siren || '', tvaIntra: v.tva || '', email: v.email || '',
    adresses: v.ville || v.cp ? [{ id: Math.random().toString(36).slice(2, 10), libelle: 'Siège', adresse: v.adresse || '', cp: v.cp || '', ville: v.ville || '', facturation: true }] : [] });
  const sens = x.type === 'avoir' ? -1 : 1;
  const achat = Store.upsert('achats', { ref: '', fournisseurId: four.id, numeroFournisseur: x.numero, date: x.date, echeance: x.echeance || '', montantHT: sens * Math.abs(x.totalHT), montantTVA: sens * Math.abs(x.totalTVA),
    statut: 'À payer', notes: `Reçue par facturation électronique (${x.format}${x.refCommande ? `, commande ${x.refCommande}` : ''}).`, pieceId: x.pdfId || '', pieceType: x.pdfId ? 'pdf' : '', efactureId: x.id, imputations: imputationProposee(x) });
  Object.assign(x, { statut: 'Intégrée', achatId: achat.id, integreeLe: isoDate(new Date()), integreePar: Store.me.nom });
  Store.upsert('efactures', x);
  location.hash = `#/achats/${achat.id}`;
  App.toast('Facture fournisseur créée : vérifiez la ventilation.', 4000);
}

async function importerFichiersEF(files) {
  let ok = 0, doublons = 0;
  for (const file of files) {
    try {
      const b = new Uint8Array(await file.arrayBuffer());
      const r = await api('POST', '/api/efacture/import', { nom: file.name, base64: enBase64(b) });
      if (r.doublon) doublons++; else { ok++; Store._put('efactures', r); }
    } catch (e) { notify(`${file.name} : ${e.message}`); }
  }
  App.render();
  if (ok || doublons) App.toast(`${ok} facture(s) reçue(s)${doublons ? `, ${doublons} déjà présente(s)` : ''}`, 4000);
}

Views.efactures.bind = (root, params, query) => {
  if (params[0]) {
    const x = Store.get('efactures', params[0]);
    if (!x) return;
    const q = s => root.querySelector(s);
    if (q('#efd-integrer')) q('#efd-integrer').onclick = () => integrerEFacture(x);
    if (q('#efd-rejeter')) q('#efd-rejeter').onclick = async () => {
      const motif = await askValue('Motif du rejet (montant erroné, commande inconnue, doublon…)', '');
      if (motif === null) return;
      Object.assign(x, { statut: 'Rejetée', motifRejet: motif, rejeteeLe: isoDate(new Date()) }); Store.upsert('efactures', x); App.render();
    };
    return;
  }
  const f = lireFiltres('efactures', query, FILTRES_EF);
  bindFiltres(root, 'efactures', f, FILTRES_EF);
  root.querySelector('#ef-import').onchange = e => { const fl = [...e.target.files]; e.target.value = ''; importerFichiersEF(fl); };
  root.querySelector('#ef-releve').onclick = () => api('POST', '/api/efacture/scruter', {}).then(r => { App.toast(r.erreur || `${r.traites} facture(s) relevée(s) dans le dossier`, 4000); return Store.load(); }).then(() => App.render()).catch(e => notify(e.message));
  const ex = root.querySelector('#ef-exemple');
  if (ex) ex.onclick = () => importerFichiersEF([new File([exempleFactureFournisseur()], 'exemple-facture-tereva.xml', { type: 'application/xml' })]);
  const carte = root.querySelector('#ef-config');
  if (carte) api('GET', '/api/efacture/config').then(c => {
    const url = c.jeton ? `${location.origin}/api/efacture/depot/${c.jeton}` : '';
    carte.innerHTML = `<div class="grid2">
        <div class="field"><label for="efc-pf">Plateforme agréée (PA)</label><input id="efc-pf" value="${esc(c.plateforme)}" placeholder="Nom de votre plateforme (logiciel comptable, banque, opérateur…)"></div>
        <div class="field"><label for="efc-in">Dossier de réception (sur le serveur)</label><input id="efc-in" value="${esc(c.dossierEntree)}" placeholder="C:\\FacturesElectroniques\\Recues"></div>
        <div class="field"><label for="efc-out">Dossier d'envoi (sur le serveur)</label><input id="efc-out" value="${esc(c.dossierSortie)}" placeholder="C:\\FacturesElectroniques\\A_envoyer"></div>
      </div>
      <label class="check"><input type="checkbox" id="efc-wh" ${c.webhook ? 'checked' : ''}> Adresse de dépôt sécurisée : la plateforme envoie directement les factures reçues au CRM</label>
      ${url ? `<p class="small">Adresse à donner à la plateforme (POST du fichier XML ou PDF, ou JSON { nom, base64 }) :<br><code class="ef-url">${esc(url)}</code></p>` : ''}
      <p class="muted small">Le dossier de réception est relevé toutes les 2 minutes : la plateforme (ou son outil de synchronisation, SFTP, OneDrive…) y dépose les factures reçues ; elles sont rangées ensuite dans « traites » (ou « erreurs »). Le dossier d'envoi reçoit nos factures (XML CII + PDF Factur-X) pour transmission par la plateforme.</p>
      <div class="modal-actions">${c.webhook ? '<button class="secondary" id="efc-jeton">Changer l\'adresse de dépôt</button>' : ''}<button id="efc-save">Enregistrer</button></div>`;
    const lire = extra => ({ plateforme: carte.querySelector('#efc-pf').value, dossierEntree: carte.querySelector('#efc-in').value, dossierSortie: carte.querySelector('#efc-out').value, webhook: carte.querySelector('#efc-wh').checked, ...extra });
    carte.querySelector('#efc-save').onclick = () => api('PUT', '/api/efacture/config', lire()).then(() => { App.toast('Configuration enregistrée'); App.render(); }).catch(e => notify(e.message));
    const j = carte.querySelector('#efc-jeton');
    if (j) j.onclick = () => ask('Générer une nouvelle adresse de dépôt ? L\'ancienne cessera de fonctionner : pensez à mettre à jour la plateforme.', 'Changer', false).then(ok => ok && api('PUT', '/api/efacture/config', lire({ nouveauJeton: true })).then(() => App.render()));
  }).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
};

// Démonstration : facture électronique d'un fournisseur citant le n° de chantier
function exempleFactureFournisseur() {
  const s = Store.data.settings, hd = Store.all('affaires').find(a => a.code && a.statut !== 'Clos' && !a.archive) || {}, d = isoDate(new Date()).replace(/-/g, '');
  const lignes = [['Coude 90° inox 316L DN50 à souder', 4, 'C62', 18.4], ['Bride plate inox DN50 PN16', 2, 'C62', 46.9], ['Joint graphite DN50', 4, 'C62', 6.35]];
  const ht = lignes.reduce((t, l) => t + l[1] * l[3], 0), tva = Math.round(ht * 20) / 100;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>TV-${Math.floor(Math.random() * 90000 + 10000)}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${d}</udt:DateTimeString></ram:IssueDateTime><ram:IncludedNote><ram:Content>Retrait comptoir Voiron – chantier ${xmlEsc(hd.code || '')}</ram:Content></ram:IncludedNote></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lignes.map((l, i) => `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:Name>${l[0]}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l[3].toFixed(2)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${l[2]}">${l[1]}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>20</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${(l[1] * l[3]).toFixed(2)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('\n')}
<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>${xmlEsc(hd.code || '')}</ram:BuyerReference>
<ram:SellerTradeParty><ram:Name>Téréva</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">338200000</ram:ID></ram:SpecifiedLegalOrganization><ram:PostalTradeAddress><ram:PostcodeCode>38500</ram:PostcodeCode><ram:CityName>Voiron</ram:CityName><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR22338200000</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
<ram:BuyerTradeParty><ram:Name>${xmlEsc(s.societe)}</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenDe(s.siret)}</ram:ID></ram:SpecifiedLegalOrganization></ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery/>
<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:ApplicableTradeTax><ram:CalculatedAmount>${tva.toFixed(2)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${ht.toFixed(2)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>20</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${isoDate(addDays(new Date(), 45)).replace(/-/g, '')}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${ht.toFixed(2)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${ht.toFixed(2)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${tva.toFixed(2)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${(ht + tva).toFixed(2)}</ram:GrandTotalAmount><ram:DuePayableAmount>${(ht + tva).toFixed(2)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}
