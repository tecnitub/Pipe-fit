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
  const s = Store.data.settings, c = Doc.cfg(), avoir = f.type === 'avoir';
  const cid = docClientId(f), cl = entreprise(cid), bill = billingSite(cid) || {}, site = siteOf(cid, f.siteId);
  const a = affaireOf(f.affaireId), orig = avoir ? Store.get('factures', f.factureId) : null, t = Calc.doc(f);
  const lignes = (f.lignes || []).filter(l => Calc.estPrix(l));
  // Lignes au prix du client (majorations masquées réparties), remise de ligne comprise dans le prix net
  const k = t.k, htL = l => Calc.ligneHT(l) * k;
  const r2 = v => Math.round(v * 100) / 100, totLignes = lignes.reduce((x, l) => x + r2(htL(l)), 0);
  // Catégories de TVA : S taux normal ou réduit, AE autoliquidation, E exonération
  const cat = tx => (f.autoliquidation ? 'AE' : tx > 0 ? 'S' : 'E');
  const taxe = tx => `<ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat(tx)}</ram:CategoryCode><ram:RateApplicablePercent>${tx}</ram:RateApplicablePercent>`;
  const parTaux = {};
  lignes.forEach(l => { const tx = Calc.tauxLigne(f, l); parTaux[tx] = (parTaux[tx] || 0) + r2(htL(l)); });
  const taux = Object.keys(parTaux).map(Number).sort((a, b) => b - a);
  // Remises / majorations globales réparties au prorata de chaque taux, livraison au taux du document
  const ajust = [];
  (t.ajust || []).forEach(x => {
    const total = Math.abs(r2(x.montant)); let reste = total;
    taux.forEach((tx, i) => { const m = i === taux.length - 1 ? r2(reste) : r2(total * parTaux[tx] / (totLignes || 1)); reste -= m;
      if (m) ajust.push({ charge: x.montant > 0, montant: m, motif: x.libelle || (x.montant > 0 ? 'Majoration' : 'Remise'), tx }); });
  });
  if (t.livraison) ajust.push({ charge: true, montant: r2(t.livraison), motif: 'Livraison', tx: Calc.tauxDoc(f) });
  const charges = ajust.filter(x => x.charge).reduce((x, y) => x + y.montant, 0), remises = ajust.filter(x => !x.charge).reduce((x, y) => x + y.montant, 0);
  const groupes = [...new Set([...taux, ...ajust.map(x => x.tx)])].map(tx => {
    const b = r2((parTaux[tx] || 0) + ajust.filter(x => x.tx === tx).reduce((s2, x) => s2 + (x.charge ? x.montant : -x.montant), 0));
    return { tx, base: b, tva: r2(b * tx / 100) };
  });
  const base = r2(totLignes + charges - remises), tva = r2(groupes.reduce((x, g) => x + g.tva, 0)), ttc = r2(base + tva);
  const d102 = d => `<udt:DateTimeString format="102">${String(d || '').replace(/-/g, '')}</udt:DateTimeString>`;
  const adresse = x => `<ram:PostalTradeAddress>${x.adresse ? `<ram:LineOne>${xmlEsc(x.adresse)}</ram:LineOne>` : ''}${x.cp ? `<ram:PostcodeCode>${xmlEsc(x.cp)}</ram:PostcodeCode>` : ''}${x.ville ? `<ram:CityName>${xmlEsc(x.ville)}</ram:CityName>` : ''}<ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`;
  const sAdr = /^(.*?)\s*[–-]\s*(\d{5})\s+(.+)$/.exec(s.adresse || '') || [];
  const notes = [avoir && f.motif ? `Motif de l'avoir : ${f.motif}` : '', f.autoliquidation ? MENTIONS_TVA.AL : '', t.retenue ? `Retenue de garantie ${fmt(f.retenuePct, 1)} % : ${montant(t.retenue)} EUR – net à payer ${montant(t.netAPayer)} EUR` : '',
    'Catégorie de l\'opération : prestation de services', a.code ? `Chantier ${a.code} – ${a.nom}` : ''].filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${xmlEsc(f.numero)}</ram:ID><ram:TypeCode>${avoir ? 381 : 380}</ram:TypeCode><ram:IssueDateTime>${d102(f.date)}</ram:IssueDateTime>${notes.map(n => `<ram:IncludedNote><ram:Content>${xmlEsc(n)}</ram:Content></ram:IncludedNote>`).join('')}</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lignes.map((l, i) => `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct>${l.num ? `<ram:SellerAssignedID>${xmlEsc(l.num)}</ram:SellerAssignedID>` : ''}<ram:Name>${xmlEsc(l.designation || 'Prestation')}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${(Math.round(Calc.pu(l) * k * (1 - num(l.remise) / 100) * 10000) / 10000).toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${uniteCefact(l.unite)}">${num(l.qte)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax>${taxe(Calc.tauxLigne(f, l))}</ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${montant(htL(l))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('\n')}
<ram:ApplicableHeaderTradeAgreement>${f.refCommande ? `<ram:BuyerReference>${xmlEsc(f.refCommande)}</ram:BuyerReference>` : ''}
<ram:SellerTradeParty><ram:Name>${xmlEsc(s.societe)}</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenDe(s.siret)}</ram:ID></ram:SpecifiedLegalOrganization>${adresse({ adresse: sAdr[1] || s.adresse, cp: sAdr[2], ville: sAdr[3] })}${c.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${xmlEsc(c.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${c.tvaIntra ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xmlEsc(c.tvaIntra)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}</ram:SellerTradeParty>
<ram:BuyerTradeParty><ram:Name>${xmlEsc(cl.nom)}</ram:Name>${sirenDe(cl.siret) ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenDe(cl.siret)}</ram:ID></ram:SpecifiedLegalOrganization>` : ''}${adresse(bill)}${cl.tvaIntra ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xmlEsc(cl.tvaIntra)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}</ram:BuyerTradeParty>
${f.refCommande ? `<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${xmlEsc(f.refCommande)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>` : ''}</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>${site ? `<ram:ShipToTradeParty><ram:Name>${xmlEsc(site.libelle)}</ram:Name>${adresse(site)}</ram:ShipToTradeParty>` : ''}<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${d102(f.date)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${c.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xmlEsc(c.iban.replace(/\s/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ''}
${groupes.map(g => `<ram:ApplicableTradeTax><ram:CalculatedAmount>${montant(g.tva)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${cat(g.tx) === 'AE' ? '<ram:ExemptionReason>Autoliquidation – article 283-2 nonies du CGI</ram:ExemptionReason>' : cat(g.tx) === 'E' ? '<ram:ExemptionReason>Exonération de TVA</ram:ExemptionReason>' : ''}<ram:BasisAmount>${montant(g.base)}</ram:BasisAmount><ram:CategoryCode>${cat(g.tx)}</ram:CategoryCode>${cat(g.tx) === 'AE' ? '<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>' : ''}${cat(g.tx) === 'S' ? '<ram:DueDateTypeCode>72</ram:DueDateTypeCode>' : ''}<ram:RateApplicablePercent>${g.tx}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`).join('\n')}
${ajust.map(x => `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>${x.charge}</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${montant(x.montant)}</ram:ActualAmount><ram:Reason>${xmlEsc(x.motif)}</ram:Reason><ram:CategoryTradeTax>${taxe(x.tx)}</ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`).join('\n')}
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
    ${etat.sortie ? '' : '<p class="muted small">Pour déposer directement, configurez le dossier d\'envoi de votre plateforme (Achats → Factures reçues → Configuration). Sinon, téléchargez les fichiers et importez-les sur votre plateforme.</p>'}
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

const STATUTS_EF = { 'Reçue': ['b-warn', 'À traiter'], 'Intégrée': ['b-ok', 'Acceptée'], 'Rejetée': ['b-bad', 'Refusée'] };
const badgeEF = x => { const st = STATUTS_EF[x.statut] || ['', x.statut]; return `<span class="badge ${st[0]}">${esc(st[1])}</span>`; };
const FILTRES_EF = { q: '', statut: 'Reçue' };
const estPdfSimple = x => x.format === 'PDF';
// Fournisseur d'une facture reçue : choisi à la main, sinon SIREN / TVA / raison sociale, sinon adresse de l'expéditeur
function fournisseurEF(x) {
  if (x.fournisseurId) return Store.get('entreprises', x.fournisseurId) || null;
  const f = fournisseurDe(x.vendeur || {});
  if (f) return f;
  const e = x.mail && typeof trouverExpediteur === 'function' ? trouverExpediteur(x.mail.deEmail) : {};
  return e.clientId ? Store.get('entreprises', e.clientId) : null;
}
const origineEF = x => (x.origine === 'e-mail' ? `📧 e-mail${x.mail ? ` de ${x.mail.deEmail}` : ''}` : x.origine === 'plateforme' ? 'plateforme agréée' : x.origine === 'dossier' ? 'dossier de la plateforme' : `import par ${x.origine}`);
// Même facture déjà reçue (plateforme et e-mail) ou déjà saisie : même fournisseur, même n°
function doublonsEF(x) {
  const four = fournisseurEF(x), n = String(x.numero || '').replace(/\s/g, '').toUpperCase();
  if (!four || !n) return [];
  const meme = y => String(y || '').replace(/\s/g, '').toUpperCase() === n;
  return [...Store.all('efactures').filter(y => y.id !== x.id && y.statut !== 'Rejetée' && meme(y.numero) && (fournisseurEF(y) || {}).id === four.id).map(y => ({ lien: `#/efactures/${y.id}`, lib: `reçue le ${dateFr((y.recueLe || '').slice(0, 10))} (${origineEF(y)})` })),
    ...Store.all('achats').filter(y => y.fournisseurId === four.id && meme(y.numeroFournisseur) && y.efactureId !== x.id).map(y => ({ lien: `#/achats/${y.id}`, lib: `facture fournisseur ${y.ref || ''} déjà saisie` }))];
}

Views.efactures = (params, query) => {
  if (params[0]) return efactureDetail(params[0]);
  const f = lireFiltres('efactures', query, FILTRES_EF), admin = Store.can('admin');
  const list = Store.all('efactures').filter(x => (!f.statut || x.statut === f.statut) && correspond(f.q, x.numero, x.vendeur && x.vendeur.nom, (fournisseurEF(x) || {}).nom, x.mail && x.mail.deEmail, x.refCommande, x.refAcheteur))
    .sort((a, b) => (b.recueLe || '').localeCompare(a.recueLe || ''));
  const emises = Store.all('factures').filter(x => x.numero).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
  return `<h1>Achats</h1>${achatsTabs('efactures')}
  <p class="muted">Toutes les factures des fournisseurs arrivent ici : factures électroniques de votre plateforme agréée (Factur-X, CII, UBL) et factures PDF envoyées à la boîte des factures. Le PDF est lu automatiquement (fournisseur, n°, dates, montants, commande ou chantier) ; vérifiez puis <strong>acceptez</strong> (la facture fournisseur est créée et ventilée) ou <strong>refusez</strong> avec le motif.</p>
  <div class="toolbar">
    <label class="btn">Importer un fichier (PDF ou XML)<input type="file" id="ef-import" accept=".xml,.pdf,application/xml,text/xml,application/pdf" multiple hidden></label>
    <button class="secondary" id="ef-mail">Relever la boîte des factures</button>
    <button class="secondary" id="ef-releve">Relever le dossier de la plateforme</button>
    ${document.body.classList.contains('demo') ? '<button class="secondary" id="ef-exemple">Recevoir une facture électronique d\'exemple</button><button class="secondary" id="ef-exemple-mail">Recevoir un e-mail de facture d\'exemple</button>' : ''}
  </div>
  <p class="small muted" id="ef-etat"></p>
  ${barreFiltres(f, { recherche: 'Rechercher (fournisseur, n°, commande, expéditeur…)', statuts: [['Reçue', 'À traiter'], ['Intégrée', 'Acceptées'], ['Rejetée', 'Refusées'], ['', 'Toutes']], defauts: FILTRES_EF })}
  ${list.length ? `<div class="table-wrap"><table data-colonnes="efactures"><tr><th>Reçue le</th><th>Fournisseur</th><th>N°</th><th>Date</th><th>Références</th><th class="num">HT</th><th class="num">TTC</th><th>Format</th><th>Statut</th></tr>
    ${list.map(x => { const four = fournisseurEF(x), dbl = x.statut === 'Reçue' && doublonsEF(x).length;
      return `<tr class="clickable" data-go="#/efactures/${x.id}"><td>${new Date(x.recueLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<br><span class="muted small">${esc(origineEF(x))}</span></td>
        <td>${esc(four ? four.nom : (x.vendeur || {}).nom || (x.mail || {}).de || '')}${four ? '' : ' <span class="badge b-warn">à identifier</span>'}${x.mail && x.mail.objet ? `<br><span class="muted small">${esc(x.mail.objet)}</span>` : ''}</td>
        <td>${esc(x.numero || '')}${x.type === 'avoir' ? ' <span class="badge b-warn">Avoir</span>' : ''}${dbl ? ' <span class="badge b-bad">doublon ?</span>' : ''}</td><td>${dateFr(x.date)}</td>
        <td class="small">${esc([x.refCommande, x.refAcheteur].filter(Boolean).filter((v, i, t) => t.indexOf(v) === i).join(' · '))}</td><td class="num">${x.aLire ? `<span class="muted small">${efEchec.has(x.id) ? 'à saisir' : 'lecture…'}</span>` : eur(x.totalHT)}</td><td class="num">${x.aLire ? '' : eur(x.totalTTC)}</td>
        <td>${estPdfSimple(x) ? 'PDF' : `${esc(x.format)}${x.pdfId ? ' + PDF' : ''}`}</td><td>${badgeEF(x)}</td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucune facture reçue pour ces critères.</p>'}

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
  const v = x.vendeur || {}, four = fournisseurEF(x), imp = imputationProposee(x), achat = Store.get('achats', x.achatId), pdfSimple = estPdfSimple(x);
  const ecart = !x.aLire && Math.abs((x.totalHT || 0) + (x.totalTVA || 0) - (x.totalTTC || 0)) > 0.05, dbl = doublonsEF(x), modif = pdfSimple && x.statut === 'Reçue';
  const champ = (id2, lib, val, type = 'text', extra = '') => `<div class="field"><label for="${id2}">${lib}</label><input id="${id2}" type="${type}" value="${esc(val ?? '')}" ${extra}></div>`;
  return `<div class="toolbar"><a href="#/efactures" class="btn secondary">← Factures reçues</a><span class="spacer"></span>
    ${x.pdfId ? `<a class="btn secondary" href="${fileUrl(x.pdfId)}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : ''}${x.xmlId ? `<a class="btn secondary" href="${fileUrl(x.xmlId)}" download="${esc(x.numero || 'facture')}.xml">XML</a>` : ''}
    ${modif ? '<button class="secondary" id="efd-relire">Relire le PDF</button>' : ''}
    ${x.statut === 'Reçue' ? '<button class="secondary danger" id="efd-rejeter">Refuser</button><button id="efd-integrer">Accepter</button>' : ''}</div>
  <h1>${x.type === 'avoir' ? 'Avoir' : 'Facture'} ${esc(x.numero || x.nomFichier || '')} · ${esc(four ? four.nom : v.nom || '')} ${badgeEF(x)}</h1>
  ${x.aLire ? `<p class="note">${efEchec.has(x.id) ? 'PDF non lu : complétez les champs à la main ou « Relire le PDF ».' : 'Lecture du PDF en cours…'}</p>` : ''}
  ${achat ? `<p class="note">Acceptée le ${dateFr(x.integreeLe)}${x.integreePar ? ` par ${esc(x.integreePar)}` : ''} : <a href="#/achats/${achat.id}">facture fournisseur ${esc(achat.ref || '')}</a>.</p>` : ''}
  ${x.statut === 'Rejetée' ? `<p class="note warn-text">Refusée le ${dateFr(x.rejeteeLe)}${x.rejeteePar ? ` par ${esc(x.rejeteePar)}` : ''} : ${esc(x.motifRejet || '')}.${x.refusEnvoye ? ` Fournisseur prévenu par e-mail (${esc(x.refusEnvoye)}).` : x.origine === 'plateforme' || x.origine === 'dossier' ? ' Signalez aussi le refus sur votre plateforme pour que le fournisseur en soit informé.' : ''}</p>` : ''}
  ${dbl.length && x.statut === 'Reçue' ? `<p class="note warn-text">Doublon possible : même fournisseur et même n° ${dbl.map(d => `<a href="${d.lien}">${esc(d.lib)}</a>`).join(', ')}. Refusez celle-ci si c'est la même facture.</p>` : ''}
  ${x.lecture && x.lecture.manques && x.lecture.manques.length && modif ? `<p class="note warn-text">Non trouvé dans le PDF${x.lecture.ocr ? ' (document scanné)' : ''} : ${x.lecture.manques.map(esc).join(', ')}. Complétez ci-dessous.</p>` : x.lecture && x.lecture.ocr && modif ? '<p class="note">Document scanné : vérifiez les montants.</p>' : ''}
  ${x.mail ? `<p class="small muted">Reçue par e-mail le ${new Date(x.mail.recuLe || x.recueLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} de <strong>${esc(x.mail.de)}</strong> &lt;${esc(x.mail.deEmail)}&gt;${x.mail.objet ? ` · « ${esc(x.mail.objet)} »` : ''} · ${esc(x.nomFichier || '')}</p>` : ''}
  ${modif ? `<div class="card"><div class="grid2">
      <div class="field"><label for="efe-four">Fournisseur</label><select id="efe-four"><option value="">— nouveau fournisseur —</option>${fournisseursList().map(e => `<option value="${esc(e.id)}" ${four && four.id === e.id ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></div>
      ${four ? '' : champ('efe-nom', 'Nom du nouveau fournisseur', v.nom || (x.mail || {}).de || '')}
      ${champ('efe-num', 'N° de facture', x.numero)}
      <div class="field"><label for="efe-type">Type</label><select id="efe-type"><option value="facture">Facture</option><option value="avoir" ${x.type === 'avoir' ? 'selected' : ''}>Avoir</option></select></div>
      ${champ('efe-date', 'Date', x.date, 'date')}${champ('efe-ech', 'Échéance', x.echeance, 'date')}
      ${champ('efe-ht', 'Total HT', x.totalHT, 'number', 'step="0.01"')}${champ('efe-tva', 'TVA', x.totalTVA, 'number', 'step="0.01"')}${champ('efe-ttc', 'Total TTC', x.totalTTC, 'number', 'step="0.01"')}
      ${champ('efe-ref', 'Commande ou chantier cité', x.refCommande || x.refAcheteur, 'text', 'placeholder="CF-2026-0002, CH-2026-001…"')}
    </div>${ecart ? '<p class="small neg">HT + TVA ≠ TTC : vérifiez les montants.</p>' : ''}</div>`
  : `<div class="cards">
    <div class="card"><div class="label">Fournisseur</div><div class="value" style="font-size:16px">${esc(v.nom || '—')}</div><div class="sub">SIREN ${esc(v.siren || '—')} · TVA ${esc(v.tva || '—')}<br>${four ? `<span class="pos">Reconnu : ${esc(four.nom)}</span>` : '<span class="warn-text">Inconnu : la fiche fournisseur sera créée</span>'}</div></div>
    <div class="card"><div class="label">Montants</div><div class="value">${eur(x.totalTTC)}</div><div class="sub">HT ${eur(x.totalHT)} · TVA ${eur(x.totalTVA)}${ecart ? ' · <span class="neg">totaux incohérents</span>' : ''}</div></div>
    <div class="card"><div class="label">Dates</div><div class="value" style="font-size:16px">${dateFr(x.date)}</div><div class="sub">échéance ${dateFr(x.echeance) || '—'} · format ${esc(x.format)}</div></div>
    <div class="card"><div class="label">Références</div><div class="value" style="font-size:16px">${esc(x.refCommande || '—')}</div><div class="sub">${x.refAcheteur ? `référence acheteur ${esc(x.refAcheteur)}` : ''}${x.refFacture ? ` · facture d'origine ${esc(x.refFacture)}` : ''}</div></div>
  </div>`}
  <h2>Imputation proposée</h2>
  ${imp.length ? `<p>${imp.map(l => `${l.commandeId ? `Commande <strong>${esc((Store.get('commandes', l.commandeId) || {}).numero || '')}</strong> · ` : ''}chantier <strong>${esc(affaireOf(l.affaireId).code || 'stock')}</strong> · ${eur(l.montantHT)} HT`).join('<br>')}</p>`
    : '<p class="muted">Aucune commande ni chantier reconnu dans les références : la facture sera créée « à ventiler ».</p>'}
  ${(x.lignes || []).length ? `<h2>Lignes</h2>
  <div class="table-wrap"><table><tr><th>Désignation</th><th>Réf.</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Montant HT</th>${pdfSimple ? '' : '<th class="num">TVA</th>'}</tr>
    ${x.lignes.map(l => `<tr><td>${esc(l.designation)}</td><td>${esc(l.reference || '')}</td><td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite)}</td><td class="num">${eur(l.pu)}</td><td class="num">${eur(l.montantHT)}</td>${pdfSimple ? '' : `<td class="num">${fmt(l.tauxTVA, 1)} %</td>`}</tr>`).join('')}</table></div>` : ''}
  ${(x.notes || []).length ? `<h2>Mentions</h2><ul class="small">${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

// PDF simple : lecture dans le navigateur (texte, sinon reconnaissance du scan), champs pré-remplis à vérifier
async function lireFacturePdf(x) {
  const rep = await fetch(fileUrl(x.pdfId));
  if (!rep.ok) throw new Error('PDF introuvable');
  const fichier = new File([await rep.blob()], x.nomFichier || 'facture.pdf', { type: 'application/pdf' });
  const lu = await PdfLecture.lire(fichier), s = Store.data.settings || {}, doc = s.doc || {};
  const r = FactureLecture.analyser(lu.lignes, { siret: s.siret, tva: doc.tvaIntra, commandes: Store.all('commandes').map(c => c.numero).filter(Boolean), chantiers: Store.all('affaires').map(a => a.code).filter(Boolean) });
  Object.assign(x, { numero: r.numero || x.numero || '', type: r.type, date: r.date || x.date || '', echeance: r.echeance || x.echeance || '', totalHT: r.totalHT ?? 0, totalTVA: r.totalTVA ?? 0, totalTTC: r.totalTTC ?? 0,
    refCommande: r.refCommande, refAcheteur: r.refAcheteur, lignes: r.lignes, iban: r.iban, aLire: false, lecture: { date: isoDate(new Date()), manques: r.manques, ocr: !!lu.ocr, coherent: r.coherent },
    vendeur: { ...(x.vendeur || {}), siret: r.siret, siren: r.siren, tva: r.tva } });
  if (!x.fournisseurId) { const f = fournisseurEF(x); if (f) x.fournisseurId = f.id; }
  Store.upsert('efactures', x);
}

function integrerEFacture(x) {
  const v = x.vendeur || {};
  let four = fournisseurEF(x);
  if (estPdfSimple(x) && (!x.numero || !num(x.totalHT))) return notify('Indiquez au moins le n° de la facture et son montant HT.');
  if (!four) four = Store.upsert('entreprises', { nom: v.nom || (x.mail || {}).de || 'Fournisseur', categorie: 'Fournisseur', siret: v.siret || v.siren || '', tvaIntra: v.tva || '', email: v.email || (x.mail || {}).deEmail || '',
    adresses: v.ville || v.cp ? [{ id: Math.random().toString(36).slice(2, 10), libelle: 'Siège', adresse: v.adresse || '', cp: v.cp || '', ville: v.ville || '', facturation: true }] : [] });
  const sens = x.type === 'avoir' ? -1 : 1;
  const achat = Store.upsert('achats', { ref: '', fournisseurId: four.id, numeroFournisseur: x.numero, date: x.date, echeance: x.echeance || '', montantHT: sens * Math.abs(num(x.totalHT)), montantTVA: sens * Math.abs(num(x.totalTVA)),
    lignes: (x.lignes || []).map(l => ({ designation: l.designation || '', reference: l.reference || '', qte: sens * Math.abs(num(l.qte)), unite: l.unite || '', pu: num(l.pu), montantHT: sens * Math.abs(num(l.montantHT)) })),
    statut: 'À payer', notes: estPdfSimple(x) ? `Reçue par e-mail en PDF${x.mail ? ` (${x.mail.deEmail})` : ''}${x.refCommande ? `, commande ${x.refCommande}` : ''}.` : `Reçue par facturation électronique (${x.format}${x.refCommande ? `, commande ${x.refCommande}` : ''}).`,
    pieceId: x.pdfId || '', pieceType: x.pdfId ? 'pdf' : '', efactureId: x.id, imputations: imputationProposee(x) });
  Object.assign(x, { statut: 'Intégrée', fournisseurId: four.id, achatId: achat.id, integreeLe: isoDate(new Date()), integreePar: Store.me.nom });
  Store.upsert('efactures', x);
  location.hash = `#/achats/${achat.id}`;
  App.toast('Facture acceptée : la facture fournisseur est créée, vérifiez la ventilation.', 4000);
}

// Refus : motif obligatoire ; facture reçue par e-mail, le fournisseur peut être prévenu depuis la boîte des factures
async function refuserEFacture(x) {
  const etat = await api('GET', '/api/efacture/etat').catch(() => ({}));
  const parMail = x.mail && x.mail.deEmail && etat.mail && etat.mail.actif && etat.mail.m365;
  const box = Modal.open(`<h2 style="margin-top:0">Refuser la facture ${esc(x.numero || x.nomFichier || '')}</h2>
    <div class="field"><label for="rf-motif">Motif du refus</label><input id="rf-motif" list="rf-motifs" placeholder="Prix différent de la commande, commande inconnue, doublon…">
      <datalist id="rf-motifs"><option>Prix différent de la commande</option><option>Quantité facturée supérieure à la livraison</option><option>Commande inconnue : merci d'indiquer notre n° de commande</option><option>Facture déjà reçue (doublon)</option><option>Mentions obligatoires manquantes</option></datalist></div>
    ${parMail ? `<label class="check"><input type="checkbox" id="rf-mail" checked> Prévenir le fournisseur par e-mail (${esc(x.mail.deEmail)})</label>` : x.origine === 'plateforme' || x.origine === 'dossier' ? '<p class="small muted">Signalez aussi le refus sur votre plateforme agréée : c\'est elle qui en informe le fournisseur.</p>' : ''}
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rf-x">Annuler</button><button class="danger" id="rf-ok">Refuser</button></div>`);
  box.querySelector('#rf-x').onclick = Modal.close;
  box.querySelector('#rf-ok').onclick = async () => {
    const motif = box.querySelector('#rf-motif').value.trim();
    if (!motif) return notify('Indiquez le motif du refus.');
    box.querySelector('#rf-ok').disabled = true;
    let envoye = '';
    if (parMail && box.querySelector('#rf-mail').checked) {
      try { envoye = (await api('POST', '/api/efacture/prevenir', { id: x.id, motif })).a; } catch (e) { box.querySelector('#rf-ok').disabled = false; return notify(`E-mail non envoyé : ${e.message}`); }
    }
    Object.assign(x, { statut: 'Rejetée', motifRejet: motif, rejeteeLe: isoDate(new Date()), rejeteePar: Store.me.nom, ...(envoye ? { refusEnvoye: envoye } : {}) });
    Store.upsert('efactures', x); Modal.close(); App.render();
    App.toast(envoye ? `Facture refusée, fournisseur prévenu (${envoye})` : 'Facture refusée', 4000);
  };
}

async function importerFichiersEF(files, mail) {
  let ok = 0, doublons = 0;
  for (const file of files) {
    try {
      const b = new Uint8Array(await file.arrayBuffer());
      const r = await api('POST', '/api/efacture/import', { nom: file.name, base64: enBase64(b), ...(mail ? { mail } : {}) });
      if (r.doublon) doublons++; else { ok++; Store._put('efactures', r); }
    } catch (e) { notify(`${file.name} : ${e.message}`); }
  }
  App.render();
  if (ok || doublons) App.toast(`${ok} facture(s) reçue(s)${doublons ? `, ${doublons} déjà présente(s)` : ''}`, 4000);
}

const efLecture = new Set(), efEchec = new Set(); // PDF en cours de lecture ; lecture échouée (pas de nouvel essai automatique)
Views.efactures.bind = (root, params, query) => {
  if (params[0]) {
    const x = Store.get('efactures', params[0]);
    if (!x) return;
    const q = s => root.querySelector(s);
    const lire = () => { if (efLecture.has(x.id)) return; efLecture.add(x.id); lireFacturePdf(x).catch(e => { efEchec.add(x.id); notify(`Lecture du PDF : ${e.message}. Complétez les champs à la main.`); }).finally(() => { efLecture.delete(x.id); App.render(); }); };
    if (x.aLire && x.statut === 'Reçue' && x.pdfId && !efEchec.has(x.id)) lire();
    if (q('#efd-relire')) q('#efd-relire').onclick = lire;
    if (q('#efd-integrer')) q('#efd-integrer').onclick = async () => {
      const d = doublonsEF(x);
      if (d.length && !(await ask(`Doublon possible : ${d.map(y => y.lib).join(', ')}. Accepter quand même ?`, 'Accepter'))) return;
      integrerEFacture(x);
    };
    if (q('#efd-rejeter')) q('#efd-rejeter').onclick = () => refuserEFacture(x).catch(e => notify(e.message));
    // Corrections des champs lus dans le PDF
    const maj = (sel, k, conv = v => v) => { const el = q(sel); if (el) el.onchange = () => { x[k] = conv(el.value); if (k === 'refCommande') x.refAcheteur = ''; Store.upsert('efactures', x); App.render(); }; };
    maj('#efe-four', 'fournisseurId'); maj('#efe-num', 'numero', v => v.trim()); maj('#efe-type', 'type'); maj('#efe-date', 'date'); maj('#efe-ech', 'echeance');
    maj('#efe-ht', 'totalHT', num); maj('#efe-tva', 'totalTVA', num); maj('#efe-ttc', 'totalTTC', num); maj('#efe-ref', 'refCommande', v => v.trim());
    const nom = q('#efe-nom'); if (nom) nom.onchange = () => { x.vendeur = { ...(x.vendeur || {}), nom: nom.value.trim() }; Store.upsert('efactures', x); };
    return;
  }
  const f = lireFiltres('efactures', query, FILTRES_EF);
  bindFiltres(root, 'efactures', f, FILTRES_EF);
  // PDF arrivés : lus tout de suite, l'un après l'autre (fournisseur, n°, montants visibles dans la liste)
  const aLire = Store.all('efactures').find(x => x.aLire && x.statut === 'Reçue' && x.pdfId && !efLecture.size && !efEchec.has(x.id));
  if (aLire) { efLecture.add(aLire.id); lireFacturePdf(aLire).catch(() => efEchec.add(aLire.id)).finally(() => { efLecture.delete(aLire.id); if (/^#\/efactures(\?|$)/.test(location.hash)) App.render(); }); }
  root.querySelector('#ef-import').onchange = e => { const fl = [...e.target.files]; e.target.value = ''; importerFichiersEF(fl); };
  root.querySelector('#ef-releve').onclick = () => api('POST', '/api/efacture/scruter', {}).then(r => { App.toast(r.erreur || `${r.traites} facture(s) relevée(s) dans le dossier`, 4000); return Store.load(); }).then(() => App.render()).catch(e => notify(e.message));
  root.querySelector('#ef-mail').onclick = () => api('POST', '/api/efacture/mail', {}).then(r => { App.toast(`${r.messages} e-mail(s) lu(s) · ${r.factures} facture(s) reçue(s)${r.doublons ? ` · ${r.doublons} déjà reçue(s)` : ''}${r.erreurs && r.erreurs.length ? ` · ${r.erreurs.length} pièce(s) illisible(s)` : ''}`, 5000); return Store.load(); }).then(() => App.render()).catch(e => notify(e.message));
  api('GET', '/api/efacture/etat').then(e => {
    const el = root.querySelector('#ef-etat'), m = e.mail || {};
    if (!el) return;
    el.textContent = [m.actif ? `Boîte des factures : ${m.adresse}${m.dernier ? `, relevée le ${new Date(m.dernier).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}${m.erreur ? ` — erreur : ${m.erreur}` : ''}` : 'Boîte des factures non configurée',
      e.plateforme ? `plateforme : ${e.plateforme}` : ''].filter(Boolean).join(' · ');
    if (m.erreur) el.classList.add('warn-text');
  }).catch(() => {});
  const ex = root.querySelector('#ef-exemple');
  if (ex) ex.onclick = () => importerFichiersEF([new File([exempleFactureFournisseur()], 'exemple-facture-tereva.xml', { type: 'application/xml' })]);
  const exm = root.querySelector('#ef-exemple-mail');
  if (exm) exm.onclick = async () => {
    const bytes = await PDF.depuisHTML(exempleFacturePdfHtml(), 'facture');
    importerFichiersEF([new File([bytes], `Facture IDRA ${Math.floor(Math.random() * 9000 + 1000)}.pdf`, { type: 'application/pdf' })], { de: 'Inox Distribution – Comptabilité', deEmail: 'compta@inoxdistri.example', objet: 'Votre facture', recuLe: new Date().toISOString() });
  };
  const carte = root.querySelector('#ef-config');
  if (carte) api('GET', '/api/efacture/config').then(c => {
    const url = c.jeton ? `${location.origin}/api/efacture/depot/${c.jeton}` : '', mc = c.mail || {};
    carte.innerHTML = `<h3 style="margin-top:0">Boîte aux lettres des factures (PDF)</h3>
      <p class="muted small">Donnez à vos fournisseurs une adresse dédiée (ex. factures@votre-domaine.fr) : toutes les 2 minutes, chaque PDF ou XML joint devient une facture à traiter ; l'e-mail est marqué lu et rangé dans le sous-dossier indiqué. Boîte Microsoft 365 : l'application de Paramètres → E-mails doit avoir l'autorisation <strong>Mail.ReadWrite</strong>.${c.m365 ? '' : ' <span class="warn-text">Connexion Microsoft 365 non configurée.</span>'}</p>
      <div class="grid2">
        <div class="field"><label for="efc-mad">Adresse de la boîte</label><input id="efc-mad" type="email" value="${esc(mc.adresse || '')}" placeholder="factures@votre-domaine.fr"></div>
        <div class="field"><label for="efc-mdo">Ranger les e-mails traités dans</label><input id="efc-mdo" value="${esc(mc.dossier || 'Factures traitées')}"></div>
      </div>
      <label class="check"><input type="checkbox" id="efc-mac" ${mc.actif ? 'checked' : ''}> Relever cette boîte automatiquement</label>
      <h3>Plateforme agréée (factures électroniques)</h3>
      <div class="grid2">
        <div class="field"><label for="efc-pf">Plateforme agréée (PA)</label><input id="efc-pf" value="${esc(c.plateforme)}" placeholder="Nom de votre plateforme (logiciel comptable, banque, opérateur…)"></div>
        <div class="field"><label for="efc-in">Dossier de réception (sur le serveur)</label><input id="efc-in" value="${esc(c.dossierEntree)}" placeholder="C:\\FacturesElectroniques\\Recues"></div>
        <div class="field"><label for="efc-out">Dossier d'envoi (sur le serveur)</label><input id="efc-out" value="${esc(c.dossierSortie)}" placeholder="C:\\FacturesElectroniques\\A_envoyer"></div>
      </div>
      <label class="check"><input type="checkbox" id="efc-wh" ${c.webhook ? 'checked' : ''}> Adresse de dépôt sécurisée : la plateforme envoie directement les factures reçues au CRM</label>
      ${url ? `<p class="small">Adresse à donner à la plateforme (POST du fichier XML ou PDF, ou JSON { nom, base64 }) :<br><code class="ef-url">${esc(url)}</code></p>` : ''}
      <p class="muted small">Le dossier de réception est relevé toutes les 2 minutes : la plateforme (ou son outil de synchronisation, SFTP, OneDrive…) y dépose les factures reçues (XML, PDF Factur-X ou PDF simple) ; elles sont rangées ensuite dans « traites » (ou « erreurs »). Le dossier d'envoi reçoit nos factures (XML CII + PDF Factur-X) pour transmission par la plateforme.</p>
      <div class="modal-actions">${c.webhook ? '<button class="secondary" id="efc-jeton">Changer l\'adresse de dépôt</button>' : ''}<button id="efc-save">Enregistrer</button></div>`;
    const val = s => carte.querySelector(s).value;
    const lire = extra => ({ plateforme: val('#efc-pf'), dossierEntree: val('#efc-in'), dossierSortie: val('#efc-out'), webhook: carte.querySelector('#efc-wh').checked,
      mail: { actif: carte.querySelector('#efc-mac').checked, adresse: val('#efc-mad'), dossier: val('#efc-mdo') }, ...extra });
    carte.querySelector('#efc-save').onclick = () => api('PUT', '/api/efacture/config', lire()).then(() => { App.toast('Configuration enregistrée'); App.render(); }).catch(e => notify(e.message));
    const j = carte.querySelector('#efc-jeton');
    if (j) j.onclick = () => ask('Générer une nouvelle adresse de dépôt ? L\'ancienne cessera de fonctionner : pensez à mettre à jour la plateforme.', 'Changer', false).then(ok => ok && api('PUT', '/api/efacture/config', lire({ nouveauJeton: true })).then(() => App.render()));
  }).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
};

// Démonstration : facture PDF simple d'un négoce, reçue par e-mail (commande CF-0001 citée)
function exempleFacturePdfHtml() {
  const cf = Store.all('commandes').find(c => c.id === 'cf1') || {}, s = Store.data.settings || {};
  const l = [['TUB-316-050', 'Tube inox 316L DN50 sch10S', 120, 43.2], ['COU-316-050', 'Coude 90° 3D inox 316L DN50', 40, 20.1]];
  const ht = l.reduce((t, x) => t + x[2] * x[3], 0) + 45, tva = Math.round(ht * 20) / 100;
  return `<div class="doc-head"><div class="doc-societe"><div><strong>INOX DISTRIBUTION RHÔNE-ALPES – exemple de démonstration</strong><br>SIRET 334 222 999 00044 – TVA FR90334222999</div></div><div class="doc-ref"><strong class="doc-titre">FACTURE N° IDRA-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}</strong><br>Date : ${dateFr(isoDate(new Date()))}</div></div>
    <p>Client : ${esc(s.societe || '')}<br>Votre commande : ${esc(cf.numero || '')}</p>
    <table class="doc-lines"><tr><th>Réf.</th><th>Désignation</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Montant HT</th></tr>
    ${l.map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td><td class="num">${x[2]}</td><td class="num">${fmt(x[3], 2)}</td><td class="num">${fmt(x[2] * x[3], 2)}</td></tr>`).join('')}</table>
    <p>Frais de port : 45,00<br>Total HT : ${fmt(ht, 2)}<br>TVA 20 % : ${fmt(tva, 2)}<br>Total TTC : ${fmt(ht + tva, 2)}</p>
    <p>Échéance : ${dateFr(isoDate(addDays(new Date(), 45)))}<br>IBAN FR76 3000 4000 0500 0012 3456 789</p>`;
}

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
