// Lecture des factures électroniques (réforme française 2026) : Factur-X / ZUGFeRD (PDF avec XML CII joint),
// XML CII (UN/CEFACT CrossIndustryInvoice) et XML UBL 2.1 (Invoice / CreditNote).
// Fichier partagé : utilisé par le serveur (Node.js, réception par dossier ou plateforme) et par le navigateur.
const FacturX = (() => {
  /* ---------- Analyseur XML minimal (sans dépendance) ---------- */
  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));
  const local = n => n.slice(n.indexOf(':') + 1);
  function parseXML(xml) {
    const racine = { name: '#doc', attrs: {}, children: [], text: '' }, pile = [racine];
    const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(xml))) {
      const haut = pile[pile.length - 1];
      if (m[1] !== undefined) haut.text += m[1];
      else if (m[2]) { if (pile.length > 1) pile.pop(); }
      else if (m[3]) {
        const attrs = {};
        (m[4] || '').replace(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (x, k, v, a, b) => { attrs[local(k)] = decode(a ?? b ?? ''); });
        const el = { name: local(m[3]), attrs, children: [], text: '' };
        haut.children.push(el);
        if (!m[5]) pile.push(el);
      } else if (m[6] !== undefined) haut.text += decode(m[6]);
    }
    return racine.children[0] || null;
  }
  const enfant = (n, nom) => (n ? n.children.find(c => c.name === nom) : null);
  const chemin = (n, p) => p.split('/').reduce((x, nom) => enfant(x, nom), n);
  const txt = (n, p) => { const x = p ? chemin(n, p) : n; return x ? x.text.trim() : ''; };
  const tous = (n, nom) => (n ? n.children.filter(c => c.name === nom) : []);
  const descendants = (n, nom, out = []) => { if (!n) return out; n.children.forEach(c => { if (c.name === nom) out.push(c); descendants(c, nom, out); }); return out; };
  const nombre = s => { const v = parseFloat(String(s || '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const date102 = s => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '').slice(0, 10));
  const siren = s => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(0, 9) : ''; };

  /* ---------- CII (Factur-X) ---------- */
  function partieCII(p) {
    if (!p) return {};
    const adr = enfant(p, 'PostalTradeAddress');
    const legal = txt(p, 'SpecifiedLegalOrganization/ID');
    const tva = tous(p, 'SpecifiedTaxRegistration').map(r => enfant(r, 'ID')).find(i => i && (i.attrs.schemeID || '').toUpperCase() === 'VA');
    return { nom: txt(p, 'Name') || txt(p, 'SpecifiedLegalOrganization/TradingBusinessName'), siret: legal.replace(/\D/g, '').length === 14 ? legal.replace(/\D/g, '') : '', siren: siren(legal),
      tva: tva ? tva.text.trim() : '', adresse: adr ? txt(adr, 'LineOne') : '', cp: adr ? txt(adr, 'PostcodeCode') : '', ville: adr ? txt(adr, 'CityName') : '', email: txt(p, 'URIUniversalCommunication/URIID') };
  }
  function lireCII(r) {
    const doc = enfant(r, 'ExchangedDocument'), tr = enfant(r, 'SupplyChainTradeTransaction');
    const acc = enfant(tr, 'ApplicableHeaderTradeAgreement'), reg = enfant(tr, 'ApplicableHeaderTradeSettlement');
    const tot = enfant(reg, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    const typeCode = txt(doc, 'TypeCode');
    const lignes = tous(tr, 'IncludedSupplyChainTradeLineItem').map(l => {
      const q = chemin(l, 'SpecifiedLineTradeDelivery/BilledQuantity');
      return { designation: txt(l, 'SpecifiedTradeProduct/Name'), reference: txt(l, 'SpecifiedTradeProduct/SellerAssignedID'), qte: nombre(q && q.text), unite: q ? q.attrs.unitCode || '' : '',
        pu: nombre(txt(l, 'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount')), montantHT: nombre(txt(l, 'SpecifiedLineTradeSettlement/SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount')),
        tauxTVA: nombre(txt(l, 'SpecifiedLineTradeSettlement/ApplicableTradeTax/RateApplicablePercent')) };
    });
    const taxe = descendants(tot, 'TaxTotalAmount')[0];
    return {
      format: 'CII', type: ['381', '261', '262', '396', '532'].includes(typeCode) ? 'avoir' : 'facture', typeCode,
      numero: txt(doc, 'ID'), date: date102(txt(doc, 'IssueDateTime/DateTimeString')), echeance: date102(txt(reg, 'SpecifiedTradePaymentTerms/DueDateDateTime/DateTimeString')),
      devise: txt(reg, 'InvoiceCurrencyCode') || 'EUR', vendeur: partieCII(enfant(acc, 'SellerTradeParty')), acheteur: partieCII(enfant(acc, 'BuyerTradeParty')),
      refCommande: txt(acc, 'BuyerOrderReferencedDocument/IssuerAssignedID'), refAcheteur: txt(acc, 'BuyerReference'), refFacture: txt(reg, 'InvoiceReferencedDocument/IssuerAssignedID'),
      totalHT: nombre(txt(tot, 'TaxBasisTotalAmount')), totalTVA: nombre(taxe && taxe.text), totalTTC: nombre(txt(tot, 'GrandTotalAmount')), netAPayer: nombre(txt(tot, 'DuePayableAmount')),
      iban: txt(reg, 'SpecifiedTradeSettlementPaymentMeans/PayeePartyCreditorFinancialAccount/IBANID'),
      notes: tous(doc, 'IncludedNote').map(n => txt(n, 'Content')).filter(Boolean), lignes,
    };
  }

  /* ---------- UBL 2.1 ---------- */
  function partieUBL(p) {
    const party = enfant(p, 'Party');
    if (!party) return {};
    const legal = enfant(party, 'PartyLegalEntity'), adr = enfant(party, 'PostalAddress');
    const id = txt(legal, 'CompanyID') || tous(party, 'PartyIdentification').map(x => txt(x, 'ID')).find(Boolean) || '';
    return { nom: txt(party, 'PartyName/Name') || txt(legal, 'RegistrationName'), siret: id.replace(/\D/g, '').length === 14 ? id.replace(/\D/g, '') : '', siren: siren(id),
      tva: txt(party, 'PartyTaxScheme/CompanyID'), adresse: adr ? txt(adr, 'StreetName') : '', cp: adr ? txt(adr, 'PostalZone') : '', ville: adr ? txt(adr, 'CityName') : '', email: txt(party, 'EndpointID') };
  }
  function lireUBL(r) {
    const avoir = r.name === 'CreditNote', tot = enfant(r, 'LegalMonetaryTotal');
    const lignes = tous(r, avoir ? 'CreditNoteLine' : 'InvoiceLine').map(l => {
      const q = enfant(l, avoir ? 'CreditedQuantity' : 'InvoicedQuantity');
      return { designation: txt(l, 'Item/Name'), reference: txt(l, 'Item/SellersItemIdentification/ID'), qte: nombre(q && q.text), unite: q ? q.attrs.unitCode || '' : '',
        pu: nombre(txt(l, 'Price/PriceAmount')), montantHT: nombre(txt(l, 'LineExtensionAmount')), tauxTVA: nombre(txt(l, 'Item/ClassifiedTaxCategory/Percent')) };
    });
    return {
      format: 'UBL', type: avoir || txt(r, 'InvoiceTypeCode') === '381' ? 'avoir' : 'facture', typeCode: txt(r, avoir ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'),
      numero: txt(r, 'ID'), date: txt(r, 'IssueDate'), echeance: txt(r, 'DueDate') || txt(r, 'PaymentMeans/PaymentDueDate'), devise: txt(r, 'DocumentCurrencyCode') || 'EUR',
      vendeur: partieUBL(enfant(r, 'AccountingSupplierParty')), acheteur: partieUBL(enfant(r, 'AccountingCustomerParty')),
      refCommande: txt(r, 'OrderReference/ID'), refAcheteur: txt(r, 'BuyerReference'), refFacture: txt(r, 'BillingReference/InvoiceDocumentReference/ID'),
      totalHT: nombre(txt(tot, 'TaxExclusiveAmount')), totalTVA: nombre(txt(r, 'TaxTotal/TaxAmount')), totalTTC: nombre(txt(tot, 'TaxInclusiveAmount')), netAPayer: nombre(txt(tot, 'PayableAmount')),
      iban: txt(r, 'PaymentMeans/PayeeFinancialAccount/ID'), notes: tous(r, 'Note').map(n => n.text.trim()).filter(Boolean), lignes,
    };
  }

  function lireXML(xml) {
    const r = parseXML(String(xml).replace(/^﻿/, ''));
    if (!r) throw new Error('Fichier XML vide ou illisible');
    if (r.name === 'CrossIndustryInvoice') return lireCII(r);
    if (r.name === 'Invoice' || r.name === 'CreditNote') return lireUBL(r);
    throw new Error(`Format non reconnu (${r.name}) : CII (Factur-X) ou UBL attendu`);
  }

  /* ---------- PDF Factur-X : XML CII joint au PDF ---------- */
  const latin1 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return s; };
  const utf8 = b => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(b) : Buffer.from(b).toString('utf8'));
  // inflate : (Uint8Array) => Uint8Array | Promise<Uint8Array> (zlib côté serveur, DecompressionStream côté navigateur)
  async function xmlDuPDF(bytes, inflate) {
    const s = latin1(bytes), re = />>\s*stream\r?\n/g;
    let m;
    while ((m = re.exec(s))) {
      // Dictionnaire du flux : depuis le début de l'objet (« n 0 obj ») jusqu'au mot-clé stream
      const debObj = s.lastIndexOf(' obj', m.index), dict = s.slice(debObj < 0 ? Math.max(0, m.index - 2000) : debObj, m.index + 2), debut = m.index + m[0].length;
      const lg = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict); // longueur directe, sinon recherche de « endstream »
      const fin = lg && !lg[2] ? debut + parseInt(lg[1], 10) : s.indexOf('endstream', debut);
      if (fin <= debut) continue;
      let f2 = fin;
      if (!(lg && !lg[2])) while (f2 > debut && (bytes[f2 - 1] === 0x0a || bytes[f2 - 1] === 0x0d)) f2--; // fin de ligne avant endstream
      let data = bytes.subarray(debut, f2);
      if (/\/FlateDecode/.test(dict)) { try { data = await inflate(data); } catch (e) { continue; } }
      else if (/\/Filter/.test(dict)) continue;
      const t = utf8(data);
      if (/<(\w+:)?CrossIndustryInvoice[\s>]|<Invoice[\s>]|<CreditNote[\s>]/.test(t.slice(0, 2000))) return t.slice(t.indexOf('<'));
    }
    return null;
  }
  const estPDF = b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

  // Point d'entrée : octets d'un fichier (PDF Factur-X ou XML) -> { facture, xml, pdf }
  async function lireFichier(bytes, inflate) {
    if (estPDF(bytes)) {
      const xml = await xmlDuPDF(bytes, inflate);
      if (!xml) throw new Error('PDF sans données Factur-X : ce n\'est pas une facture électronique (PDF simple).');
      return { facture: lireXML(xml), xml, pdf: true };
    }
    const xml = utf8(bytes);
    return { facture: lireXML(xml), xml, pdf: false };
  }

  return { parseXML, lireXML, lireFichier, xmlDuPDF };
})();
if (typeof module !== 'undefined') module.exports = FacturX;
