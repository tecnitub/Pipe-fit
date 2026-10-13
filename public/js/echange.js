// Import / export Excel des listes de référence : fournitures, main-d'œuvre, entreprises (et leurs sites), contacts.
// Principe : exporter, modifier dans Excel, réimporter. La colonne ID garantit la mise à jour des bonnes fiches ;
// sans ID, on rapproche par référence, SIRET, nom ou e-mail. Une cellule vide ne remplace pas la valeur existante.
const normTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function parseNombre(v) {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[\s €$%]/g, '');
  if (!t) return '';
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  return isNaN(+t) ? '' : +t;
}
const cellTxt = v => (v === null || v === undefined) ? '' : String(v).trim();
const ouiNon = v => /^(oui|o|x|1|vrai|true|yes)$/i.test(cellTxt(v));

function categorieDepuis(v, defaut) {
  const n = normTxt(v);
  if (!n) return defaut;
  if (/maitr|moe|ingenierie/.test(n)) return "Maîtrise d'œuvre";
  if (/client/.test(n) && /fourn/.test(n)) return 'Client et fournisseur';
  if (/fourn|sous trait|presta/.test(n)) return 'Fournisseur';
  return 'Client';
}

// Recherche ou création d'une entreprise à partir de son nom (pendant un import)
function entrepriseParNom(nom, ctx, categorie) {
  const n = normTxt(nom);
  if (!n) return '';
  const found = Store.all('entreprises').find(e => normTxt(e.nom) === n) || ctx.nouvelles.find(e => normTxt(e.nom) === n);
  if (found) return found.id;
  if (!ctx.creerEntreprises) return '';
  const e = { id: uid(), nom: cellTxt(nom), categorie, secteur: '', adresses: [] };
  ctx.nouvelles.push(e);
  return e.id;
}

const ID_FIELD = { key: 'id', label: 'ID (ne pas modifier)', syn: ['id', 'identifiant'] };
const ECHANGES = {
  articles: {
    titre: 'fournitures', col: 'articles', fichier: 'bibliotheque-fournitures', feuille: 'Fournitures',
    fields: [ID_FIELD,
      { key: 'ref', label: 'Référence', syn: ['ref', 'reference', 'code', 'code article', 'ref article', 'reference article', 'ref fournisseur'] },
      { key: 'designation', label: 'Désignation', required: true, syn: ['designation', 'libelle', 'description', 'article', 'nom', 'produit'] },
      { key: 'famille', label: 'Famille', syn: ['categorie', 'groupe', 'famille article', 'sous famille'] },
      { key: 'unite', label: 'Unité', syn: ['unite', 'u', 'unite de vente', 'uv', 'conditionnement'] },
      { key: 'coutRevient', label: "Prix d'achat HT", num: true, syn: ['prix achat', 'pa', 'achat', 'prix d achat', 'cout', 'prix net', 'pa ht', 'prix d achat ht', 'prix net ht'] },
      { key: 'prixVente', label: 'Prix de vente HT', num: true, syn: ['prix vente', 'pv', 'vente', 'prix public', 'prix public ht', 'pu public', 'pu public ht', 'tarif', 'tarif public', 'prix', 'pu', 'pu ht', 'pu vente', 'prix unitaire', 'prix unitaire ht', 'prix de vente', 'prix de vente ht'] },
      { key: 'coef', label: 'Coefficient', num: true, export: true, syn: ['coef', 'coefficient'] },
      { key: 'poidsUnitaire', label: 'Poids (kg)', num: true, syn: ['poids', 'masse', 'kg', 'poids unitaire'] },
      { key: 'fournisseur', label: 'Fournisseur', syn: ['fournisseur habituel', 'fabricant', 'marque', 'distributeur'] },
    ],
    cle: v => normTxt(v.ref) || normTxt(v.designation),
    trouver: v => Store.all('articles').find(a => v.ref && normTxt(a.ref) === normTxt(v.ref)) || (!v.ref && Store.all('articles').find(a => normTxt(a.designation) === normTxt(v.designation))),
    appliquer(rec, v, ctx) {
      ['ref', 'designation', 'famille', 'unite'].forEach(k => { if (v[k] !== '') rec[k] = v[k]; });
      ['coutRevient', 'prixVente', 'poidsUnitaire'].forEach(k => { if (v[k] !== '') rec[k] = v[k]; });
      if (v.prixVente === '' && v.coutRevient !== '' && ctx.coef) rec.prixVente = Math.round(v.coutRevient * ctx.coef * 100) / 100;
      if (v.fournisseur) rec.fournisseurId = entrepriseParNom(v.fournisseur, ctx, 'Fournisseur');
      if (!rec.unite) rec.unite = 'u';
      return rec;
    },
    ligne: a => [a.id, a.ref, a.designation, a.famille, a.unite, num(a.coutRevient), num(a.prixVente), num(a.coutRevient) ? Math.round(num(a.prixVente) / num(a.coutRevient) * 100) / 100 : '', num(a.poidsUnitaire), a.fournisseurId ? clientName(a.fournisseurId) : ''],
    largeurs: [12, 16, 44, 16, 9, 14, 14, 11, 10, 28],
  },
  mainoeuvre: {
    titre: "taux de main-d'œuvre", col: 'mainoeuvre', fichier: 'bibliotheque-main-oeuvre', feuille: "Main-d'œuvre",
    fields: [ID_FIELD,
      { key: 'code', label: 'Code', syn: ['code', 'abreviation'] },
      { key: 'libelle', label: 'Catégorie', required: true, syn: ['categorie', 'libelle', 'qualification', 'designation', 'metier', 'poste'] },
      { key: 'tauxVente', label: 'Taux de vente €/h', num: true, syn: ['taux vente', 'taux de vente', 'prix vente', 'pv', 'taux horaire', 'tarif'] },
      { key: 'tauxCout', label: 'Coût horaire €/h', num: true, syn: ['cout', 'cout horaire', 'taux cout', 'cout moyen', 'cout charge'] },
    ],
    cle: v => normTxt(v.code) || normTxt(v.libelle),
    trouver: v => Store.all('mainoeuvre').find(m => (v.code && normTxt(m.code) === normTxt(v.code)) || normTxt(m.libelle) === normTxt(v.libelle)),
    appliquer(rec, v) { ['code', 'libelle', 'tauxVente', 'tauxCout'].forEach(k => { if (v[k] !== '') rec[k] = v[k]; }); return rec; },
    ligne: m => [m.id, m.code, m.libelle, num(m.tauxVente), num(m.tauxCout)],
    largeurs: [12, 10, 32, 16, 16],
  },
  entreprises: {
    titre: 'entreprises', col: 'entreprises', fichier: 'entreprises', feuille: 'Entreprises',
    fields: [ID_FIELD,
      { key: 'nom', label: 'Raison sociale', required: true, syn: ['nom', 'entreprise', 'societe', 'raison sociale', 'client', 'fournisseur', 'compte', 'denomination'] },
      { key: 'categorie', label: 'Catégorie', syn: ['type', 'categorie', 'nature', 'type de compte'] },
      { key: 'secteur', label: "Secteur d'activité", syn: ['secteur', 'activite', 'secteur activite', 'naf'] },
      { key: 'siret', label: 'SIRET', syn: ['siret', 'siren', 'n siret'] },
      { key: 'tvaIntra', label: 'N° TVA intracommunautaire', syn: ['tva', 'tva intra', 'numero tva', 'n tva', 'tva intracommunautaire'] },
      { key: 'tel', label: 'Téléphone', syn: ['tel', 'telephone', 'standard', 'telephone standard', 'phone'] },
      { key: 'email', label: 'E-mail', syn: ['email', 'mail', 'courriel', 'e mail', 'adresse mail'] },
      { key: 'web', label: 'Site web', syn: ['web', 'site internet', 'url', 'site web'] },
      { key: 'adresse', label: 'Adresse (facturation)', syn: ['adresse', 'adresse 1', 'rue', 'adresse facturation', 'voie'] },
      { key: 'cp', label: 'Code postal', syn: ['cp', 'code postal', 'postal'] },
      { key: 'ville', label: 'Ville', syn: ['ville', 'commune', 'localite'] },
      { key: 'notes', label: 'Notes', syn: ['notes', 'commentaire', 'remarques', 'observations'] },
    ],
    cle: v => String(v.siret || '').replace(/\D/g, '') || normTxt(v.nom),
    trouver: v => {
      const siret = String(v.siret || '').replace(/\D/g, '');
      return (siret && Store.all('entreprises').find(e => String(e.siret || '').replace(/\D/g, '') === siret)) || Store.all('entreprises').find(e => normTxt(e.nom) === normTxt(v.nom));
    },
    appliquer(rec, v, ctx) {
      ['nom', 'secteur', 'siret', 'tvaIntra', 'tel', 'email', 'web', 'notes'].forEach(k => { if (v[k] !== '') rec[k] = v[k]; });
      if (v.categorie !== '' || !rec.categorie) rec.categorie = categorieDepuis(v.categorie, rec.categorie || ctx.categorie);
      rec.adresses = (rec.adresses || []).map(s => ({ ...s }));
      if (v.adresse !== '' || v.cp !== '' || v.ville !== '') {
        let site = rec.adresses.find(s => s.facturation) || rec.adresses[0];
        if (!site) { site = { id: uid(), libelle: 'Siège', facturation: true }; rec.adresses.push(site); }
        if (v.adresse !== '') site.adresse = v.adresse;
        if (v.cp !== '') site.cp = String(v.cp);
        if (v.ville !== '') site.ville = v.ville;
      }
      return rec;
    },
    ligne: e => { const b = billingSite(e.id) || {}; return [e.id, e.nom, e.categorie || 'Client', e.secteur, e.siret, e.tvaIntra, e.tel, e.email, e.web, b.adresse, b.cp, b.ville, e.notes]; },
    largeurs: [12, 32, 20, 22, 18, 18, 15, 28, 20, 30, 10, 18, 30],
  },
  contacts: {
    titre: 'contacts', col: 'contacts', fichier: 'contacts', feuille: 'Contacts',
    fields: [ID_FIELD,
      { key: 'civilite', label: 'Civilité', syn: ['civilite', 'titre de civilite', 'mme / m.', 'genre'] },
      { key: 'prenom', label: 'Prénom', syn: ['prenom', 'first name'] },
      { key: 'nom', label: 'Nom', required: true, syn: ['nom', 'nom de famille', 'last name', 'contact', 'nom complet'] },
      { key: 'fonction', label: 'Fonction', syn: ['fonction', 'poste', 'titre', 'role', 'qualite'] },
      { key: 'entreprise', label: 'Entreprise', syn: ['entreprise', 'societe', 'raison sociale', 'client', 'compte', 'organisation', 'employeur'] },
      { key: 'site', label: 'Site', syn: ['site', 'etablissement', 'usine', 'agence'] },
      { key: 'tel', label: 'Téléphone', syn: ['tel', 'telephone', 'fixe', 'telephone fixe', 'ligne directe'] },
      { key: 'mobile', label: 'Portable', syn: ['portable', 'mobile', 'gsm', 'tel portable', 'telephone portable', 'port'] },
      { key: 'email', label: 'E-mail', syn: ['email', 'mail', 'courriel', 'e mail', 'adresse mail'] },
      { key: 'notes', label: 'Notes', syn: ['notes', 'commentaire', 'remarques'] },
    ],
    cle: v => normTxt(v.email) || `${normTxt(v.prenom)}|${normTxt(v.nom)}|${normTxt(v.entreprise)}`,
    trouver: (v, ctx) => {
      const em = normTxt(v.email);
      if (em) { const c = Store.all('contacts').find(x => normTxt(x.email) === em); if (c) return c; }
      return Store.all('contacts').find(x => normTxt(x.nom) === normTxt(v.nom) && normTxt(x.prenom) === normTxt(v.prenom)
        && (!v.entreprise || normTxt(clientName(x.entrepriseId)) === normTxt(v.entreprise)));
    },
    appliquer(rec, v, ctx) {
      ['prenom', 'nom', 'fonction', 'tel', 'mobile', 'email', 'notes'].forEach(k => { if (v[k] !== '') rec[k] = String(v[k]); });
      if (v.civilite !== '') rec.civilite = /^(mme|madame|mlle|f)/i.test(String(v.civilite).trim()) ? 'Madame' : /^(m|monsieur|mr|h)/i.test(String(v.civilite).trim()) ? 'Monsieur' : '';
      if (v.entreprise) rec.entrepriseId = entrepriseParNom(v.entreprise, ctx, 'Client');
      if (v.site && rec.entrepriseId) {
        const ent = Store.get('entreprises', rec.entrepriseId) || {};
        const s = (ent.adresses || []).find(x => normTxt(x.libelle) === normTxt(v.site) || normTxt(x.ville) === normTxt(v.site));
        if (s) rec.siteId = s.id;
      }
      return rec;
    },
    ligne: c => [c.id, c.civilite || '', c.prenom, c.nom, c.fonction, c.entrepriseId ? clientName(c.entrepriseId) : '', siteLabel(siteOf(c.entrepriseId, c.siteId)), c.tel, c.mobile, c.email, c.notes],
    largeurs: [12, 10, 14, 18, 24, 30, 30, 15, 15, 30, 30],
  },
};
// Feuille « Sites » du fichier des entreprises : plusieurs adresses par entreprise
const SITES_FIELDS = [
  { key: 'entId', label: 'ID entreprise', syn: ['id entreprise'] },
  { key: 'entreprise', label: 'Entreprise', syn: ['entreprise', 'raison sociale', 'societe'] },
  { key: 'id', label: 'ID site', syn: ['id site'] },
  { key: 'libelle', label: 'Nom du site', syn: ['site', 'nom du site', 'libelle', 'etablissement'] },
  { key: 'adresse', label: 'Adresse', syn: ['adresse', 'rue'] },
  { key: 'cp', label: 'Code postal', syn: ['cp', 'code postal'] },
  { key: 'ville', label: 'Ville', syn: ['ville', 'commune'] },
  { key: 'facturation', label: 'Facturation', syn: ['facturation', 'adresse de facturation'] },
  { key: 'acces', label: "Consignes d'accès", syn: ['consignes', 'acces', 'consignes d acces'] },
];

/* ---------- Export ---------- */
function exporterExcel(type) {
  const conf = ECHANGES[type];
  const H = v => ({ v, s: 'head' });
  const list = Store.all(conf.col).slice().sort((a, b) => String(a.nom || a.ref || a.libelle || '').localeCompare(String(b.nom || b.ref || b.libelle || '')));
  const sheets = [{ name: conf.feuille, cols: conf.largeurs, freeze: 1, rows: [conf.fields.map(f => H(f.label)), ...list.map(conf.ligne)] }];
  if (type === 'entreprises') {
    const rows = [SITES_FIELDS.map(f => H(f.label))];
    list.forEach(e => (e.adresses || []).forEach(s => rows.push([e.id, e.nom, s.id, s.libelle, s.adresse, s.cp, s.ville, s.facturation ? 'Oui' : 'Non', s.acces])));
    sheets.push({ name: 'Sites', cols: [12, 30, 12, 30, 30, 10, 18, 11, 36], freeze: 1, rows });
  }
  download(`${conf.fichier}-${isoDate(new Date())}.xlsx`, XLSX.build(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------- Import ---------- */
function detecterEntete(rows, fields) {
  let best = { row: 0, score: -1, map: {} };
  rows.slice(0, 15).forEach((r, i) => {
    const map = mapperColonnes(r, fields);
    const score = Object.keys(map).length;
    if (score > best.score) best = { row: i, score, map };
  });
  return best;
}
function mapperColonnes(header, fields) {
  const map = {}, pris = new Set();
  const cols = header.map(h => normTxt(h));
  const tryMatch = test => fields.forEach(f => {
    if (map[f.key] !== undefined || f.export) return;
    const i = cols.findIndex((c, k) => c && !pris.has(k) && test(c, f));
    if (i >= 0) { map[f.key] = i; pris.add(i); }
  });
  tryMatch((c, f) => c === normTxt(f.label));
  tryMatch((c, f) => f.syn.includes(c));
  tryMatch((c, f) => f.syn.some(s => s.length > 3 && (c.startsWith(s + ' ') || c.endsWith(' ' + s))));
  return map;
}

function importerExcel(type) {
  const conf = ECHANGES[type];
  const etat = { sheets: null, feuille: 0, entete: 0, map: {}, nom: '' };
  const champs = conf.fields.filter(f => !f.export);

  const ecranFichier = () => {
    const box = Modal.open(`<h2 style="margin-top:0">Importer des ${esc(conf.titre)}</h2>
      <p>Fichier Excel (.xlsx) ou CSV. La première ligne utile doit contenir les titres des colonnes ; elles sont reconnues automatiquement et vous pourrez les corriger.</p>
      <p class="muted small">Pour modifier vos données en masse : exportez-les, modifiez le fichier dans Excel puis réimportez-le. La colonne « ID » permet de mettre à jour les bonnes fiches.</p>
      <label class="photo-drop" for="imp-file"><span class="photo-icon" aria-hidden="true">📄</span><span>Choisir un fichier Excel ou CSV</span><input id="imp-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden></label>
      <div class="modal-actions"><button class="secondary" id="imp-close">Annuler</button></div>`);
    box.querySelector('#imp-close').onclick = Modal.close;
    box.querySelector('#imp-file').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        etat.sheets = /\.csv$/i.test(file.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
        etat.nom = file.name;
        etat.feuille = Math.max(0, etat.sheets.findIndex(s => normTxt(s.name) !== 'sites' && s.rows.length > 1));
        choisirFeuille();
        ecranColonnes();
      } catch (err) { notify('Lecture impossible : ' + err.message); }
    };
  };

  const choisirFeuille = () => {
    const d = detecterEntete(etat.sheets[etat.feuille].rows, champs);
    etat.entete = d.row; etat.map = d.map;
  };
  const lignesDonnees = () => etat.sheets[etat.feuille].rows.slice(etat.entete + 1)
    .filter(r => Object.values(etat.map).some(i => cellTxt(r[i]) !== ''));
  const valeurs = r => {
    const v = {};
    champs.forEach(f => { const i = etat.map[f.key]; const raw = i === undefined ? '' : r[i]; v[f.key] = f.num ? parseNombre(raw) : cellTxt(raw); });
    return v;
  };

  const ecranColonnes = () => {
    const sh = etat.sheets[etat.feuille], header = sh.rows[etat.entete] || [];
    const data = lignesDonnees();
    const ex = data[0] || [];
    const colOpts = sel => '<option value="">— ignorer —</option>' + header.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(cellTxt(h) || `Colonne ${i + 1}`)}</option>`).join('');
    const manquants = champs.filter(f => f.required && etat.map[f.key] === undefined);
    const box = Modal.open(`<h2 style="margin-top:0">Importer des ${esc(conf.titre)}</h2>
      <p class="muted">${esc(etat.nom)} · <strong>${data.length} ligne(s)</strong> détectée(s)</p>
      ${etat.sheets.length > 1 ? `<div class="field"><label for="imp-sheet">Feuille</label><select id="imp-sheet">${etat.sheets.map((s, i) => `<option value="${i}" ${i === etat.feuille ? 'selected' : ''}>${esc(s.name)} (${s.rows.length} lignes)</option>`).join('')}</select></div>` : ''}
      <div class="table-wrap" style="margin-top:10px"><table><tr><th>Information</th><th>Colonne du fichier</th><th>Exemple (1re ligne)</th></tr>
        ${champs.map(f => `<tr><td>${esc(f.label)}${f.required ? ' <span class="neg">*</span>' : ''}</td><td><select data-map="${f.key}" aria-label="Colonne pour ${esc(f.label)}">${colOpts(etat.map[f.key])}</select></td>
          <td class="muted small">${etat.map[f.key] !== undefined ? esc(cellTxt(ex[etat.map[f.key]])) : ''}</td></tr>`).join('')}
      </table></div>
      <div class="grid2" style="margin-top:12px">
        <div class="field"><label for="imp-mode">Fiches déjà présentes</label><select id="imp-mode"><option value="maj">Mettre à jour et ajouter les nouvelles</option><option value="ajout">Ajouter uniquement les nouvelles</option></select></div>
        ${type === 'articles' ? '<div class="field"><label for="imp-coef">Coefficient si le prix de vente est vide</label><input id="imp-coef" type="number" step="0.01" value="1.3"></div>' : ''}
        ${type === 'entreprises' ? `<div class="field"><label for="imp-cat">Catégorie si non précisée</label><select id="imp-cat">${optionsStr(CATEGORIES, 'Client')}</select></div>` : ''}
        ${type === 'articles' || type === 'contacts' ? `<label class="check"><input type="checkbox" id="imp-creer" checked> Créer les ${type === 'articles' ? 'fournisseurs' : 'entreprises'} inconnu(e)s</label>` : ''}
      </div>
      ${type === 'entreprises' && etat.sheets.some(s => normTxt(s.name) === 'sites') ? '<p class="note">La feuille « Sites » sera aussi importée (adresses multiples).</p>' : ''}
      ${manquants.length ? `<p class="neg">Colonne obligatoire non trouvée : ${manquants.map(f => esc(f.label)).join(', ')}.</p>` : ''}
      <div class="modal-actions"><button class="secondary" id="imp-back">Autre fichier</button><button id="imp-go" ${manquants.length || !data.length ? 'disabled' : ''}>Importer ${data.length} ligne(s)</button></div>`, true);
    const sel = box.querySelector('#imp-sheet');
    if (sel) sel.onchange = () => { etat.feuille = +sel.value; choisirFeuille(); ecranColonnes(); };
    box.querySelectorAll('[data-map]').forEach(s => s.onchange = () => {
      if (s.value === '') delete etat.map[s.dataset.map]; else etat.map[s.dataset.map] = +s.value;
      ecranColonnes();
    });
    box.querySelector('#imp-back').onclick = ecranFichier;
    box.querySelector('#imp-go').onclick = () => lancer({
      mode: box.querySelector('#imp-mode').value,
      coef: box.querySelector('#imp-coef') ? num(box.querySelector('#imp-coef').value) : 0,
      categorie: box.querySelector('#imp-cat') ? box.querySelector('#imp-cat').value : 'Client',
      creerEntreprises: box.querySelector('#imp-creer') ? box.querySelector('#imp-creer').checked : false,
    });
  };

  const lancer = async opts => {
    const ctx = { ...opts, nouvelles: [] };
    const res = { crees: 0, maj: 0, ignores: [] };
    const sortie = new Map(), cles = new Map();
    lignesDonnees().forEach((r, k) => {
      const v = valeurs(r);
      const ligne = etat.entete + k + 2;
      if (champs.some(f => f.required && v[f.key] === '')) { res.ignores.push(`ligne ${ligne} : ${champs.filter(f => f.required && v[f.key] === '').map(f => f.label).join(', ')} manquant`); return; }
      const parId = v.id && (sortie.get(v.id) || Store.get(conf.col, v.id));
      const cle = conf.cle(v), dejaVu = cle && cles.get(cle);
      const existant = parId || (dejaVu && sortie.get(dejaVu)) || conf.trouver(v, ctx);
      if (existant && opts.mode === 'ajout') { res.ignores.push(`ligne ${ligne} : déjà présente`); return; }
      const base = existant ? JSON.parse(JSON.stringify(sortie.get(existant.id) || existant)) : { id: uid() };
      Object.keys(base).filter(x => x.startsWith('_')).forEach(x => delete base[x]);
      const rec = conf.appliquer(base, v, ctx);
      if (!existant) res.crees++; else if (!sortie.has(existant.id)) res.maj++;
      sortie.set(rec.id, rec);
      if (cle) cles.set(cle, rec.id);
    });
    // Feuille « Sites » des entreprises
    let nbSites = 0;
    const feuilleSites = type === 'entreprises' && etat.sheets.find(s => normTxt(s.name) === 'sites');
    if (feuilleSites) {
      const d = detecterEntete(feuilleSites.rows, SITES_FIELDS);
      feuilleSites.rows.slice(d.row + 1).forEach(r => {
        const g = k => d.map[k] === undefined ? '' : cellTxt(r[d.map[k]]);
        if (!g('libelle') && !g('adresse')) return;
        const ent = (g('entId') && (sortie.get(g('entId')) || Store.get('entreprises', g('entId'))))
          || [...sortie.values()].find(e => normTxt(e.nom) === normTxt(g('entreprise'))) || Store.all('entreprises').find(e => normTxt(e.nom) === normTxt(g('entreprise')));
        if (!ent) return;
        const rec = sortie.get(ent.id) || (() => { const c = JSON.parse(JSON.stringify(ent)); Object.keys(c).filter(x => x.startsWith('_')).forEach(x => delete c[x]); return c; })();
        rec.adresses = rec.adresses || [];
        let site = (g('id') && rec.adresses.find(s => s.id === g('id'))) || rec.adresses.find(s => normTxt(s.libelle) === normTxt(g('libelle')));
        if (!site) { site = { id: uid() }; rec.adresses.push(site); }
        ['libelle', 'adresse', 'cp', 'ville', 'acces'].forEach(k => { if (g(k) !== '') site[k] = g(k); });
        if (d.map.facturation !== undefined) site.facturation = ouiNon(r[d.map.facturation]);
        sortie.set(rec.id, rec); nbSites++;
      });
    }
    if (!sortie.size) { notify('Aucune ligne à importer.'); return; }
    const btn = document.querySelector('#imp-go');
    if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }
    try {
      if (ctx.nouvelles.length) await Store.bulk('entreprises', ctx.nouvelles);
      await Store.bulk(conf.col, [...sortie.values()]);
    } catch (err) { notify('Import impossible : ' + err.message); if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; } return; }
    const box = Modal.open(`<h2 style="margin-top:0">Import terminé</h2>
      <ul class="import-sum"><li><strong>${res.crees}</strong> ${esc(conf.titre)} ajouté(e)s</li><li><strong>${res.maj}</strong> mis(es) à jour</li>
        ${nbSites ? `<li><strong>${nbSites}</strong> site(s) importé(s)</li>` : ''}
        ${ctx.nouvelles.length ? `<li><strong>${ctx.nouvelles.length}</strong> entreprise(s) créée(s) : ${ctx.nouvelles.slice(0, 5).map(e => esc(e.nom)).join(', ')}${ctx.nouvelles.length > 5 ? '…' : ''}</li>` : ''}
        ${res.ignores.length ? `<li><strong>${res.ignores.length}</strong> ligne(s) ignorée(s)<br><span class="muted small">${res.ignores.slice(0, 6).map(esc).join('<br>')}${res.ignores.length > 6 ? '<br>…' : ''}</span></li>` : ''}</ul>
      <div class="modal-actions"><button id="imp-ok">Fermer</button></div>`);
    box.querySelector('#imp-ok').onclick = () => { Modal.close(); App.render(); };
  };

  ecranFichier();
}

// Boutons à placer dans la barre d'outils d'une liste
const boutonsEchange = type => Store.can('write', ECHANGES[type].col)
  ? `<button class="secondary" data-import="${type}">Importer Excel</button><button class="secondary dl-btn" data-export="${type}">Exporter Excel</button>`
  : `<button class="secondary dl-btn" data-export="${type}">Exporter Excel</button>`;
function bindEchange(root) {
  root.querySelectorAll('[data-import]').forEach(b => { b.onclick = () => importerExcel(b.dataset.import); });
  root.querySelectorAll('[data-export]').forEach(b => { b.onclick = () => exporterExcel(b.dataset.export); });
}
