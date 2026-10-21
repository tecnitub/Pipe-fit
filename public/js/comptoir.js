// Achats au comptoir sans commande : le compagnon déclare son enlèvement (fournisseur, chantier, n° de BL, photo), le mois
// suivant le relevé du fournisseur (PDF ou Excel) est lu : chaque BL est rattaché à son chantier (référence donnée au
// comptoir), rapproché de l'enlèvement déclaré, et la facture est ventilée automatiquement par chantier.

const STATUTS_ENLEVEMENT = { 'Déclaré': ['b-warn', 'en attente du relevé'], 'Facturé': ['b-ok', 'facturé'] };
const badgeEnlevement = e => { const s = STATUTS_ENLEVEMENT[e.statut] || ['', e.statut]; return `<span class="badge ${s[0]}">${esc(s[1])}</span>`; };
// Fournisseurs les plus utilisés au comptoir d'abord
function fournisseursComptoir() {
  const n = new Map(); Store.all('enlevements').forEach(e => n.set(e.fournisseurId, (n.get(e.fournisseurId) || 0) + 1));
  return fournisseursList().slice().sort((a, b) => (n.get(b.id) || 0) - (n.get(a.id) || 0) || a.nom.localeCompare(b.nom));
}

/* ---------- Téléphone du compagnon ---------- */
const comptoirBrouillon = { uid: null, photo: null };
function comptoirCompagnon(u) {
  const auj = isoDate(new Date()), prevu = planJour(u.id, auj)[0];
  const miens = Store.all('enlevements').filter(e => e.userId === u.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 30);
  if (comptoirBrouillon.uid !== u.id) Object.assign(comptoirBrouillon, { uid: u.id, photo: null });
  return `<div class="pointage"><h1>Achat au comptoir</h1>${pointageTabs('comptoir', u.id)}
    <p class="muted small">Matériel pris au magasin d'un fournisseur sans commande : donnez le n° de chantier au comptoir, puis déclarez-le ici avec la photo du bon. Le bureau le retrouve sur le relevé du fournisseur.</p>
    <div class="card">
      <div class="field"><label for="ct-f">Fournisseur</label><select id="ct-f" class="big-select">${options(fournisseursComptoir(), '')}</select></div>
      <div class="field"><label for="ct-a">Chantier</label><select id="ct-a" class="big-select">${options(chantiersActifs(), prevu ? prevu.affaireId : '', affaireLabel)}</select>
        <span class="small muted" id="ct-code"></span></div>
      <div class="grid2"><div class="field"><label for="ct-bl">N° du bon / ticket</label><input id="ct-bl" inputmode="numeric" placeholder="Ex. 4512"></div>
        <div class="field"><label for="ct-m">Montant HT (si indiqué)</label><input id="ct-m" type="number" inputmode="decimal" step="0.01" min="0"></div></div>
      <div class="field"><label for="ct-n">Ce qui a été pris</label><input id="ct-n" data-dictee placeholder="Raccords inox DN50, joints, colliers…"></div>
      <label class="btn secondary big" style="display:block;text-align:center">📷 Photo du bon<input type="file" id="ct-ph" accept="image/*" capture="environment" hidden></label>
      <div id="ct-apercu">${comptoirBrouillon.photo ? `<img class="thumb" src="${comptoirBrouillon.photo}" alt="Bon">` : ''}</div>
      <button class="big" id="ct-ok" style="width:100%;margin-top:10px">Déclarer l'enlèvement</button>
    </div>
    <h2>Mes enlèvements</h2>
    ${miens.length ? `<ul class="mat-liste">${miens.map(e => `<li><span><strong>${esc(clientName(e.fournisseurId))}</strong> · ${dateFr(e.date)}${e.bl ? ` · BL ${esc(e.bl)}` : ''}<br><span class="small">${esc(affaireOf(e.affaireId).code || '')} ${esc(e.note || '')}</span></span>
      <span class="num">${e.montant ? eur(e.montant) : ''}<br>${badgeEnlevement(e)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun enlèvement déclaré.</p>'}
  </div>`;
}
function bindComptoirCompagnon(root, u) {
  const $ = s => root.querySelector(s);
  const code = () => { const a = Store.get('affaires', $('#ct-a').value); $('#ct-code').textContent = a ? `N° à donner au comptoir : ${a.code}` : ''; };
  $('#ct-a').onchange = code; code();
  $('#ct-ph').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    comptoirBrouillon.photo = await compressImage(f, 1600, 0.75);
    $('#ct-apercu').innerHTML = `<img class="thumb" src="${comptoirBrouillon.photo}" alt="Bon">`;
  };
  $('#ct-ok').onclick = async () => {
    if (!$('#ct-f').value) return notify('Choisissez le fournisseur.');
    if (!$('#ct-a').value) return notify('Choisissez le chantier.');
    if (!$('#ct-bl').value.trim() && !comptoirBrouillon.photo) return notify('Indiquez le n° du bon ou prenez-le en photo.');
    $('#ct-ok').disabled = true;
    try {
      const photoId = comptoirBrouillon.photo ? await envoyerImage(comptoirBrouillon.photo) : '';
      Store.upsert('enlevements', { userId: u.id, date: isoDate(new Date()), fournisseurId: $('#ct-f').value, affaireId: $('#ct-a').value, bl: $('#ct-bl').value.trim(),
        montant: $('#ct-m').value === '' ? '' : num($('#ct-m').value), note: $('#ct-n').value.trim(), photoId, statut: 'Déclaré' });
      comptoirBrouillon.photo = null;
      App.toast('Enlèvement déclaré'); App.render();
    } catch (err) { $('#ct-ok').disabled = false; notify(err.message); }
  };
}

/* ---------- Bureau : Achats → Comptoir ---------- */
const comptoirFiltre = { fournisseur: '', statut: 'Déclaré', mois: '' };
Views.comptoir = () => {
  const f = comptoirFiltre;
  const l = Store.all('enlevements').filter(e => (!f.fournisseur || e.fournisseurId === f.fournisseur) && (!f.statut || e.statut === f.statut) && (!f.mois || String(e.date).startsWith(f.mois)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const mois = [...new Set(Store.all('enlevements').map(e => String(e.date).slice(0, 7)))].sort().reverse();
  const attente = Store.all('enlevements').filter(e => e.statut === 'Déclaré');
  return `<h1>Achats</h1>${achatsTabs('comptoir')}
  <p class="muted">Enlèvements au comptoir déclarés par les compagnons (sans commande). À réception du relevé mensuel du fournisseur, ouvrez sa facture et utilisez « Importer le relevé » : les BL sont rattachés aux chantiers et à ces déclarations.</p>
  <div class="cards"><div class="card"><div class="label">En attente du relevé</div><div class="value">${attente.length}</div><div class="sub">${eur(sumBy(attente, e => num(e.montant)))} HT déclarés</div></div></div>
  <div class="toolbar"><button id="ct-add">+ Enlèvement</button>
    <select id="ct-ff" style="width:auto" aria-label="Fournisseur"><option value="">Tous les fournisseurs</option>${fournisseursComptoir().map(e => `<option value="${esc(e.id)}" ${e.id === f.fournisseur ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select>
    <select id="ct-fs" style="width:auto" aria-label="Statut"><option value="">Tous</option>${Object.keys(STATUTS_ENLEVEMENT).map(s => `<option ${s === f.statut ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select id="ct-fm" style="width:auto" aria-label="Mois"><option value="">Tous les mois</option>${mois.map(m => `<option value="${m}" ${m === f.mois ? 'selected' : ''}>${m.split('-').reverse().join('/')}</option>`).join('')}</select></div>
  ${l.length ? `<div class="table-wrap"><table><tr><th>Date</th><th>Compagnon</th><th>Fournisseur</th><th>Chantier</th><th>N° BL</th><th>Matériel</th><th class="num">Montant HT</th><th>Bon</th><th>Statut</th></tr>
    ${l.map(e => { const ac = e.achatId && Store.get('achats', e.achatId); return `<tr class="clickable" data-en="${esc(e.id)}"><td>${dateFr(e.date)}</td><td>${esc(userName(e.userId))}</td><td>${esc(clientName(e.fournisseurId))}</td>
      <td>${esc(affaireOf(e.affaireId).code || '')}</td><td>${esc(e.bl || '')}</td><td class="small">${esc(e.note || '')}</td><td class="num">${e.montantFacture ? eur(e.montantFacture) : e.montant ? eur(e.montant) : ''}</td>
      <td data-nocl>${e.photoId ? `<a href="${fileUrl(e.photoId)}" target="_blank" rel="noopener">📷</a>` : ''}</td><td>${badgeEnlevement(e)}${ac ? `<br><a class="small" href="#/achats/${esc(ac.id)}" data-nocl>${esc(ac.numeroFournisseur || ac.ref || '')}</a>` : ''}</td></tr>`; }).join('')}</table></div>`
    : '<p class="muted">Aucun enlèvement pour ces critères.</p>'}
  ${window.PIPEFIT_DEMO ? '<p class="note small">Démonstration : <button class="linklike" id="ct-exemple">téléchargez un relevé d\'exemple de Descours &amp; Cabot (PDF)</button>, créez une facture fournisseur Descours &amp; Cabot puis « Importer le relevé des BL » : chaque BL est rattaché à son chantier et à l\'enlèvement déclaré.</p>' : ''}`;
};
Views.comptoir.bind = root => {
  [['#ct-ff', 'fournisseur'], ['#ct-fs', 'statut'], ['#ct-fm', 'mois']].forEach(([s, k]) => { root.querySelector(s).onchange = e => { comptoirFiltre[k] = e.target.value; App.render(); }; });
  root.querySelector('#ct-add').onclick = () => editerEnlevement(null);
  const ex = root.querySelector('#ct-exemple'); if (ex) ex.onclick = () => PDF.telecharger(releveExempleHtml(), 'releve-descours-exemple.pdf').catch(e => notify(e.message));
  root.querySelectorAll('[data-en]').forEach(tr => tr.onclick = ev => { if (!ev.target.closest('[data-nocl]')) editerEnlevement(tr.dataset.en); });
};
function editerEnlevement(id) {
  const e = id ? { ...Store.get('enlevements', id) } : { date: isoDate(new Date()), statut: 'Déclaré', userId: '' };
  const box = Modal.open(`<h2 style="margin-top:0">Enlèvement au comptoir</h2>
    <div class="grid2"><div class="field"><label for="en-d">Date</label><input id="en-d" type="date" value="${esc(e.date || '')}"></div>
      <div class="field"><label for="en-u">Compagnon</label><select id="en-u">${options(Store.all('users').filter(u => !u.archive), e.userId)}</select></div>
      <div class="field"><label for="en-f">Fournisseur</label><select id="en-f">${options(fournisseursComptoir(), e.fournisseurId)}</select></div>
      <div class="field"><label for="en-a">Chantier</label><select id="en-a">${options(Store.all('affaires').filter(a => !a.archive || a.id === e.affaireId), e.affaireId, affaireLabel)}</select></div>
      <div class="field"><label for="en-bl">N° BL</label><input id="en-bl" value="${esc(e.bl || '')}"></div>
      <div class="field"><label for="en-m">Montant HT déclaré</label><input id="en-m" type="number" step="0.01" value="${esc(e.montant ?? '')}"></div></div>
    <div class="field"><label for="en-n">Matériel</label><input id="en-n" value="${esc(e.note || '')}"></div>
    ${e.photoId ? `<p><a href="${fileUrl(e.photoId)}" target="_blank" rel="noopener"><img class="thumb" src="${fileUrl(e.photoId)}" alt="Bon"></a></p>` : ''}
    <div class="modal-actions">${id ? '<button class="danger" id="en-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="en-x">Annuler</button><button id="en-ok">Enregistrer</button></div>`);
  const v = s => box.querySelector(s).value;
  box.querySelector('#en-x').onclick = Modal.close;
  if (box.querySelector('#en-del')) box.querySelector('#en-del').onclick = async () => { if (await ask('Supprimer cet enlèvement ?', 'Supprimer')) { Store.remove('enlevements', id); Modal.close(); App.render(); } };
  box.querySelector('#en-ok').onclick = () => {
    Object.assign(e, { date: v('#en-d'), userId: v('#en-u'), fournisseurId: v('#en-f'), affaireId: v('#en-a'), bl: v('#en-bl').trim(), montant: v('#en-m') === '' ? '' : num(v('#en-m')), note: v('#en-n').trim() });
    if (!e.fournisseurId || !e.affaireId) return notify('Indiquez le fournisseur et le chantier.');
    Store.upsert('enlevements', e); Modal.close(); App.render();
  };
}

/* ---------- Facture fournisseur : import du relevé mensuel ---------- */
async function importerReleve(x, fichier) {
  let lignes, ocr = false;
  try {
    if (/\.(xlsx|csv)$/i.test(fichier.name)) {
      const buf = await fichier.arrayBuffer(), feuilles = /\.csv$/i.test(fichier.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
      lignes = feuilles.flatMap(f => f.rows.map(r => r.map(c => String(c ?? '').trim()).filter(Boolean).join('\t')));
    } else { const r = await lireOffreFichier(fichier); lignes = r.texte; ocr = r.ocr; }
  } catch (e) { return notify(`Lecture impossible : ${e.message}`); }
  const rel = ReleveLecture.analyser(lignes, Store.all('affaires'));
  if (!rel.bls.length) return notify('Aucun bon de livraison reconnu dans ce relevé (lignes « BL n° … »).');
  const enl = Store.all('enlevements').filter(e => e.fournisseurId === x.fournisseurId && (e.statut === 'Déclaré' || e.achatId === x.id));
  const rap = ReleveLecture.rapprocher(rel.bls, enl);
  const affs = Store.all('affaires').filter(a => !a.archive || rel.bls.some(b => b.affaireId === a.id));
  const box = Modal.open(`<h2 style="margin-top:0">Relevé ${esc(clientName(x.fournisseurId))}</h2>
    <p class="small ${rel.coherent ? 'pos' : 'warn-text'}">${rel.bls.length} bon(s) de livraison · ${eur(rel.somme)} HT${rel.totalHT !== null ? ` · total du relevé ${eur(rel.totalHT)} ${rel.coherent ? '✓' : '⚠ différent : vérifiez'}` : ''}${ocr ? ' · document scanné : vérifiez' : ''}${num(x.montantHT) && Math.abs(num(x.montantHT) - rel.somme) > 0.05 ? ` · <span class="warn-text">montant HT de la facture ${eur(x.montantHT)}</span>` : ''}</p>
    <div class="table-wrap"><table class="compact lo-table"><tr><th>BL</th><th>Date</th><th>Référence donnée</th><th>Chantier</th><th class="num">Montant HT</th><th>Déclaré par le compagnon</th></tr>
      ${rel.bls.map((b, i) => { const e = rap.parBl[i];
        return `<tr class="${b.affaireId ? '' : 'lo-manque'}"><td><strong>${esc(b.bl)}</strong>${b.lignes.length ? `<br><span class="small muted">${b.lignes.length} article(s)</span>` : ''}</td><td>${dateFr(b.date)}</td><td>${esc(b.refLue || '—')}${b.chantierDeclare ? '<br><span class="small muted">chantier repris de la déclaration</span>' : ''}</td>
          <td><select data-ch="${i}" aria-label="Chantier"><option value="">— frais généraux / stock —</option>${affs.map(a => `<option value="${esc(a.id)}" ${a.id === b.affaireId ? 'selected' : ''}>${esc(affaireLabel(a))}</option>`).join('')}</select></td>
          <td class="num">${eur(b.montant)}</td><td class="small">${e ? `✓ ${esc(userName(e.userId))}, ${dateFr(e.date)}${e.affaireId && b.affaireId && e.affaireId !== b.affaireId ? ` <span class="warn-text">déclaré sur ${esc(affaireOf(e.affaireId).code || '')}</span>` : ''}` : '<span class="muted">non déclaré</span>'}</td></tr>`; }).join('')}</table></div>
    ${rap.nonFactures.length ? `<p class="small warn-text">Déclarés par les compagnons mais absents de ce relevé : ${rap.nonFactures.map(e => `${dateFr(e.date)} ${esc(userName(e.userId))}${e.bl ? ` BL ${esc(e.bl)}` : ''} (${esc(affaireOf(e.affaireId).code || '')})`).join(' · ')} — peut-être sur le relevé suivant.</p>` : ''}
    <label class="check small"><input type="checkbox" id="rl-mt" ${num(x.montantHT) ? '' : 'checked'}> Prendre ${eur(rel.totalHT ?? rel.somme)} comme montant HT de la facture</label>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rl-x">Annuler</button><button id="rl-ok">Ventiler la facture</button></div>`, true);
  box.querySelectorAll('[data-ch]').forEach(s => s.onchange = () => { rel.bls[+s.dataset.ch].affaireId = s.value; s.closest('tr').classList.toggle('lo-manque', !s.value); });
  box.querySelector('#rl-x').onclick = Modal.close;
  box.querySelector('#rl-ok').onclick = () => {
    const v = ReleveLecture.ventilation(rel.bls);
    if (!x.id) x.id = uid(); // facture nouvelle : son id lie les enlèvements rapprochés
    // Lignes de la facture (détail des articles, ou un montant par BL) avec leur BL et leur chantier : historique des prix
    x.lignes = rel.bls.flatMap(b => (b.lignes.length ? b.lignes : [{ designation: `BL ${b.bl}`, qte: 1, unite: 'u', pu: b.montant, montant: b.montant }])
      .map(l => ({ designation: l.designation, reference: l.ref || '', qte: l.qte, unite: l.unite, pu: l.pu, montantHT: l.montant, bl: b.bl, dateBl: b.date, affaireId: b.affaireId })));
    x.imputations = [...(x.imputations || []).filter(i => i.commandeId), ...v.imputations];
    if (box.querySelector('#rl-mt').checked) x.montantHT = rel.totalHT ?? rel.somme;
    x.releve = { fichier: fichier.name, bls: rel.bls.length, date: isoDate(new Date()) };
    if (v.sansChantier.length && !x.fraisGeneraux) x.notes = `${x.notes ? `${x.notes} ` : ''}BL sans chantier : ${v.sansChantier.map(b => b.bl).join(', ')}.`.trim();
    rel.bls.forEach((b, i) => { const e = rap.parBl[i]; if (e) Store.upsert('enlevements', { ...e, statut: 'Facturé', achatId: x.id, montantFacture: b.montant, blFacture: b.bl }); });
    Store.upsert('achats', x); Modal.close(); App.render();
    App.toast(`Facture ventilée sur ${v.imputations.length} chantier(s) · ${rap.parBl.filter(Boolean).length} enlèvement(s) rapproché(s)`, 4500);
  };
}

// Fiche chantier : enlèvements déclarés pas encore facturés (coût à venir)
function comptoirChantierHtml(a) {
  const l = Store.all('enlevements').filter(e => e.affaireId === a.id && e.statut === 'Déclaré');
  if (!l.length) return '';
  return `<p class="small warn-text">Comptoir : ${l.length} enlèvement(s) déclaré(s) pas encore facturé(s)${sumBy(l, e => num(e.montant)) ? ` (${eur(sumBy(l, e => num(e.montant)))} HT déclarés)` : ''} : ${l.map(e => `${dateFr(e.date)} ${esc(clientName(e.fournisseurId))}${e.bl ? ` BL ${esc(e.bl)}` : ''}`).join(', ')}.</p>`;
}

/* ---------- Démonstration : relevé mensuel d'exemple à importer ---------- */
function releveExempleHtml() {
  const Y = new Date().getFullYear(), j = n => dateFr(isoDate(addDays(new Date(), n)));
  const code = id => (Store.get('affaires', id) || {}).code || '';
  const bls = [['4697', j(-6), code('af1'), [['COU-316-050', 'COUDE 90° 3D INOX 316L DN50', 4, 21.4]]],
    ['4705', j(-5), code('hd2'), [['JTG-080', 'JOINT GRAPHITE DN80 PN40', 6, 7.9], ['BOU-INOX-M16', 'BOULON INOX A4 M16X70', 32, 1.12]]],
    ['4719', j(-3), '003', [['TUB-316-050', 'TUBE INOX 316L DN50 SCH10S', 6, 47.3], ['TEE-316-050', 'TE EGAL INOX 316L DN50 A SOUDER', 2, 32.6]]],
    ['4724', j(-1), 'ATELIER', [['DISQ-125', 'DISQUE A TRONCONNER INOX 125', 25, 1.85]]]];
  let tot = 0;
  const lignes = bls.map(([n, d, ref, l]) => { const t = l.reduce((s, x) => s + x[2] * x[3], 0); tot += t;
    return `<tr><td colspan="5"><strong>BL N° ${n} du ${d}</strong> — Votre réf. : ${esc(ref)}</td></tr>
      ${l.map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td><td class="num">${x[2]}</td><td class="num">${fmt(x[3], 2)}</td><td class="num">${fmt(x[2] * x[3], 2)}</td></tr>`).join('')}
      <tr><td colspan="4">Total BL ${n}</td><td class="num">${fmt(t, 2)}</td></tr>`; }).join('');
  return `<div class="doc-head"><div class="doc-societe"><div><strong>DESCOURS &amp; CABOT – exemple de démonstration</strong><br>Agence de Saint-Priest, comptoir</div></div><div class="doc-ref"><strong class="doc-titre">RELEVÉ DES ENLÈVEMENTS N° DC-R-${Y}-1204</strong><br>Date : ${dateFr(isoDate(new Date()))}</div></div>
    <table class="doc-lines"><tr><th>Réf.</th><th>Désignation</th><th class="num">Qté</th><th class="num">PU net</th><th class="num">Montant HT</th></tr>${lignes}</table>
    <p>Total HT du relevé : ${fmt(tot, 2)}<br>TVA 20 % : ${fmt(tot * 0.2, 2)}</p>`;
}
