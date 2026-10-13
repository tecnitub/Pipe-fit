// DPGF (décomposition du prix global et forfaitaire) des marchés publics :
// import du cadre du maître d'ouvrage dans un devis (chapitres + ouvrages avec quantités, à chiffrer),
// puis export du DPGF chiffré au même format pour la remise de l'offre.
const DPGF_FIELDS = [
  { key: 'num', label: 'N° de prix', syn: ['n', 'no', 'num', 'numero', 'n prix', 'prix n', 'article', 'art', 'repere', 'rep', 'poste', 'code', 'n article', 'ref', 'item', 'index'] },
  { key: 'designation', label: 'Désignation', required: true, syn: ['designation', 'libelle', 'description', 'designation des ouvrages', 'nature des ouvrages', 'ouvrages', 'designation des prestations', 'prestations', 'intitule'] },
  { key: 'unite', label: 'Unité', syn: ['u', 'unite', 'un', 'unit', 'u m'] },
  { key: 'qte', label: 'Quantité', num: true, syn: ['quantite', 'qte', 'qt', 'q', 'quantites', 'qte dpgf', 'quantite estimee', 'quant'] },
  { key: 'pu', label: 'Prix unitaire HT', num: true, syn: ['pu', 'p u', 'p u ht', 'prix unitaire', 'pu ht', 'prix unitaire ht', 'prix unit'] },
  { key: 'montant', label: 'Montant HT', num: true, syn: ['montant', 'total', 'montant ht', 'prix total', 'total ht', 'montant total'] },
];
const DPGF_TOTAL = /^(sous[\s-]*total|total|montant|t\s*\.?\s*v\s*\.?\s*a|net a payer|report|a reporter|recapitulatif)/;

// Classement automatique des lignes du fichier
function classerDPGF(rows, map) {
  const g = (r, k) => map[k] === undefined ? '' : r[map[k]];
  const items = [];
  rows.forEach((r, i) => {
    const designation = cellTxt(g(r, 'designation')), numero = cellTxt(g(r, 'num'));
    if (!designation && !numero) return;
    const rawQte = g(r, 'qte'), qte = parseNombre(rawQte), unite = cellTxt(g(r, 'unite'));
    const it = { ligne: i, num: numero, designation: designation || numero, unite, qte, pu: parseNombre(g(r, 'pu')) };
    const prev = items[items.length - 1];
    if (DPGF_TOTAL.test(normTxt(designation))) it.type = 'ignorer';
    else if (qte !== '' || unite) it.type = 'ouvrage';
    else if (cellTxt(rawQte)) { it.type = 'ouvrage'; it.unite = unite || cellTxt(rawQte); it.qte = 1; } // « ENS », « Ft »…
    else if (!numero && prev && (prev.type === 'ouvrage' || prev.type === 'texte')) it.type = 'texte';
    else it.type = 'chapitre';
    if (it.type === 'ouvrage' && /^p\.?\s*m\.?$/i.test(it.unite)) it.qte = 0; // « pour mémoire »
    items.push(it);
  });
  return items;
}

function importerDPGF(d) {
  const etat = { sheets: null, feuille: 0, entete: 0, map: {}, nom: '', types: {} };
  const ecranFichier = () => {
    const box = Modal.open(`<h2 style="margin-top:0">Importer un DPGF</h2>
      <p>Fichier Excel (.xlsx) ou CSV du dossier de consultation. Les chapitres, les ouvrages et leurs quantités sont repris dans le devis ; il ne reste qu'à chiffrer chaque ouvrage (fournitures + main-d'œuvre).</p>
      <label class="photo-drop" for="dp-file"><span class="photo-icon" aria-hidden="true">📄</span><span>Choisir le DPGF</span><input id="dp-file" type="file" accept=".xlsx,.csv" hidden></label>
      <div class="modal-actions"><button class="secondary" id="dp-close">Annuler</button></div>`);
    box.querySelector('#dp-close').onclick = Modal.close;
    box.querySelector('#dp-file').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        etat.sheets = /\.csv$/i.test(file.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
        etat.nom = file.name;
        // Feuille la plus probable : celle dont l'en-tête reconnaît le plus de colonnes
        let best = -1;
        etat.sheets.forEach((s, i) => { const sc = detecterEntete(s.rows, DPGF_FIELDS).score; if (sc > best) { best = sc; etat.feuille = i; } });
        choisirFeuille(); ecranApercu();
      } catch (err) { notify('Lecture impossible : ' + err.message); }
    };
  };
  const choisirFeuille = () => { const r = detecterEntete(etat.sheets[etat.feuille].rows, DPGF_FIELDS); etat.entete = r.row; etat.map = r.map; etat.types = {}; };
  const items = () => classerDPGF(etat.sheets[etat.feuille].rows.slice(etat.entete + 1), etat.map)
    .map(it => ({ ...it, type: etat.types[it.ligne] || it.type }));

  const ecranApercu = () => {
    const sh = etat.sheets[etat.feuille], header = sh.rows[etat.entete] || [];
    const list = items();
    const nb = t => list.filter(x => x.type === t).length;
    const colOpts = sel => '<option value="">— aucune —</option>' + header.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(cellTxt(h) || `Colonne ${i + 1}`)}</option>`).join('');
    const typeSel = it => `<select data-type="${it.ligne}" aria-label="Type de ligne">${[['chapitre', 'Chapitre'], ['ouvrage', 'Ouvrage'], ['texte', 'Description'], ['ignorer', 'Ignorer']].map(([k, l]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const box = Modal.open(`<h2 style="margin-top:0">Importer un DPGF</h2>
      <p class="muted">${esc(etat.nom)} · <strong>${nb('chapitre')}</strong> chapitre(s), <strong>${nb('ouvrage')}</strong> ouvrage(s), ${nb('texte')} ligne(s) de description, ${nb('ignorer')} ignorée(s) (totaux)</p>
      ${etat.sheets.length > 1 ? `<div class="field"><label for="dp-sheet">Feuille</label><select id="dp-sheet">${etat.sheets.map((s, i) => `<option value="${i}" ${i === etat.feuille ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
      <div class="dp-map">${DPGF_FIELDS.map(f => `<div class="field"><label>${esc(f.label)}${f.required ? ' *' : ''}</label><select data-map="${f.key}">${colOpts(etat.map[f.key])}</select></div>`).join('')}</div>
      <div class="table-wrap dp-preview"><table><tr><th>Type</th><th>N°</th><th>Désignation</th><th>Unité</th><th class="num">Quantité</th>${etat.map.pu !== undefined ? '<th class="num">PU</th>' : ''}</tr>
        ${list.slice(0, 400).map(it => `<tr class="dp-${it.type}"><td>${typeSel(it)}</td><td>${esc(it.num)}</td><td>${esc(it.designation)}</td><td>${it.type === 'ouvrage' ? esc(it.unite) : ''}</td><td class="num">${it.type === 'ouvrage' ? fmt(it.qte || 0, 2) : ''}</td>${etat.map.pu !== undefined ? `<td class="num">${it.pu !== '' ? eur(it.pu) : ''}</td>` : ''}</tr>`).join('')}
      </table></div>
      ${list.length > 400 ? `<p class="muted small">Aperçu limité aux 400 premières lignes ; les ${list.length} lignes seront importées.</p>` : ''}
      <div class="grid2" style="margin-top:12px">
        <div class="field"><label for="dp-mode">Lignes actuelles du devis</label><select id="dp-mode"><option value="remplacer">Remplacer par le DPGF</option><option value="ajouter">Conserver et ajouter le DPGF à la suite</option></select></div>
        ${etat.map.pu !== undefined ? '<label class="check"><input type="checkbox" id="dp-pu"> Reprendre les prix unitaires du fichier (prix forfaitaires)</label>' : ''}
      </div>
      ${etat.map.designation === undefined ? '<p class="neg">Colonne « Désignation » non trouvée : choisissez-la ci-dessus.</p>' : ''}
      <div class="modal-actions"><button class="secondary" id="dp-back">Autre fichier</button><button id="dp-go" ${etat.map.designation === undefined || !nb('ouvrage') ? 'disabled' : ''}>Créer ${nb('ouvrage')} ouvrage(s) dans le devis</button></div>`, true);
    const sel = box.querySelector('#dp-sheet');
    if (sel) sel.onchange = () => { etat.feuille = +sel.value; choisirFeuille(); ecranApercu(); };
    box.querySelectorAll('[data-map]').forEach(s => s.onchange = () => { if (s.value === '') delete etat.map[s.dataset.map]; else etat.map[s.dataset.map] = +s.value; etat.types = {}; ecranApercu(); });
    box.querySelectorAll('[data-type]').forEach(s => s.onchange = () => { etat.types[s.dataset.type] = s.value; ecranApercu(); });
    box.querySelector('#dp-back').onclick = ecranFichier;
    box.querySelector('#dp-go').onclick = () => {
      const avecPU = !!(box.querySelector('#dp-pu') || {}).checked;
      const lignes = [];
      items().forEach(it => {
        if (it.type === 'chapitre') lignes.push({ type: 'chapitre', num: it.num, titre: it.num && !it.designation.startsWith(it.num) ? `${it.num} – ${it.designation}` : it.designation });
        else if (it.type === 'ouvrage') lignes.push({ type: 'ouvrage', num: it.num, designation: it.designation, unite: it.unite || 'u', qte: it.qte === '' ? 0 : it.qte, dpgf: true,
          composants: avecPU && it.pu !== '' ? [{ type: 'f', designation: 'Prix forfaitaire (DPGF)', qte: 1, pu: it.pu, cout: 0, poids: 0 }] : [] });
        else if (it.type === 'texte') {
          const last = lignes[lignes.length - 1];
          if (last && last.type === 'ouvrage') last.detail = (last.detail ? last.detail + '\n' : '') + it.designation;
        }
      });
      d.lignes = box.querySelector('#dp-mode').value === 'remplacer' ? lignes : [...(d.lignes || []), ...lignes];
      if (!d.objet) d.objet = etat.nom.replace(/\.(xlsx|csv)$/i, '');
      Store.upsert('devis', d);
      Modal.close(); App.render();
      App.toast(`${lignes.filter(l => l.type === 'ouvrage').length} ouvrages importés : chiffrez-les un par un (fournitures + main-d'œuvre).`, 5000);
    };
  };
  ecranFichier();
}

// DPGF chiffré : même structure que le cadre (N°, désignation, unité, quantité), PU et montants remplis
function exporterDPGF(d) {
  const t = Calc.doc(d), lignes = d.lignes || [];
  // Sous-totaux hiérarchiques d'après les N° de prix (2 = 2.1 + 2.2…) ; sans numéros, un sous-total par chapitre
  const sousTotaux = {};
  const chapsNum = lignes.map((l, i) => ({ l, i })).filter(x => x.l.type === 'chapitre');
  chapsNum.forEach(({ l, i }) => {
    let last = i, total = 0, n = 0;
    for (let k = i + 1; k < lignes.length; k++) {
      const x = lignes[k];
      const dedans = l.num ? (x.num ? String(x.num).startsWith(l.num + '.') : x.type !== 'chapitre' || false) : x.type !== 'chapitre';
      if (!dedans) {
        if (l.num && !x.num && x.type !== 'chapitre') { last = k; total += Calc.ligneHT(x); n++; continue; } // ligne sans numéro sous le chapitre
        break;
      }
      last = k;
      if (x.type !== 'chapitre') { total += Calc.ligneHT(x); n++; }
    }
    if (n) (sousTotaux[last] = sousTotaux[last] || []).push({ titre: l.titre, total, profondeur: String(l.num || '').split('.').length });
  });
  Object.values(sousTotaux).forEach(list => list.sort((a, b) => b.profondeur - a.profondeur));
  const H = v => ({ v, s: 'head' });
  const rows = [
    [{ v: `${Store.data.settings.societe} – DPGF chiffré`, s: 'title' }],
    [{ v: `${d.objet || ''} · devis ${d.numero || ''} du ${dateFr(d.date)} · client ${clientName(docClientId(d))}`, s: 'muted' }],
    [],
    ['N°', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire HT', 'Montant HT'].map(H),
  ];
  lignes.forEach((l, i) => {
    if (l.type === 'chapitre') rows.push([{ v: l.num || '', s: 'bold' }, { v: l.num && l.titre.startsWith(l.num) ? l.titre.slice(l.num.length).replace(/^\s*[–-]\s*/, '') : l.titre, s: 'bold' }]);
    else rows.push([l.num || '', l.designation + (l.detail ? '\n' + l.detail : ''), l.unite, num(l.qte), { v: Calc.pu(l), s: 'eur' }, { v: Calc.ligneHT(l), s: 'eur' }]);
    (sousTotaux[i] || []).forEach(st => rows.push([{ v: '', s: 'total' }, { v: `Sous-total ${st.titre}`, s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: st.total, s: 'boldeur' }]));
  });
  rows.push([]);
  rows.push(['', { v: 'Total HT', s: 'bold' }, '', '', '', { v: t.brut, s: 'boldeur' }]);
  t.ajust.forEach(a => rows.push(['', `${a.libelle || (a.pct < 0 ? 'Remise' : 'Majoration')} ${a.pct > 0 ? '+' : ''}${fmt(a.pct, 1)} %`, '', '', '', { v: a.montant, s: 'eur' }]));
  if (t.livraison) rows.push(['', 'Transport / livraison', '', '', '', { v: t.livraison, s: 'eur' }]);
  if (t.ajust.length || t.livraison) rows.push(['', { v: t.ajust.length ? 'Total HT après remises / majorations' : 'Total HT y compris transport', s: 'bold' }, '', '', '', { v: t.totalHT, s: 'boldeur' }]);
  rows.push(['', `TVA ${fmt(Store.data.settings.tva, 1)} %`, '', '', '', { v: t.tva, s: 'eur' }]);
  rows.push(['', { v: 'Total TTC', s: 'bold' }, '', '', '', { v: t.totalTTC, s: 'boldeur' }]);
  const nom = `DPGF-chiffre-${(d.numero || 'devis')}.xlsx`;
  download(nom, XLSX.build([{ name: 'DPGF', cols: [10, 70, 9, 11, 16, 16], freeze: 4, rows }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// Ouvrages restant à chiffrer (aucun composant ou prix nul)
const aChiffrer = l => l.type !== 'chapitre' && Calc.pu(l) === 0 && num(l.qte) !== 0;
