// Mise en page de la liasse documentaire : logo, identité, couleur, mentions, options d'affichage par type de document.
// Réglages stockés dans settings.doc = { logoId, couleur, police, ..., types: { devis: { titre, intro, conditions, <option>: bool } } }

const DOC_TYPES = {
  devis: { label: 'Devis', titre: 'DEVIS', conditions: '', options: [
    ['numeros', 'Colonne N° (numérotation des chapitres et des lignes)', true], ['quantites', 'Quantités et unités', true], ['prix', 'Prix unitaires et totaux par ligne (sinon : prix par chapitre, ou prix global)', true],
    ['detail', 'Descriptifs sous les ouvrages', true], ['sousTotaux', 'Sous-totaux par chapitre', true], ['ajustements', 'Détail des remises et majorations', true],
    ['contact', 'Contact client (à l\'attention de)', true], ['lieu', 'Lieu d\'intervention', true], ['charge', 'Chargé d\'affaires', true],
    ['validite', 'Durée de validité', true], ['signature', 'Cadre « Bon pour accord »', true]] },
  facture: { label: 'Facture', titre: 'FACTURE', conditions: '', options: [
    ['numeros', 'Colonne N° (numérotation des chapitres et des lignes)', true], ['quantites', 'Quantités et unités', true], ['prix', 'Prix unitaires et totaux par ligne (sinon : prix par chapitre, ou prix global)', true],
    ['detail', 'Descriptifs sous les ouvrages', true], ['sousTotaux', 'Sous-totaux par chapitre', true], ['ajustements', 'Détail des remises et majorations', true],
    ['contact', 'Contact client (à l\'attention de)', true], ['lieu', 'Lieu d\'intervention', true], ['charge', 'Chargé d\'affaires', true],
    ['references', 'Références devis / situation', true], ['rib', 'Coordonnées bancaires (RIB)', true], ['penalites', 'Mentions légales de retard de paiement', true], ['mentions2026', 'Mentions de la réforme 2026 (SIREN du client, catégorie de l\'opération)', true]] },
  avoir: { label: 'Avoir', titre: 'AVOIR', conditions: 'Avoir à valoir sur nos prochaines factures ou remboursé sur simple demande.', options: [
    ['numeros', 'Colonne N° (numérotation des chapitres et des lignes)', true], ['quantites', 'Quantités et unités', true], ['prix', 'Prix unitaires et totaux par ligne', true],
    ['detail', 'Descriptifs sous les ouvrages', true], ['sousTotaux', 'Sous-totaux par chapitre', true], ['ajustements', 'Détail des remises et majorations', true],
    ['contact', 'Contact client (à l\'attention de)', true], ['lieu', 'Lieu d\'intervention', true], ['charge', 'Chargé d\'affaires', true], ['references', 'Référence de la facture d\'origine', true], ['mentions2026', 'Mentions de la réforme 2026 (SIREN du client, catégorie de l\'opération)', true]] },
  situation: { label: 'Situation de travaux', titre: 'SITUATION DE TRAVAUX', conditions: '', options: [
    ['marche', 'Colonne montant du marché', true], ['precedent', 'Colonnes cumul et précédent', true], ['maitreOuvrage', 'Maître d\'ouvrage et site', true], ['signature', 'Cadre « Bon pour accord » de la maîtrise d\'œuvre', true]] },
  commande: { label: 'Bon de commande fournisseur', titre: 'BON DE COMMANDE', conditions: 'Merci de rappeler le numéro de commande sur le bon de livraison et la facture.', options: [
    ['prix', 'Prix (sinon : bon de commande non chiffré)', true], ['chantier', 'Chantier concerné', true], ['livraison', 'Adresse et date de livraison', true]] },
  demandePrix: { label: 'Demande de prix fournisseur', titre: 'DEMANDE DE PRIX', conditions: 'Merci de nous faire parvenir votre meilleure offre, avec le délai de livraison et la validité de vos prix.', options: [
    ['chantier', 'Chantier concerné', true], ['livraison', 'Adresse et date de livraison', true]] },
  attachement: { label: 'Attachement hors devis', titre: 'ATTACHEMENT DE TRAVAUX EN RÉGIE', conditions: '', options: [
    ['prix', 'Prix et montants', true], ['demande', 'Description de la demande', true], ['contact', 'Demandeur', true], ['signature', 'Cadre « Bon pour commande »', true]] },
  bon: { label: 'Bon d\'intervention', titre: 'BON D\'INTERVENTION', conditions: '', options: [
    ['heures', 'Tableau des heures', true], ['horaires', 'Horaires d\'arrivée et de départ', true], ['materiel', 'Matériel fourni', true],
    ['intervenants', 'Noms des intervenants', true], ['photos', 'Photos', true], ['observations', 'Observations', true]] },
  pv: { label: 'PV de réception', titre: '', conditions: '', options: [['presents', 'Liste des présents', true], ['observations', 'Observations', true]] },
};

const DOC_POLICES = { sans: 'Système (sans empattement)', serif: 'Classique (avec empattement)', mono: 'Technique (chasse fixe)' };
const DOC_FONT = { sans: 'inherit', serif: "Georgia, 'Times New Roman', serif", mono: "'Courier New', ui-monospace, monospace" };
const PENALITES = 'En cas de retard de paiement, pénalités au taux de trois fois le taux d\'intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce). Pas d\'escompte pour paiement anticipé.';

const Doc = {
  draft: null, // réglages en cours d'édition (aperçu en direct)
  cfg() { return this.draft || Store.data.settings.doc || {}; },
  // Options d'un type de document, valeurs par défaut comprises
  t(type) {
    const def = DOC_TYPES[type], c = (this.cfg().types || {})[type] || {};
    const o = { titre: c.titre || def.titre, intro: c.intro || '', conditions: c.conditions !== undefined ? c.conditions : def.conditions };
    def.options.forEach(([k, , d]) => { o[k] = c[k] !== undefined ? !!c[k] : d; });
    return o;
  },
  style() {
    const c = this.cfg();
    return `--doc-accent:${/^#[0-9a-f]{6}$/i.test(c.couleur || '') ? c.couleur : '#8f2f1a'};--doc-font:${DOC_FONT[c.police] || 'inherit'};--doc-logo-h:${Math.min(160, Math.max(30, num(c.logoHauteur) || 60))}px`;
  },
  appliquer() { this.style().split(';').forEach(d => { const i = d.indexOf(':'); document.documentElement.style.setProperty(d.slice(0, i), d.slice(i + 1)); }); },
  // En-tête : logo + identité de la société à gauche, titre et références à droite
  entete(type, titre, refs) {
    const s = Store.data.settings, c = this.cfg();
    const lignes = [
      c.logoId && c.masquerNom ? '' : `<strong>${esc(s.societe)}</strong>`,
      esc(s.adresse),
      [c.tel && `Tél. ${esc(c.tel)}`, c.email && esc(c.email), c.web && esc(c.web)].filter(Boolean).join(' · '),
      [s.siret && `SIRET ${esc(s.siret)}`, c.tvaIntra && `TVA ${esc(c.tvaIntra)}`].filter(Boolean).join(' · '),
    ].filter(Boolean);
    return `<div class="doc-head logo-${c.logoPosition === 'centre' ? 'centre' : 'gauche'}">
      <div class="doc-societe">${c.logoId ? `<img class="doc-logo" src="${fileUrl(c.logoId)}" alt="${esc(s.societe)}">` : ''}<div>${lignes.join('<br>')}</div></div>
      <div class="doc-ref"><strong class="doc-titre">${esc(titre)}</strong>${refs ? `<br>${refs}` : ''}</div></div>`;
  },
  intro(type) { const t = this.t(type); return t.intro ? `<p class="doc-intro pre">${esc(t.intro)}</p>` : ''; },
  // Bas de document : conditions, RIB, pénalités, pied de page légal
  pied(type, extra = '', signatures = '') {
    const t = this.t(type), c = this.cfg();
    const rib = t.rib && c.iban ? `<p class="doc-rib"><strong>Règlement par virement</strong>${c.banque ? ` · ${esc(c.banque)}` : ''}<br>IBAN ${esc(c.iban)}${c.bic ? ` · BIC ${esc(c.bic)}` : ''}</p>` : '';
    return `${extra}${t.conditions ? `<p class="doc-conditions pre">${esc(t.conditions)}</p>` : ''}${rib}${t.penalites ? `<p class="doc-conditions">${PENALITES}</p>` : ''}${signatures}
      <div class="doc-pied">${esc(this.piedLegal())}</div>`;
  },
  piedLegal() {
    const c = this.cfg(), s = Store.data.settings;
    return c.pied || [s.societe, c.formeJuridique && `${c.formeJuridique}${c.capital ? ` au capital de ${c.capital}` : ''}`, c.rcs && `RCS ${c.rcs}`, s.siret && `SIRET ${s.siret}`, c.ape && `APE ${c.ape}`, c.tvaIntra && `TVA intracommunautaire ${c.tvaIntra}`].filter(Boolean).join(' – ');
  },
};

/* ---------- Écran de paramétrage ---------- */
const DOC_IDENTITE = [
  { key: 'tel', label: 'Téléphone' }, { key: 'email', label: 'E-mail' }, { key: 'web', label: 'Site web' },
  { key: 'tvaIntra', label: 'N° TVA intracommunautaire' }, { key: 'formeJuridique', label: 'Forme juridique (SAS, SARL…)' }, { key: 'capital', label: 'Capital (ex. 50 000 €)' },
  { key: 'rcs', label: 'RCS (ville et numéro)' }, { key: 'ape', label: 'Code APE' },
  { key: 'banque', label: 'Banque' }, { key: 'iban', label: 'IBAN' }, { key: 'bic', label: 'BIC' },
];
let docEdit = { type: 'devis' };

// Document d'exemple de chaque type, rendu avec les réglages en cours
function apercuDocument(type) {
  const tmp = document.createElement('div');
  const first = (col, f = () => true) => Store.all(col).filter(f).sort((a, b) => String(b.numero || b.code || '').localeCompare(String(a.numero || a.code || '')))[0];
  const rendre = html => { tmp.innerHTML = html; const d = tmp.querySelector('.doc-print'); return d ? d.innerHTML : ''; };
  let x;
  if (type === 'devis' && (x = first('devis', d => (d.lignes || []).length))) return rendre(Views.devis([x.id], new URLSearchParams()));
  if (type === 'facture' && (x = first('factures', f => f.type !== 'avoir'))) return rendre(Views.facture([x.id]));
  if (type === 'avoir' && (x = first('factures', f => f.type === 'avoir'))) return rendre(Views.facture([x.id]));
  if (type === 'situation' && (x = first('situations'))) return rendre(Views.situations([x.id], new URLSearchParams()));
  if (type === 'commande' && (x = first('commandes', c => (c.lignes || []).length))) return rendre(Views.commandes([x.id], new URLSearchParams()));
  if (type === 'demandePrix' && (x = first('commandes', c => (c.lignes || []).length))) return commandeDocument(x, 'demandePrix');
  if (type === 'attachement' && (x = first('affaires', estHorsDevis))) return attachementHD(x, Calc.horsDevis(x));
  if (type === 'bon' && (x = first('rapports', r => r.signatureClientId) || first('rapports'))) return rendre(Views.bon([x.id]));
  if (type === 'pv' && (x = first('receptions'))) return rendre(Views.pv([x.id]));
  return '<p class="muted">Aucun document de ce type pour l\'aperçu : créez-en un pour le voir ici.</p>';
}

Views.documents = () => {
  const admin = Store.can('admin');
  if (!Doc.draft) Doc.draft = JSON.parse(JSON.stringify(Store.data.settings.doc || {}));
  const c = Doc.draft, type = docEdit.type, t = Doc.t(type), def = DOC_TYPES[type];
  const dis = admin ? '' : 'disabled';
  return `<div class="toolbar"><a href="#/parametres" class="btn secondary">← Paramètres</a><span class="spacer"></span>
    ${admin ? '<button class="secondary" id="dm-annuler">Annuler les modifications</button><button id="dm-save">Enregistrer</button>' : ''}</div>
  <h1>Mise en page des documents</h1>
  ${admin ? '' : '<p class="note">Seul un administrateur peut modifier la mise en page.</p>'}
  <div class="doc-config">
    <div class="doc-form">
      <details class="card" open><summary><strong>Identité et logo</strong> <span class="muted small">(tous les documents)</span></summary>
        <div class="logo-zone">${c.logoId ? `<img class="doc-logo" src="${fileUrl(c.logoId)}" alt="Logo actuel">` : '<span class="muted">Aucun logo</span>'}
          ${admin ? `<label class="btn secondary">${c.logoId ? 'Changer le logo' : 'Ajouter un logo'}<input type="file" id="dm-logo" accept="image/png,image/jpeg,image/webp" hidden></label>${c.logoId ? '<button class="secondary" id="dm-logo-del">Retirer</button>' : ''}` : ''}</div>
        <p class="muted small">PNG à fond transparent conseillé. Nom, adresse et SIRET se modifient dans Paramètres → Société.</p>
        <div class="grid2">
          <div class="field"><label for="dm-hauteur">Hauteur du logo (px)</label><input id="dm-hauteur" type="number" min="30" max="160" step="5" value="${esc(c.logoHauteur || 60)}" ${dis}></div>
          <div class="field"><label for="dm-position">Position du logo</label><select id="dm-position" ${dis}><option value="gauche">À gauche, avec les coordonnées</option><option value="centre" ${c.logoPosition === 'centre' ? 'selected' : ''}>Centré au-dessus</option></select></div>
          <div class="field"><label for="dm-couleur">Couleur des titres et tableaux</label><input id="dm-couleur" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c.couleur || '') ? c.couleur : '#8f2f1a')}" ${dis}></div>
          <div class="field"><label for="dm-police">Police</label><select id="dm-police" ${dis}>${Object.entries(DOC_POLICES).map(([k, l]) => `<option value="${k}" ${(c.police || 'sans') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <label class="check"><input type="checkbox" id="dm-masquer" ${c.masquerNom ? 'checked' : ''} ${dis}> Le logo contient déjà le nom de la société (ne pas le répéter)</label>
        <div class="grid2" style="margin-top:8px">${DOC_IDENTITE.map(f => `<div class="field"><label for="dm-${f.key}">${f.label}</label><input id="dm-${f.key}" data-id="${f.key}" value="${esc(c[f.key] || '')}" ${dis}></div>`).join('')}</div>
        <div class="field"><label for="dm-pied">Pied de page (laisser vide pour le composer automatiquement)</label><textarea id="dm-pied" rows="2" ${dis}>${esc(c.pied || '')}</textarea></div>
      </details>

      <div class="card">
        <div class="field"><label for="dm-type">Document</label><select id="dm-type">${Object.entries(DOC_TYPES).map(([k, d]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${d.label}</option>`).join('')}</select></div>
        ${def.titre ? `<div class="field"><label for="dm-titre">Titre</label><input id="dm-titre" value="${esc(t.titre)}" ${dis}></div>` : ''}
        <fieldset class="doc-opts"><legend>Éléments affichés</legend>
          ${def.options.map(([k, l]) => `<label class="check"><input type="checkbox" data-opt="${k}" ${t[k] ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}
          ${type === 'facture' && t.rib && !c.iban ? '<p class="warn-text small">Renseignez l\'IBAN dans « Identité et logo » pour afficher le RIB.</p>' : ''}
        </fieldset>
        <div class="field"><label for="dm-intro">Texte d'introduction (sous l'objet)</label><textarea id="dm-intro" rows="2" ${dis}>${esc(t.intro)}</textarea></div>
        <div class="field"><label for="dm-cond">Conditions (bas du document)</label><textarea id="dm-cond" rows="4" placeholder="Conditions de paiement, délais, garanties, exclusions…" ${dis}>${esc(t.conditions)}</textarea></div>
      </div>
    </div>
    <div class="doc-apercu"><div class="label muted small">Aperçu : ${esc(def.label.toLowerCase())}</div><div class="doc-print" id="dm-apercu">${apercuDocument(type)}</div></div>
  </div>`;
};

Views.documents.bind = root => {
  const c = Doc.draft, q = s => root.querySelector(s);
  const typeCfg = () => { c.types = c.types || {}; return (c.types[docEdit.type] = c.types[docEdit.type] || {}); };
  const apercu = () => { Doc.appliquer(); q('#dm-apercu').innerHTML = apercuDocument(docEdit.type); };
  apercu();
  q('#dm-type').onchange = e => { docEdit.type = e.target.value; App.render(); };
  if (!Store.can('admin')) return;
  const val = (sel, k, f = v => v) => { const el = q(sel); if (el) el.oninput = el.onchange = () => { c[k] = f(el.type === 'checkbox' ? el.checked : el.value); apercu(); }; };
  val('#dm-hauteur', 'logoHauteur', Number); val('#dm-position', 'logoPosition'); val('#dm-couleur', 'couleur'); val('#dm-police', 'police');
  val('#dm-masquer', 'masquerNom'); val('#dm-pied', 'pied');
  DOC_IDENTITE.forEach(f => val(`#dm-${f.key}`, f.key, v => v.trim()));
  const tval = (sel, k) => { const el = q(sel); if (el) el.oninput = () => { typeCfg()[k] = el.value; apercu(); }; };
  tval('#dm-titre', 'titre'); tval('#dm-intro', 'intro'); tval('#dm-cond', 'conditions');
  root.querySelectorAll('[data-opt]').forEach(el => el.onchange = () => { typeCfg()[el.dataset.opt] = el.checked; apercu(); });
  q('#dm-logo').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const dataUrl = await logoImage(file);
      const { id } = await api('POST', '/api/files', { dataUrl });
      c.logoId = id; App.render();
    } catch (err) { notify('Logo illisible : ' + err.message); }
  };
  const del = q('#dm-logo-del'); if (del) del.onclick = () => { delete c.logoId; App.render(); };
  q('#dm-annuler').onclick = () => { Doc.draft = null; App.render(); };
  q('#dm-save').onclick = async () => {
    try { await Store.saveSettings({ ...Store.data.settings, doc: c }); Doc.draft = null; App.render(); App.toast('Mise en page enregistrée'); }
    catch (err) { notify(err.message); }
  };
};

// Logo : redimensionné (600 px max), transparence conservée en PNG
function logoImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 600 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('format non reconnu')); };
    img.src = url;
  });
}
