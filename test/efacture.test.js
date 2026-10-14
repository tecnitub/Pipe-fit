// Facturation électronique : lecture CII / UBL / PDF Factur-X, adresse de dépôt de la plateforme, dossiers.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-ef-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');
const FacturX = require('../public/js/facturx');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, cookie, headers = {}) {
  const res = await fetch(base + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: method !== 'GET' ? (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body || {})) : undefined });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}
async function login(l, p) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, password: p }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; }

const CII = (numero, ref) => `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocument><ram:ID>${numero}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261010</udt:DateTimeString></ram:IssueDateTime><ram:IncludedNote><ram:Content>Chantier &amp; atelier</ram:Content></ram:IncludedNote></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Coude inox DN50</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>18.40</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">10</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>184.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>
<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>${ref}</ram:BuyerReference><ram:SellerTradeParty><ram:Name>Téréva</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">338200000</ram:ID></ram:SpecifiedLegalOrganization><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR22338200000</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty><ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>CF-2026-0002</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument></ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261124</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>184.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">36.80</ram:TaxTotalAmount><ram:GrandTotalAmount>220.80</ram:GrandTotalAmount><ram:DuePayableAmount>220.80</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;

const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:ID>AV-778</cbc:ID><cbc:IssueDate>2026-10-02</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode><cbc:BuyerReference>HD-2026-002</cbc:BuyerReference>
<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>F-701</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>
<cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Descours &amp; Cabot</cbc:Name></cac:PartyName><cac:PartyTaxScheme><cbc:CompanyID>FR10957200000</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Descours &amp; Cabot</cbc:RegistrationName><cbc:CompanyID>95720000001234</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">10.00</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">50.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">60.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">60.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="C62">2</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="EUR">50.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Retour joints</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">25.00</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>
</CreditNote>`;

// PDF minimal avec le XML CII joint et compressé (comme un PDF Factur-X)
function pdfFacturX(xml) {
  const z = zlib.deflateSync(Buffer.from(xml, 'utf8'));
  return Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n4 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Params << /Size ' + xml.length + ' >> /Filter /FlateDecode /Length ' + z.length + ' >>\nstream\n', 'latin1'),
    z, Buffer.from('\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1')]);
}

test('lecture des formats CII, UBL et PDF Factur-X', async () => {
  const c = FacturX.lireXML(CII('TV-1', 'CH-2026-001'));
  assert.strictEqual(c.format, 'CII'); assert.strictEqual(c.numero, 'TV-1'); assert.strictEqual(c.date, '2026-10-10'); assert.strictEqual(c.echeance, '2026-11-24');
  assert.strictEqual(c.vendeur.siren, '338200000'); assert.strictEqual(c.vendeur.tva, 'FR22338200000'); assert.strictEqual(c.vendeur.nom, 'Téréva');
  assert.strictEqual(c.refCommande, 'CF-2026-0002'); assert.strictEqual(c.totalHT, 184); assert.strictEqual(c.totalTVA, 36.8); assert.strictEqual(c.lignes[0].qte, 10);
  assert.deepStrictEqual(c.notes, ['Chantier & atelier']);
  const u = FacturX.lireXML(UBL);
  assert.strictEqual(u.format, 'UBL'); assert.strictEqual(u.type, 'avoir'); assert.strictEqual(u.vendeur.siren, '957200000'); assert.strictEqual(u.vendeur.nom, 'Descours & Cabot');
  assert.strictEqual(u.refFacture, 'F-701'); assert.strictEqual(u.totalTTC, 60); assert.strictEqual(u.lignes[0].designation, 'Retour joints');
  const p = await FacturX.lireFichier(new Uint8Array(pdfFacturX(CII('TV-2', 'X'))), b => zlib.inflateSync(Buffer.from(b)));
  assert.strictEqual(p.pdf, true); assert.strictEqual(p.facture.numero, 'TV-2');
  await assert.rejects(FacturX.lireFichier(new Uint8Array(Buffer.from('%PDF-1.4\nrien\n%%EOF')), b => zlib.inflateSync(Buffer.from(b))), /Factur-X/);
  assert.throws(() => FacturX.lireXML('<html><body/></html>'), /Format non reconnu/);
});

test('réception par la plateforme, import, dossiers de dépôt', async () => {
  const admin = await login('admin', 'admin-test-pw');
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire' }, admin);
  await call('POST', '/api/accounts', { login: 'op', password: 'motdepasse2', role: 'atelier', nom: 'Op' }, admin);
  const claire = await login('claire', 'motdepasse1'), op = await login('op', 'motdepasse2');

  // Adresse de dépôt fermée tant qu'elle n'est pas activée
  assert.strictEqual((await call('POST', '/api/efacture/depot/x', CII('A', 'B'), null, { 'Content-Type': 'application/xml' })).status, 404);
  assert.strictEqual((await call('PUT', '/api/efacture/config', { webhook: true }, claire)).status, 403);
  const inbox = path.join(dir, 'recues'), outbox = path.join(dir, 'a_envoyer');
  fs.mkdirSync(inbox);
  const cfg = (await call('PUT', '/api/efacture/config', { plateforme: 'Plateforme test', webhook: true, dossierEntree: inbox, dossierSortie: outbox }, admin)).body;
  assert.match(cfg.jeton, /^[0-9a-f]{48}$/);
  assert.strictEqual((await call('POST', '/api/efacture/depot/mauvais-jeton', CII('A', 'B'), null, { 'Content-Type': 'application/xml' })).status, 404);

  // Dépôt brut (XML) puis doublon, dépôt d'un PDF Factur-X en JSON
  const r1 = await call('POST', `/api/efacture/depot/${cfg.jeton}`, CII('TV-100', 'CH-2026-001'), null, { 'Content-Type': 'application/xml', 'X-Filename': 'TV-100.xml' });
  assert.strictEqual(r1.status, 200); assert.strictEqual(r1.body.doublon, false);
  assert.strictEqual((await call('POST', `/api/efacture/depot/${cfg.jeton}`, CII('TV-100', 'CH-2026-001'), null, { 'Content-Type': 'application/xml' })).body.doublon, true);
  const r2 = await call('POST', `/api/efacture/depot/${cfg.jeton}`, { nom: 'TV-101.pdf', base64: pdfFacturX(CII('TV-101', 'X')).toString('base64') }, null);
  assert.strictEqual(r2.status, 200);
  assert.strictEqual((await call('POST', `/api/efacture/depot/${cfg.jeton}`, '<html/>', null, { 'Content-Type': 'application/xml' })).status, 422);

  const data = (await call('GET', '/api/data', null, claire)).body;
  const recu = data.efactures.find(e => e.numero === 'TV-100');
  assert.strictEqual(recu.statut, 'Reçue'); assert.strictEqual(recu.origine, 'plateforme'); assert.strictEqual(recu.vendeur.siren, '338200000');
  assert.ok(data.efactures.find(e => e.numero === 'TV-101').pdfId);
  // Le XML reçu est servi en téléchargement, jamais interprété par le navigateur
  const fx = await fetch(`${base}/api/files/${recu.xmlId}`, { headers: { Cookie: claire } });
  assert.match(fx.headers.get('content-disposition'), /attachment/); assert.strictEqual(fx.headers.get('content-security-policy'), 'sandbox');

  // Import manuel (bureaux uniquement)
  assert.strictEqual((await call('POST', '/api/efacture/import', { nom: 'av.xml', base64: Buffer.from(UBL).toString('base64') }, op)).status, 403);
  const imp = await call('POST', '/api/efacture/import', { nom: 'av.xml', base64: Buffer.from(UBL).toString('base64') }, claire);
  assert.strictEqual(imp.status, 200); assert.strictEqual(imp.body.type, 'avoir');

  // Dossier surveillé : le fichier est intégré puis rangé dans « traites » (ou « erreurs »)
  fs.writeFileSync(path.join(inbox, 'TV-200.xml'), CII('TV-200', 'X'));
  fs.writeFileSync(path.join(inbox, 'pas-une-facture.xml'), '<html/>');
  fs.writeFileSync(path.join(inbox, 'notes.txt'), 'ignoré');
  const sc = await call('POST', '/api/efacture/scruter', {}, claire);
  assert.strictEqual(sc.body.traites, 1);
  assert.strictEqual(fs.readdirSync(path.join(inbox, 'traites')).length, 1);
  assert.ok(fs.readdirSync(path.join(inbox, 'erreurs')).some(f => f.endsWith('.erreur.txt')));
  assert.ok(fs.existsSync(path.join(inbox, 'notes.txt')));

  // Dépôt d'une facture émise dans le dossier d'envoi
  const em = await call('POST', '/api/efacture/emettre', { nom: 'Facture-FA-2026-0001', xml: CII('FA-2026-0001', ''), pdfBase64: Buffer.from('%PDF-1.4').toString('base64') }, claire);
  assert.strictEqual(em.status, 200);
  assert.deepStrictEqual(fs.readdirSync(outbox).sort(), ['Facture-FA-2026-0001.pdf', 'Facture-FA-2026-0001.xml']);
  assert.strictEqual((await call('POST', '/api/efacture/emettre', { nom: 'x', xml: 'pas du xml' }, claire)).status, 400);
  assert.deepStrictEqual((await call('GET', '/api/efacture/etat', null, claire)).body, { plateforme: 'Plateforme test', entree: true, sortie: true, webhook: true });
});
