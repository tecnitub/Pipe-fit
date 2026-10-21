// Registre des fluides frigorigènes : équipements des clients (charge, fluide, tonnes éq. CO2, contrôles d'étanchéité),
// fiches d'intervention (rubriques du Cerfa n° 15497) saisies au bureau ou sur le téléphone avec la signature du client,
// bouteilles et bilan annuel. Règles et calculs : public/js/fluides.js.
const fluidesFiltre = { client: '', q: '', annee: String(new Date().getFullYear()) };
const equipementLabel = e => (e ? `${e.designation || 'Équipement'}${e.localisation ? ` – ${e.localisation}` : ''}` : '');
const fichesDe = eqId => Store.all('fichesFluides').filter(f => f.equipementId === eqId);
const attestationCapacite = () => (Store.data.settings.fluides || {});
const aptitudeFluides = uid => Store.all('habilitations').filter(h => h.userId === uid && h.cle === 'fluides').sort((a, b) => (b.expire || '').localeCompare(a.expire || ''))[0];
const badgeControle = (p, auj) => {
  if (!p) return '<span class="muted small">non soumis</span>';
  const x = Echeances.etat(p.date, auj, 30);
  return `<span class="badge ${x.etat === 'expire' ? 'b-bad' : x.etat === 'bientot' ? 'b-warn' : 'b-ok'}">${dateFr(p.date)}</span>${p.suiviFuite ? ' <span class="small warn-text">suivi de fuite</span>' : ''}`;
};
const quantite = v => (num(v) ? `${fmt(num(v), 2).replace(/,00$/, '')} kg` : '—');

function fluidesOnglets(actif) {
  const n = t => Store.all(t).filter(x => !x.archive).length;
  return `<div class="tabs">${[['', 'Équipements', n('equipementsFrigo')], ['interventions', 'Fiches d\'intervention', Store.all('fichesFluides').length], ['bouteilles', 'Bouteilles', n('bouteilles')], ['bilan', 'Bilan annuel', '']]
    .map(([k, l, c]) => `<a href="#/fluides${k ? `/${k}` : ''}" class="${actif === k ? 'active' : ''}">${l}${c !== '' ? ` <span class="count">${c}</span>` : ''}</a>`).join('')}</div>`;
}

Views.fluides = (params = []) => {
  const auj = isoDate(new Date()), onglet = params[0] || '', fiches = Store.all('fichesFluides');
  const eqs = Store.all('equipementsFrigo').filter(e => !e.archive);
  const ctrl = eqs.map(e => ({ e, p: Fluides.prochainControle(e, fiches) }));
  const depasses = ctrl.filter(x => x.p && x.p.date < auj), bientot = ctrl.filter(x => x.p && x.p.date >= auj && Echeances.etat(x.p.date, auj, 30).etat === 'bientot');
  const an = String(new Date().getFullYear()), bil = Fluides.bilan(fiches, Store.all('equipementsFrigo'), an);
  const att = attestationCapacite(), attEtat = att.validite ? Echeances.etat(att.validite, auj, 60) : { etat: 'absent' };
  let corps = '';
  if (onglet === 'interventions') corps = fluidesInterventions();
  else if (onglet === 'bouteilles') corps = fluidesBouteilles();
  else if (onglet === 'bilan') corps = fluidesBilan();
  else corps = fluidesEquipements(ctrl, auj);
  return `<h1>Fluides frigorigènes</h1>${fluidesOnglets(onglet)}
  <div class="cards">
    <div class="card"><div class="label">Équipements suivis</div><div class="value">${eqs.length}</div><div class="sub">${fmt(sumBy(eqs, e => Fluides.teqCO2(e.fluide, e.charge)), 1)} t éq. CO2 au total</div></div>
    <div class="card"><div class="label">Contrôles d'étanchéité</div><div class="value ${depasses.length ? 'neg' : ''}">${depasses.length}</div><div class="sub">dépassé(s) · ${bientot.length} sous 30 jours</div></div>
    <div class="card"><div class="label">Chargé en ${an}</div><div class="value">${fmt(sumBy(bil, b => b.charge), 1)} kg</div><div class="sub">${fmt(sumBy(bil, b => b.teqCharge), 1)} t éq. CO2 · récupéré ${fmt(sumBy(bil, b => b.recupere), 1)} kg</div></div>
    <div class="card"><div class="label">Fuites constatées en ${an}</div><div class="value">${sumBy(bil, b => b.fuites)}</div><div class="sub">${sumBy(bil, b => b.interventions)} intervention(s)</div></div>
  </div>
  <div class="card small fl-attestation">Attestation de capacité : ${att.numero ? `<strong>n° ${esc(att.numero)}</strong> · catégorie ${esc(att.categorie || '?')} · ${esc(att.organisme || '')} · valable jusqu'au <span class="${attEtat.etat === 'expire' ? 'neg' : attEtat.etat === 'bientot' ? 'warn-text' : ''}">${dateFr(att.validite)}</span>`
    : '<span class="warn-text">non renseignée (obligatoire pour manipuler les fluides)</span>'} ${Store.can('admin') ? '<button class="small secondary" id="fl-att">Modifier</button>' : ''}</div>
  ${corps}`;
};
Views.fluides.bind = (root, params = []) => {
  const onglet = params[0] || '';
  const att = root.querySelector('#fl-att');
  if (att) att.onclick = editerAttestation;
  const q = root.querySelector('#fl-q');
  if (q) q.onchange = () => { fluidesFiltre.q = q.value; App.render(); };
  const cl = root.querySelector('#fl-client');
  if (cl) cl.onchange = () => { fluidesFiltre.client = cl.value; App.render(); };
  root.querySelectorAll('[data-eq]').forEach(el => el.onclick = ev => { if (!ev.target.closest('[data-nocl]')) editerEquipement(el.dataset.eq); });
  root.querySelectorAll('[data-fiche]').forEach(el => el.onclick = () => voirFiche(el.dataset.fiche));
  root.querySelectorAll('[data-bt]').forEach(el => el.onclick = () => editerBouteille(el.dataset.bt));
  root.querySelectorAll('[data-nouvelle-fiche]').forEach(b => b.onclick = ev => { ev.stopPropagation(); nouvelleFicheBureau(b.dataset.nouvelleFiche || ''); });
  const ae = root.querySelector('#fl-add-eq'); if (ae) ae.onclick = () => editerEquipement(null);
  const ab = root.querySelector('#fl-add-bt'); if (ab) ab.onclick = () => editerBouteille(null);
  if (onglet === 'bilan') {
    const an = root.querySelector('#fl-annee'); if (an) an.onchange = () => { fluidesFiltre.annee = an.value; App.render(); };
    root.querySelector('#fl-xlsx').onclick = () => bilanExcel(fluidesFiltre.annee);
    root.querySelector('#fl-pdf').onclick = () => PDF.telecharger(bilanDocument(fluidesFiltre.annee), `bilan-fluides-${fluidesFiltre.annee}.pdf`).catch(e => notify(e.message));
  }
};

function fluidesEquipements(ctrl, auj) {
  const f = fluidesFiltre, clients = [...new Set(ctrl.map(x => x.e.clientId))].map(entreprise).filter(e => e.id).sort((a, b) => a.nom.localeCompare(b.nom));
  const liste = ctrl.filter(({ e }) => (!f.client || e.clientId === f.client) && (!f.q || RechercheArticles.norm([e.designation, e.marque, e.modele, e.numeroSerie, e.fluide, e.localisation, clientName(e.clientId)].join(' ')).includes(RechercheArticles.norm(f.q))))
    .sort((a, b) => ((a.p && a.p.date) || '9999').localeCompare((b.p && b.p.date) || '9999'));
  return `<div class="toolbar"><button id="fl-add-eq">+ Équipement</button><button class="secondary" data-nouvelle-fiche="">+ Fiche d'intervention</button>
    <select id="fl-client" style="width:auto" aria-label="Client"><option value="">Tous les clients</option>${clients.map(c => `<option value="${esc(c.id)}" ${c.id === f.client ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>
    <span class="spacer"></span><input id="fl-q" type="search" value="${esc(f.q)}" placeholder="Rechercher (marque, n° de série, fluide…)" style="width:auto;flex:1 1 200px;max-width:320px"></div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>Client · site</th><th>Équipement</th><th>Fluide</th><th class="num">Charge</th><th class="num">t éq. CO2</th><th>Contrôle</th><th>Dernier</th><th>Prochain</th><th></th></tr>
    ${liste.map(({ e, p }) => { const s = siteOf(e.clientId, e.siteId);
      return `<tr class="clickable" data-eq="${esc(e.id)}"><td>${esc(clientName(e.clientId))}${s ? `<br><span class="muted small">${esc(s.libelle)}</span>` : ''}</td>
      <td><strong>${esc(e.designation)}</strong>${e.photoPlaqueId ? ` <a href="${fileUrl(e.photoPlaqueId)}" target="_blank" rel="noopener" title="Plaque signalétique" data-nocl>📷</a>` : ''}<br><span class="muted small">${esc([e.marque, e.modele, e.numeroSerie && `n° ${e.numeroSerie}`].filter(Boolean).join(' · '))}</span>${e.aValider ? ' <span class="badge b-warn">créé sur chantier</span>' : ''}</td>
      <td>${esc(e.fluide)}${Fluides.famille(e.fluide) === 'HCFC' ? ' <span class="badge b-bad" title="Recharge interdite">HCFC</span>' : ''}</td><td class="num">${quantite(e.charge)}</td><td class="num">${fmt(Fluides.teqCO2(e.fluide, e.charge), 2)}</td>
      <td class="small">${Fluides.periodicite(e) ? `tous les ${Fluides.periodicite(e)} mois${e.detectionPermanente ? ' (détection)' : ''}` : 'non soumis'}${Fluides.detectionObligatoire(e) && !e.detectionPermanente ? '<br><span class="neg">détection permanente obligatoire</span>' : ''}</td>
      <td>${p && p.dernier ? dateFr(p.dernier) : '<span class="muted">—</span>'}</td><td>${badgeControle(p, auj)}</td>
      <td class="actions"><button class="small secondary" data-nouvelle-fiche="${esc(e.id)}">Fiche</button></td></tr>`; }).join('')}</table></div>`
    : '<p class="muted">Aucun équipement enregistré : ajoutez les installations de vos clients (groupes froids, climatisations, pompes à chaleur…).</p>'}`;
}

function fluidesInterventions() {
  const fiches = Store.all('fichesFluides').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.numero || '').localeCompare(a.numero || ''));
  return `<div class="toolbar"><button data-nouvelle-fiche="">+ Fiche d'intervention</button></div>
  <p class="muted small">Fiches à conserver au moins 5 ans par l'opérateur et par le détenteur de l'équipement (le client), qui en reçoit un exemplaire signé.</p>
  ${fiches.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Client · équipement</th><th>Nature</th><th>Opérateur</th><th class="num">Chargé</th><th class="num">Récupéré</th><th>Fuites</th><th>Statut</th></tr>
    ${fiches.map(f => { const e = Store.get('equipementsFrigo', f.equipementId) || {}, ch = num(f.chargeVierge) + num(f.chargeRecycle) + num(f.chargeRegenere), rc = num(f.recupTraitement) + num(f.recupReutilisation);
      return `<tr class="clickable" data-fiche="${esc(f.id)}"><td>${esc(f.numero || '…')}</td><td>${dateFr(f.date)}</td><td>${esc(clientName(e.clientId))}<br><span class="small muted">${esc(equipementLabel(e))} · ${esc(e.fluide || '')}</span></td>
      <td class="small">${esc(Fluides.libelleNature(f.nature))}</td><td>${esc(userName(f.userId))}</td><td class="num">${quantite(ch)}</td><td class="num">${quantite(rc)}</td>
      <td>${(f.fuites || []).length ? `<span class="badge ${f.fuites.every(x => x.reparee) ? 'b-warn' : 'b-bad'}">${f.fuites.length}</span>` : '—'}</td><td>${badge(f.statut)}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">Aucune fiche d\'intervention.</p>'}`;
}

function fluidesBouteilles() {
  const fiches = Store.all('fichesFluides'), l = Store.all('bouteilles').filter(b => !b.archive).sort((a, b) => a.fluide.localeCompare(b.fluide) || String(a.numero).localeCompare(String(b.numero)));
  return `<div class="toolbar"><button id="fl-add-bt">+ Bouteille</button></div>
  ${l.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Fluide</th><th>Type</th><th class="num">Contenance</th><th class="num">Fluide dedans</th><th>Emplacement</th><th>Fournisseur</th></tr>
    ${l.map(b => { const m = Fluides.masseBouteille(b, fiches);
      return `<tr class="clickable" data-bt="${esc(b.id)}"><td><strong>${esc(b.numero)}</strong></td><td>${esc(b.fluide)}</td><td>${b.type === 'recuperation' ? '<span class="badge b-info">récupération</span>' : 'fluide neuf'}</td>
      <td class="num">${quantite(b.contenance)}</td><td class="num ${m < 0 ? 'neg' : num(b.contenance) && m > num(b.contenance) * 0.8 && b.type === 'recuperation' ? 'warn-text' : ''}">${fmt(m, 2)} kg</td>
      <td>${b.userId ? `👷 ${esc(userName(b.userId))}` : '<span class="muted">atelier</span>'}</td><td>${esc(clientName(b.fournisseurId))}</td></tr>`; }).join('')}</table></div>
    <p class="muted small">Quantité dedans = masse au départ + récupérations − charges des fiches d'intervention. Bouteille de récupération pleine à 80 % : à rendre au distributeur.</p>` : '<p class="muted">Aucune bouteille enregistrée.</p>'}`;
}

function fluidesBilan() {
  const annees = [...new Set([String(new Date().getFullYear()), ...Store.all('fichesFluides').map(f => String(f.date || '').slice(0, 4)).filter(Boolean)])].sort().reverse();
  const b = Fluides.bilan(Store.all('fichesFluides'), Store.all('equipementsFrigo'), fluidesFiltre.annee);
  return `<div class="toolbar"><select id="fl-annee" style="width:auto" aria-label="Année">${optionsStr(annees, fluidesFiltre.annee)}</select><span class="spacer"></span>
    <button class="secondary" id="fl-xlsx">Exporter (Excel)</button><button class="secondary" id="fl-pdf">PDF</button></div>
  <p class="muted small">Quantités de fluides chargées et récupérées dans l'année d'après les fiches d'intervention, par fluide : base de la déclaration annuelle à l'organisme agréé qui a délivré l'attestation de capacité.</p>
  ${b.length ? `<div class="table-wrap"><table><tr><th>Fluide</th><th class="num">Interventions</th><th class="num">Fuites</th><th class="num">Chargé vierge</th><th class="num">Recyclé</th><th class="num">Régénéré</th><th class="num">Total chargé</th><th class="num">t éq. CO2</th><th class="num">Récupéré (traitement)</th><th class="num">Récupéré (réutilisation)</th></tr>
    ${b.map(x => `<tr><td><strong>${esc(x.fluide)}</strong></td><td class="num">${x.interventions}</td><td class="num">${x.fuites}</td><td class="num">${fmt(x.chargeVierge, 2)}</td><td class="num">${fmt(x.chargeRecycle, 2)}</td><td class="num">${fmt(x.chargeRegenere, 2)}</td>
      <td class="num"><strong>${fmt(x.charge, 2)}</strong></td><td class="num">${fmt(x.teqCharge, 2)}</td><td class="num">${fmt(x.recupTraitement, 2)}</td><td class="num">${fmt(x.recupReutilisation, 2)}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucune intervention cette année.</p>'}`;
}
function bilanExcel(annee) {
  const H = v => ({ v, s: 'head' }), b = Fluides.bilan(Store.all('fichesFluides'), Store.all('equipementsFrigo'), annee), att = attestationCapacite();
  const rows = [[{ v: `Bilan des fluides frigorigènes ${annee} – ${Store.data.settings.societe || ''}`, s: 'title' }], [`Attestation de capacité n° ${att.numero || '—'} (${att.organisme || ''})`], [],
    ['Fluide', 'Interventions', 'Fuites', 'Chargé vierge (kg)', 'Chargé recyclé (kg)', 'Chargé régénéré (kg)', 'Total chargé (kg)', 't éq. CO2 chargées', 'Récupéré pour traitement (kg)', 'Récupéré pour réutilisation (kg)'].map(H),
    ...b.map(x => [x.fluide, x.interventions, x.fuites, ...[x.chargeVierge, x.chargeRecycle, x.chargeRegenere, x.charge, x.teqCharge, x.recupTraitement, x.recupReutilisation].map(v => ({ v, s: 'num' }))])];
  const fiches = Store.all('fichesFluides').filter(f => String(f.date || '').startsWith(annee) && f.statut !== 'Brouillon').sort((a, c) => a.date.localeCompare(c.date));
  const det = [['N°', 'Date', 'Client', 'Équipement', 'Fluide', 'Charge équipement (kg)', 'Nature', 'Opérateur', 'Fuites', 'Chargé (kg)', 'Récupéré (kg)'].map(H),
    ...fiches.map(f => { const e = Store.get('equipementsFrigo', f.equipementId) || {}; return [f.numero || '', dateFr(f.date), clientName(e.clientId), equipementLabel(e), e.fluide || '', { v: num(e.charge), s: 'num' }, Fluides.libelleNature(f.nature), userName(f.userId),
      (f.fuites || []).map(x => `${x.localisation}${x.reparee ? ' (réparée)' : ''}`).join(' ; '), { v: num(f.chargeVierge) + num(f.chargeRecycle) + num(f.chargeRegenere), s: 'num' }, { v: num(f.recupTraitement) + num(f.recupReutilisation), s: 'num' }]; })];
  download(`bilan-fluides-${annee}.xlsx`, XLSX.build([{ name: 'Bilan', cols: [16, 12, 8, 14, 14, 14, 14, 14, 18, 18], rows }, { name: 'Fiches', cols: [14, 11, 24, 30, 10, 12, 26, 18, 30, 12, 12], freeze: 1, rows: det }]),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function bilanDocument(annee) {
  const b = Fluides.bilan(Store.all('fichesFluides'), Store.all('equipementsFrigo'), annee), att = attestationCapacite();
  return `${Doc.entete('facture', `Bilan des fluides frigorigènes ${annee}`, `Attestation de capacité n° ${esc(att.numero || '—')}<br>Édité le ${dateFr(isoDate(new Date()))}`)}
    <table class="doc-lines compact"><tr><th>Fluide</th><th>Interv.</th><th>Fuites</th><th>Vierge</th><th>Recyclé</th><th>Régénéré</th><th>Total chargé</th><th>t éq. CO2</th><th>Récup. traitement</th><th>Récup. réutilisation</th></tr>
      ${b.map(x => `<tr><td>${esc(x.fluide)}</td><td>${x.interventions}</td><td>${x.fuites}</td><td>${fmt(x.chargeVierge, 2)}</td><td>${fmt(x.chargeRecycle, 2)}</td><td>${fmt(x.chargeRegenere, 2)}</td><td>${fmt(x.charge, 2)}</td><td>${fmt(x.teqCharge, 2)}</td><td>${fmt(x.recupTraitement, 2)}</td><td>${fmt(x.recupReutilisation, 2)}</td></tr>`).join('') || '<tr><td colspan="10">Aucune intervention.</td></tr>'}</table>
    <p class="small">Quantités en kg, d'après les fiches d'intervention de l'année.</p><div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}

/* ---------- Saisies du bureau ---------- */
async function editerAttestation() {
  const a = { ...attestationCapacite() };
  const box = Modal.open(`<h2 style="margin-top:0">Attestation de capacité</h2>
    <p class="muted small">Délivrée à l'entreprise par un organisme agréé ; son numéro figure sur chaque fiche d'intervention.</p>
    <div class="grid2"><div class="field"><label for="at-n">Numéro</label><input id="at-n" value="${esc(a.numero || '')}"></div>
      <div class="field"><label for="at-c">Catégorie</label><select id="at-c">${optionsStr(['I', 'II', 'III', 'IV', 'V'], a.categorie || 'I')}</select></div>
      <div class="field"><label for="at-o">Organisme agréé</label><input id="at-o" value="${esc(a.organisme || '')}"></div>
      <div class="field"><label for="at-v">Valable jusqu'au</label><input id="at-v" type="date" value="${esc(a.validite || '')}"></div></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="at-x">Annuler</button><button id="at-ok">Enregistrer</button></div>`);
  box.querySelector('#at-x').onclick = Modal.close;
  box.querySelector('#at-ok').onclick = async () => {
    const v = s => box.querySelector(s).value.trim();
    await Store.saveSettings({ ...Store.data.settings, fluides: { numero: v('#at-n'), categorie: v('#at-c'), organisme: v('#at-o'), validite: v('#at-v') } });
    Modal.close(); App.render();
  };
}

function champsEquipement(e) {
  const ph = e._plaque || (e.photoPlaqueId ? fileUrl(e.photoPlaqueId) : '');
  return `<div class="eq-plaque">${ph ? `<a href="${ph}" target="_blank" rel="noopener"><img src="${ph}" alt="Plaque signalétique"></a>` : ''}
    <label class="btn secondary">📷 ${ph ? 'Reprendre la photo de la plaque' : 'Photo de la plaque signalétique'}<input type="file" id="eq-ph" accept="image/*" capture="environment" hidden></label>
    <span class="small muted" id="eq-ph-etat">${ph ? '' : 'La plaque est lue : fluide, charge, marque, modèle et n° de série sont remplis.'}</span></div>
  <div class="grid2">
    <div class="field"><label for="eq-cl">Client (détenteur de l'équipement)</label><select id="eq-cl">${options(clientsList(), e.clientId)}</select></div>
    <div class="field"><label for="eq-si">Site</label><select id="eq-si">${options((entreprise(e.clientId).adresses || []), e.siteId, s => s.libelle)}</select></div>
    <div class="field"><label for="eq-de">Désignation</label><input id="eq-de" value="${esc(e.designation || '')}" placeholder="Groupe froid chambre négative, PAC air/eau…"></div>
    <div class="field"><label for="eq-lo">Localisation</label><input id="eq-lo" value="${esc(e.localisation || '')}" placeholder="Toiture bât. B, local technique…"></div>
    <div class="field"><label for="eq-fl">Fluide</label><select id="eq-fl">${optionsStr(Fluides.LISTE.map(x => x[0]), e.fluide || 'R32')}</select></div>
    <div class="field"><label for="eq-ch">Charge totale (kg)</label><input id="eq-ch" type="number" step="0.01" min="0" value="${esc(e.charge ?? '')}"></div>
    <div class="field"><label for="eq-ma">Marque</label><input id="eq-ma" value="${esc(e.marque || '')}"></div>
    <div class="field"><label for="eq-mo">Modèle</label><input id="eq-mo" value="${esc(e.modele || '')}"></div>
    <div class="field"><label for="eq-ns">N° de série</label><input id="eq-ns" value="${esc(e.numeroSerie || '')}"></div>
    <div class="field"><label for="eq-ms">Mise en service</label><input id="eq-ms" type="date" value="${esc(e.miseEnService || '')}"></div>
  </div>
  <label class="check"><input type="checkbox" id="eq-det" ${e.detectionPermanente ? 'checked' : ''}> Système de détection des fuites permanent</label>
  <label class="check"><input type="checkbox" id="eq-her" ${e.hermetique ? 'checked' : ''}> Équipement hermétiquement scellé</label>
  <p class="small muted" id="eq-calc"></p>`;
}
function lireEquipement(box, e) {
  const v = s => box.querySelector(s).value.trim();
  Object.assign(e, { clientId: v('#eq-cl'), siteId: v('#eq-si'), designation: v('#eq-de'), localisation: v('#eq-lo'), fluide: v('#eq-fl'), charge: v('#eq-ch') === '' ? '' : num(v('#eq-ch')),
    marque: v('#eq-ma'), modele: v('#eq-mo'), numeroSerie: v('#eq-ns'), miseEnService: v('#eq-ms'), detectionPermanente: box.querySelector('#eq-det').checked, hermetique: box.querySelector('#eq-her').checked });
  return e;
}
function brancherEquipement(box, e) {
  const calc = () => { const x = lireEquipement(box, { ...e }), p = Fluides.periodicite(x);
    box.querySelector('#eq-calc').innerHTML = `${fmt(Fluides.teqCO2(x.fluide, x.charge), 2)} t éq. CO2 (PRG ${Fluides.prg(x.fluide)}) · ${p ? `contrôle d'étanchéité tous les ${p} mois` : 'pas de contrôle périodique obligatoire'}${Fluides.detectionObligatoire(x) ? ' · <strong>détection permanente obligatoire</strong>' : ''}${Fluides.famille(x.fluide) === 'HCFC' ? ' · <strong class="neg">HCFC : recharge interdite</strong>' : ''}`; };
  box.querySelector('#eq-cl').onchange = () => { box.querySelector('#eq-si').innerHTML = options(entreprise(box.querySelector('#eq-cl').value).adresses || [], '', s => s.libelle); };
  ['#eq-fl', '#eq-ch', '#eq-det', '#eq-her'].forEach(s => { box.querySelector(s).addEventListener('change', calc); box.querySelector(s).addEventListener('input', calc); });
  calc();
  // Photo de la plaque signalétique : gardée avec l'équipement et lue pour pré-remplir les champs vides
  box.querySelector('#eq-ph').onchange = async ev => {
    const fichier = ev.target.files[0], etat = box.querySelector('#eq-ph-etat');
    if (!fichier) return;
    try { e._plaque = await compressImage(fichier, 1600, 0.8); } catch (err) { notify('Photo illisible.'); return; }
    const bloc = box.querySelector('.eq-plaque'), img = bloc.querySelector('img') || bloc.insertBefore(document.createElement('img'), bloc.firstChild);
    img.src = e._plaque; img.alt = 'Plaque signalétique';
    etat.textContent = 'Lecture de la plaque…';
    try {
      const p = Fluides.lirePlaque((await PdfLecture.lire(fichier)).lignes), lus = [];
      const mettre = (sel, v, lib) => { const el = box.querySelector(sel); if (v !== '' && v !== undefined && (!el.value || sel === '#eq-fl')) { el.value = v; lus.push(lib); } };
      mettre('#eq-fl', p.fluide, `fluide ${p.fluide}`); mettre('#eq-ch', p.charge, `charge ${p.charge} kg`); mettre('#eq-ma', p.marque, p.marque);
      mettre('#eq-mo', p.modele, `modèle ${p.modele}`); mettre('#eq-ns', p.numeroSerie, `n° ${p.numeroSerie}`);
      etat.textContent = lus.length ? `Lu sur la plaque : ${lus.join(', ')}. Vérifiez.` : 'Plaque non lue : complétez les champs (la photo est gardée).';
      calc();
    } catch (err) { etat.textContent = 'Lecture impossible : complétez les champs (la photo est gardée).'; }
  };
}
// Photo de plaque prise : envoyée avec l'équipement
async function enregistrerPlaque(e) {
  if (e._plaque) e.photoPlaqueId = await envoyerImage(e._plaque);
  delete e._plaque;
}
function editerEquipement(id) {
  const e = id ? JSON.parse(JSON.stringify(Store.get('equipementsFrigo', id))) : { clientId: fluidesFiltre.client || '', fluide: 'R32' };
  const fiches = id ? fichesDe(id).sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];
  const box = Modal.open(`<h2 style="margin-top:0">${id ? esc(e.designation) : 'Nouvel équipement'}</h2>${champsEquipement(e)}
    ${fiches.length ? `<h3>Historique</h3><ul class="hist-relances">${fiches.map(f => `<li><button class="linklike" data-f="${esc(f.id)}">${esc(f.numero || '…')}</button> · ${dateFr(f.date)} · ${esc(Fluides.libelleNature(f.nature))}${(f.fuites || []).length ? ` · <span class="neg">${f.fuites.length} fuite(s)</span>` : ''}</li>`).join('')}</ul>` : ''}
    <div class="modal-actions">${id ? '<button class="danger" id="eq-arch">Retirer du registre</button>' : ''}<span style="flex:1"></span><button class="secondary" id="eq-x">Annuler</button><button id="eq-ok">Enregistrer</button></div>`, true);
  brancherEquipement(box, e);
  box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => voirFiche(b.dataset.f));
  box.querySelector('#eq-x').onclick = Modal.close;
  if (box.querySelector('#eq-arch')) box.querySelector('#eq-arch').onclick = async () => { if (await ask('Retirer cet équipement du registre (démonté, remplacé) ? Ses fiches restent dans l\'historique.', 'Retirer')) { Store.upsert('equipementsFrigo', { ...e, archive: true }); Modal.close(); App.render(); } };
  box.querySelector('#eq-ok').onclick = async () => {
    lireEquipement(box, e);
    if (!e.clientId || !e.designation) return notify('Indiquez le client et la désignation de l\'équipement.');
    delete e.aValider;
    try { await enregistrerPlaque(e); } catch (err) { return notify(err.message); }
    Store.upsert('equipementsFrigo', e); Modal.close(); App.render();
  };
}
function editerBouteille(id) {
  const b = id ? { ...Store.get('bouteilles', id) } : { fluide: 'R32', type: 'neuve' };
  const box = Modal.open(`<h2 style="margin-top:0">${id ? `Bouteille ${esc(b.numero)}` : 'Nouvelle bouteille'}</h2>
    <div class="grid2"><div class="field"><label for="bt-n">N° de la bouteille</label><input id="bt-n" value="${esc(b.numero || '')}"></div>
      <div class="field"><label for="bt-t">Type</label><select id="bt-t"><option value="neuve" ${b.type !== 'recuperation' ? 'selected' : ''}>Fluide neuf</option><option value="recuperation" ${b.type === 'recuperation' ? 'selected' : ''}>Récupération (transfert)</option></select></div>
      <div class="field"><label for="bt-f">Fluide</label><select id="bt-f">${optionsStr(Fluides.LISTE.map(x => x[0]), b.fluide)}</select></div>
      <div class="field"><label for="bt-c">Contenance (kg)</label><input id="bt-c" type="number" step="0.1" value="${esc(b.contenance ?? '')}"></div>
      <div class="field"><label for="bt-m">Fluide dedans au départ (kg)</label><input id="bt-m" type="number" step="0.01" value="${esc(b.masseInitiale ?? '')}"></div>
      <div class="field"><label for="bt-u">Dans le véhicule de</label><select id="bt-u">${options(Store.all('users').filter(u => !u.archive), b.userId)}</select></div>
      <div class="field"><label for="bt-fo">Fournisseur / distributeur</label><select id="bt-fo">${options(fournisseursList(), b.fournisseurId)}</select></div></div>
    <div class="modal-actions">${id ? '<button class="danger" id="bt-arch">Rendue au distributeur</button>' : ''}<span style="flex:1"></span><button class="secondary" id="bt-x">Annuler</button><button id="bt-ok">Enregistrer</button></div>`);
  const v = s => box.querySelector(s).value.trim();
  box.querySelector('#bt-x').onclick = Modal.close;
  if (box.querySelector('#bt-arch')) box.querySelector('#bt-arch').onclick = () => { Store.upsert('bouteilles', { ...b, archive: true, rendueLe: isoDate(new Date()) }); Modal.close(); App.render(); };
  box.querySelector('#bt-ok').onclick = () => {
    Object.assign(b, { numero: v('#bt-n'), type: v('#bt-t'), fluide: v('#bt-f'), contenance: num(v('#bt-c')), masseInitiale: num(v('#bt-m')), userId: v('#bt-u'), fournisseurId: v('#bt-fo') });
    if (!b.numero) return notify('Indiquez le numéro de la bouteille.');
    Store.upsert('bouteilles', b); Modal.close(); App.render();
  };
}

/* ---------- Fiche d'intervention (bureau et téléphone) ---------- */
const ficheBrouillon = { f: null };
function ficheVide(equipementId) {
  const e = equipementId && Store.get('equipementsFrigo', equipementId);
  return { equipementId: equipementId || '', clientId: e ? e.clientId : '', date: isoDate(new Date()), nature: 'controlePeriodique', userId: Store.me.userId || '', fuites: [], statut: 'Brouillon',
    detecteur: (Store.all('materiels').find(m => !m.archive && /détecteur|fuite|récupération/i.test(`${m.designation} ${m.categorie}`) && m.affectation && m.affectation.userId === Store.me.userId) || {}).designation || '' };
}
function ficheFormHtml(f) {
  const e = Store.get('equipementsFrigo', f.equipementId), clients = clientsList();
  const eqs = Store.all('equipementsFrigo').filter(x => !x.archive && (!f.clientId || x.clientId === f.clientId));
  const bts = type => Store.all('bouteilles').filter(b => !b.archive && (!e || b.fluide === e.fluide) && (type === 'recuperation' ? b.type === 'recuperation' : b.type !== 'recuperation'));
  const optB = (type, sel) => `<option value="">—</option>${bts(type).map(b => `<option value="${esc(b.id)}" ${b.id === sel ? 'selected' : ''}>${esc(b.numero)} · ${esc(b.fluide)} · ${fmt(Fluides.masseBouteille(b, Store.all('fichesFluides')), 1)} kg${b.userId === Store.me.userId ? ' · mon véhicule' : ''}</option>`).join('')}`;
  const apt = aptitudeFluides(f.userId);
  const n = (k, label) => `<div class="field"><label for="ff-${k}">${label}</label><input id="ff-${k}" data-ff="${k}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(f[k] ?? '')}" placeholder="0"></div>`;
  return `<div class="fiche-fluide">
    <fieldset class="hd-bloc"><legend>Équipement</legend>
      <div class="field"><label for="ff-cl">Client (détenteur)</label><select id="ff-cl" class="big-select"><option value="">Choisir…</option>${clients.map(c => `<option value="${esc(c.id)}" ${c.id === f.clientId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></div>
      <div class="field"><label for="ff-eq">Équipement</label><select id="ff-eq" class="big-select"><option value="">Choisir…</option>${eqs.map(x => `<option value="${esc(x.id)}" ${x.id === f.equipementId ? 'selected' : ''}>${esc(equipementLabel(x))} · ${esc(x.fluide)} ${fmt(num(x.charge), 2)} kg</option>`).join('')}<option value="__nouveau">+ Nouvel équipement…</option></select></div>
      ${e ? `<p class="small">${esc(e.fluide)} · charge ${quantite(e.charge)} · ${fmt(Fluides.teqCO2(e.fluide, e.charge), 2)} t éq. CO2 · ${Fluides.periodicite(e) ? `contrôle tous les ${Fluides.periodicite(e)} mois` : 'non soumis au contrôle périodique'}${e.detectionPermanente ? ' · détection permanente' : ''}${Fluides.famille(e.fluide) === 'HCFC' ? ' · <strong class="neg">HCFC : recharge interdite</strong>' : ''}</p>` : ''}
    </fieldset>
    <fieldset class="hd-bloc"><legend>Intervention</legend>
      <div class="grid2"><div class="field"><label for="ff-date">Date</label><input id="ff-date" data-ff="date" type="date" value="${esc(f.date || '')}"></div>
        <div class="field"><label for="ff-nat">Nature</label><select id="ff-nat" data-ff="nature">${Fluides.NATURES.map(([k, l]) => `<option value="${k}" ${f.nature === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      <div class="field"><label for="ff-det">Détecteur de fuites utilisé (identification, date de son dernier contrôle)</label><input id="ff-det" data-ff="detecteur" value="${esc(f.detecteur || '')}"></div>
      <p class="small">Opérateur : <strong>${esc(userName(f.userId))}</strong>${apt ? ` · attestation d'aptitude ${apt.numero ? `n° ${esc(apt.numero)} ` : ''}${apt.expire ? `jusqu'au ${dateFr(apt.expire)}` : ''}${apt.expire && apt.expire < f.date ? ' <span class="neg">expirée</span>' : ''}` : ' · <span class="warn-text">attestation d\'aptitude non enregistrée (RH → Habilitations)</span>'}</p>
    </fieldset>
    <fieldset class="hd-bloc"><legend>Fuites constatées</legend>
      ${(f.fuites || []).map((x, i) => `<div class="ff-fuite"><input data-fuite="${i}" value="${esc(x.localisation || '')}" placeholder="Localisation (vanne, raccord, échangeur…)" aria-label="Localisation de la fuite"><label class="check small"><input type="checkbox" data-reparee="${i}" ${x.reparee ? 'checked' : ''}> réparée</label><button class="icon" data-rmfuite="${i}" aria-label="Retirer">✕</button></div>`).join('') || '<p class="small muted" style="margin:0">Aucune fuite.</p>'}
      <button class="small secondary" id="ff-addfuite">+ Fuite constatée</button>
      ${(f.fuites || []).some(x => x.reparee) ? '<p class="small warn-text">Fuite réparée : contrôle de suivi à faire sous un mois (rappel automatique).</p>' : ''}
    </fieldset>
    <fieldset class="hd-bloc"><legend>Fluide chargé (kg)</legend>
      <div class="grid3">${n('chargeVierge', 'Vierge')}${n('chargeRecycle', 'Recyclé')}${n('chargeRegenere', 'Régénéré')}</div>
      <div class="field"><label for="ff-bc">Bouteille utilisée</label><select id="ff-bc" data-ff="bouteilleCharge">${optB('neuve', f.bouteilleCharge)}</select></div>
    </fieldset>
    <fieldset class="hd-bloc"><legend>Fluide récupéré (kg)</legend>
      <div class="grid2">${n('recupTraitement', 'Destiné au traitement')}${n('recupReutilisation', 'Conservé pour réutilisation')}</div>
      <div class="field"><label for="ff-br">Bouteille de récupération</label><select id="ff-br" data-ff="bouteilleRecup">${optB('recuperation', f.bouteilleRecup)}</select></div>
    </fieldset>
    <div class="field"><label for="ff-obs">Observations</label><textarea id="ff-obs" data-ff="observations" data-dictee rows="2">${esc(f.observations || '')}</textarea></div>
    <fieldset class="hd-bloc"><legend>Signature du détenteur (client)</legend>
      <div class="grid2"><div class="field"><label for="ff-sn">Nom</label><input id="ff-sn" data-ff="signataireNom" value="${esc(f.signataireNom || '')}"></div>
        <div class="field"><label for="ff-sq">Qualité</label><input id="ff-sq" data-ff="signataireQualite" value="${esc(f.signataireQualite || '')}" placeholder="Responsable maintenance…"></div></div>
      <canvas class="sign-pad" id="ff-pad" aria-label="Signature du client"></canvas><button class="small secondary" id="ff-pad-clear">Effacer la signature</button>
    </fieldset>
    <p class="neg small" id="ff-err"></p>
    <div class="toolbar"><button class="secondary" id="ff-brouillon">Enregistrer le brouillon</button><button id="ff-envoyer" class="big">${f.signature ? 'Envoyer la fiche signée' : 'Envoyer la fiche'}</button></div>
  </div>`;
}
// Branche le formulaire ; « apres(fiche) » est appelé une fois la fiche enregistrée
function bindFicheForm(root, f, apres) {
  const $ = s => root.querySelector(s);
  const garder = () => { root.querySelectorAll('[data-ff]').forEach(el => { f[el.dataset.ff] = el.type === 'number' ? (el.value === '' ? '' : num(el.value)) : el.value; }); };
  const redessiner = () => { garder(); App.render(); if (ficheBrouillon.modal) ficheBrouillon.modal(); };
  $('#ff-cl').onchange = () => { garder(); f.clientId = $('#ff-cl').value; f.equipementId = ''; redessiner(); };
  $('#ff-eq').onchange = () => {
    garder();
    if ($('#ff-eq').value === '__nouveau') return nouvelEquipementTerrain(f, redessiner);
    f.equipementId = $('#ff-eq').value; redessiner();
  };
  $('#ff-addfuite').onclick = () => { garder(); f.fuites = [...(f.fuites || []), { localisation: '', reparee: false }]; redessiner(); };
  root.querySelectorAll('[data-fuite]').forEach(el => el.onchange = () => { f.fuites[+el.dataset.fuite].localisation = el.value; });
  root.querySelectorAll('[data-reparee]').forEach(el => el.onchange = () => { garder(); f.fuites[+el.dataset.reparee].reparee = el.checked; redessiner(); });
  root.querySelectorAll('[data-rmfuite]').forEach(el => el.onclick = () => { garder(); f.fuites.splice(+el.dataset.rmfuite, 1); redessiner(); });
  const pad = signaturePad($('#ff-pad'), img => { f.signature = img; $('#ff-envoyer').textContent = 'Envoyer la fiche signée'; });
  if (f.signature) pad.charger(f.signature);
  $('#ff-pad-clear').onclick = () => { pad.effacer(); f.signature = null; $('#ff-envoyer').textContent = 'Envoyer la fiche'; };
  const enregistrer = async envoyer => {
    garder();
    const eq = Store.get('equipementsFrigo', f.equipementId);
    if (envoyer) {
      const err = Fluides.erreur(f, eq) || (f.signature && !String(f.signataireNom || '').trim() ? 'Indiquez le nom du client qui signe' : null);
      if (err) { $('#ff-err').textContent = err; return; }
    } else if (!f.equipementId) { $('#ff-err').textContent = 'Choisissez l\'équipement'; return; }
    $('#ff-envoyer').disabled = true;
    try {
      const o = { ...f };
      delete o.signature;
      if (envoyer && f.signature) Object.assign(o, { signatureClientId: await envoyerImage(f.signature), signeLe: new Date().toISOString() });
      o.statut = envoyer ? (f.signature ? 'Signée' : 'Envoyée') : 'Brouillon';
      o.clientId = eq ? eq.clientId : f.clientId;
      const rec = Store.upsert('fichesFluides', o);
      ficheBrouillon.f = null;
      App.toast(envoyer ? `Fiche d'intervention ${o.statut === 'Signée' ? 'signée et ' : ''}envoyée` : 'Brouillon enregistré');
      apres(rec);
    } catch (e) { $('#ff-envoyer').disabled = false; notify(e.message); }
  };
  $('#ff-brouillon').onclick = () => enregistrer(false);
  $('#ff-envoyer').onclick = () => enregistrer(true);
}
// Équipement absent du registre : créé sur place (le bureau le vérifie ensuite)
function nouvelEquipementTerrain(f, apres) {
  const e = { clientId: f.clientId, fluide: 'R32', userId: Store.me.role === 'atelier' ? Store.me.userId : undefined, miseEnService: f.nature === 'miseEnService' ? f.date : '' };
  const box = Modal.open(`<h2 style="margin-top:0">${f.nature === 'miseEnService' ? 'Mise en service : nouvel équipement' : 'Nouvel équipement'}</h2>${f.nature === 'miseEnService' ? '<p class="small muted">Commencez par la photo de la plaque signalétique : les champs se remplissent tout seuls.</p>' : ''}${champsEquipement(e)}
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="eq-x">Annuler</button><button id="eq-ok">Ajouter</button></div>`, true);
  brancherEquipement(box, e);
  box.querySelector('#eq-x').onclick = () => { Modal.close(); apres(); };
  box.querySelector('#eq-ok').onclick = async () => {
    lireEquipement(box, e);
    if (!e.clientId || !e.designation || !num(e.charge)) return notify('Indiquez le client, la désignation et la charge.');
    if (Store.me.role === 'atelier') e.aValider = true;
    if (f.nature === 'miseEnService' && !e.miseEnService) e.miseEnService = f.date;
    try { await enregistrerPlaque(e); } catch (err) { return notify(err.message); }
    const r = Store.upsert('equipementsFrigo', e);
    Object.assign(f, { equipementId: r.id, clientId: r.clientId });
    Modal.close(); apres();
  };
}

function nouvelleFicheBureau(equipementId) {
  ficheBrouillon.f = ficheVide(equipementId);
  const ouvrir = () => {
    const box = Modal.open(`<h2 style="margin-top:0">Fiche d'intervention</h2>${ficheFormHtml(ficheBrouillon.f)}<div class="modal-actions"><button class="secondary" id="ff-fermer">Fermer</button></div>`, true);
    box.querySelector('#ff-fermer').onclick = () => { ficheBrouillon.modal = null; Modal.close(); };
    bindFicheForm(box, ficheBrouillon.f, rec => { ficheBrouillon.modal = null; Modal.close(); App.render(); voirFiche(rec.id); });
  };
  ficheBrouillon.modal = ouvrir;
  ouvrir();
}
function voirFiche(id) {
  const f = Store.get('fichesFluides', id);
  if (!f) return;
  const box = Modal.open(`<div class="doc doc-apercu">${ficheFluideDocument(f)}</div>
    <div class="modal-actions">${f.statut === 'Brouillon' && Store.can('write', 'fichesFluides') ? '<button class="secondary" id="fv-edit">Compléter</button>' : ''}<span style="flex:1"></span>
      <button class="secondary" id="fv-pdf">PDF</button><button id="fv-x">Fermer</button></div>`, true);
  box.querySelector('#fv-x').onclick = Modal.close;
  box.querySelector('#fv-pdf').onclick = () => PDF.telecharger(ficheFluideDocument(f), `fiche-intervention-${f.numero || f.id}.pdf`).catch(e => notify(e.message));
  const ed = box.querySelector('#fv-edit');
  if (ed) ed.onclick = () => { ficheBrouillon.f = JSON.parse(JSON.stringify(f)); const o = () => { const b = Modal.open(`<h2 style="margin-top:0">Fiche ${esc(f.numero || '')}</h2>${ficheFormHtml(ficheBrouillon.f)}`, true); bindFicheForm(b, ficheBrouillon.f, r => { ficheBrouillon.modal = null; Modal.close(); App.render(); voirFiche(r.id); }); }; ficheBrouillon.modal = o; o(); };
}

// Document de la fiche d'intervention (rubriques du Cerfa n° 15497)
function ficheFluideDocument(f) {
  const e = Store.get('equipementsFrigo', f.equipementId) || {}, s = Store.data.settings, att = attestationCapacite(), apt = aptitudeFluides(f.userId);
  const site = siteOf(e.clientId, e.siteId), cl = entreprise(e.clientId);
  const l = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const kg = v => `${fmt(num(v), 2)} kg`;
  return `${Doc.entete('facture', 'FICHE D\'INTERVENTION', `Fluides frigorigènes · rubriques du Cerfa n° 15497<br>N° ${esc(f.numero || '—')} · ${dateFr(f.date)}`)}
    <h3 class="doc-h">Opérateur</h3><table class="doc-lines compact ppsps-t">
      ${l('Entreprise', esc([s.societe, s.adresse, s.siret && `SIRET ${s.siret}`].filter(Boolean).join(' · ')))}
      ${l('Attestation de capacité', esc(att.numero ? `n° ${att.numero} · catégorie ${att.categorie || ''} · ${att.organisme || ''}${att.validite ? ` · valable jusqu'au ${dateFr(att.validite)}` : ''}` : 'à renseigner'))}
      ${l('Intervenant', esc(`${userName(f.userId)}${apt ? ` · attestation d'aptitude${apt.numero ? ` n° ${apt.numero}` : ''}${apt.niveau ? ` (${apt.niveau})` : ''}${apt.expire ? `, valable jusqu'au ${dateFr(apt.expire)}` : ''}` : ''}`))}</table>
    <h3 class="doc-h">Détenteur et équipement</h3><table class="doc-lines compact ppsps-t">
      ${l('Détenteur', esc([cl.nom, site && `${site.libelle} · ${fullAddress(site)}`].filter(Boolean).join(' · ')))}
      ${l('Équipement', esc([e.designation, e.localisation, e.marque, e.modele, e.numeroSerie && `n° de série ${e.numeroSerie}`].filter(Boolean).join(' · ')))}
      ${l('Fluide', esc(`${e.fluide || ''} · charge totale ${fmt(num(e.charge), 2)} kg · ${fmt(Fluides.teqCO2(e.fluide, e.charge), 2)} t éq. CO2 (PRG ${Fluides.prg(e.fluide)})`))}
      ${l('Système de détection permanent', e.detectionPermanente ? 'oui' : 'non')}${l('Périodicité du contrôle d\'étanchéité', Fluides.periodicite(e) ? `${Fluides.periodicite(e)} mois` : 'non soumis')}</table>
    <h3 class="doc-h">Intervention</h3><table class="doc-lines compact ppsps-t">
      ${l('Nature', esc(Fluides.libelleNature(f.nature)))}${l('Détecteur de fuites', esc(f.detecteur || '—'))}
      ${l('Fuites constatées', (f.fuites || []).length ? f.fuites.map(x => `${esc(x.localisation)} : ${x.reparee ? 'réparée' : '<strong>non réparée</strong>'}`).join('<br>') : 'aucune')}
      ${l('Fluide chargé', `vierge ${kg(f.chargeVierge)} · recyclé ${kg(f.chargeRecycle)} · régénéré ${kg(f.chargeRegenere)}${f.bouteilleCharge ? ` · bouteille ${esc((Store.get('bouteilles', f.bouteilleCharge) || {}).numero || '')}` : ''}`)}
      ${l('Fluide récupéré', `destiné au traitement ${kg(f.recupTraitement)} · conservé pour réutilisation ${kg(f.recupReutilisation)}${f.bouteilleRecup ? ` · bouteille ${esc((Store.get('bouteilles', f.bouteilleRecup) || {}).numero || '')} (transport : UN 1078, gaz frigorifique)` : ''}`)}
      ${f.observations ? l('Observations', esc(f.observations)) : ''}</table>
    <div class="doc-signatures"><div><strong>L'opérateur</strong><br>${esc(userName(f.userId))}</div>
      <div><strong>Le détenteur</strong><br>${f.signatureClientId ? `<img class="doc-signature" src="${fileUrl(f.signatureClientId)}" alt="Signature"><br>${esc(f.signataireNom || '')}${f.signataireQualite ? `, ${esc(f.signataireQualite)}` : ''}<br><span class="small">${f.signeLe ? new Date(f.signeLe).toLocaleString('fr-FR') : ''}</span>` : '<br><br>'}</div></div>
    <p class="small">Fiche à conserver au moins 5 ans par l'opérateur et par le détenteur.</p>
    ${e.photoPlaqueId ? `<h3 class="doc-h">Plaque signalétique de l'équipement</h3><div class="doc-photos"><figure><img src="${fileUrl(e.photoPlaqueId)}" alt="Plaque signalétique"><figcaption>${esc([e.marque, e.modele, e.numeroSerie && `n° ${e.numeroSerie}`].filter(Boolean).join(' · '))}</figcaption></figure></div>` : ''}
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}

/* ---------- Appli des compagnons : mes fiches d'intervention ---------- */
const voitFluides = u => Store.me.role !== 'atelier' || !!aptitudeFluides(u.id) || Store.all('fichesFluides').some(f => f.userId === u.id);
function fluidesCompagnon(u, sous) {
  if (sous === 'miseEnService') { ficheBrouillon.f = { ...ficheVide(''), userId: u.id, nature: 'miseEnService', ouvrirEquipement: true }; sous = 'nouvelle'; }
  if (sous === 'nouvelle') {
    if (!ficheBrouillon.f || ficheBrouillon.f.userId !== u.id) ficheBrouillon.f = { ...ficheVide(''), userId: u.id };
    ficheBrouillon.modal = null;
    return `<div class="pointage"><h1>Fiche d'intervention</h1>${pointageTabs('fluides', u.id)}${ficheFormHtml(ficheBrouillon.f)}</div>`;
  }
  const miennes = Store.all('fichesFluides').filter(f => f.userId === u.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 30);
  const auj = isoDate(new Date());
  const aFaire = Store.all('equipementsFrigo').filter(e => !e.archive).map(e => ({ e, p: Fluides.prochainControle(e, Store.all('fichesFluides')) }))
    .filter(x => x.p && Echeances.etat(x.p.date, auj, 30).etat !== 'ok').slice(0, 10);
  const mesBt = Store.all('bouteilles').filter(b => !b.archive && b.userId === u.id);
  return `<div class="pointage"><h1>Fluides frigorigènes</h1>${pointageTabs('fluides', u.id)}
    <a class="btn big" href="#/pointage/fluides/nouvelle" style="display:block;text-align:center">+ Nouvelle fiche d'intervention</a>
    <a class="btn secondary big" href="#/pointage/fluides/miseEnService" style="display:block;text-align:center;margin-top:8px">❄️ Mise en service d'un équipement (photo de la plaque + Cerfa)</a>
    ${aFaire.length ? `<h2>Contrôles d'étanchéité à faire</h2><ul class="mat-liste">${aFaire.map(({ e, p }) => `<li><span><strong>${esc(clientName(e.clientId))}</strong><br><span class="small">${esc(equipementLabel(e))} · ${esc(e.fluide)}</span></span><span>${badgeControle(p, auj)}</span></li>`).join('')}</ul>` : ''}
    ${mesBt.length ? `<h2>Mes bouteilles</h2><ul class="mat-liste">${mesBt.map(b => `<li><span><strong>${esc(b.numero)}</strong> · ${esc(b.fluide)}${b.type === 'recuperation' ? ' (récupération)' : ''}</span><span>${fmt(Fluides.masseBouteille(b, Store.all('fichesFluides')), 1)} kg</span></li>`).join('')}</ul>` : ''}
    <h2>Mes fiches</h2>${miennes.length ? `<ul class="mat-liste">${miennes.map(f => { const e = Store.get('equipementsFrigo', f.equipementId) || {}; return `<li data-fiche="${esc(f.id)}" class="clickable"><span><strong>${esc(f.numero || (f.statut === 'Brouillon' ? 'brouillon' : 'n° attribué à l\'envoi'))}</strong> · ${dateFr(f.date)}<br><span class="small">${esc(clientName(e.clientId))} · ${esc(equipementLabel(e))}</span></span><span>${badge(f.statut)}</span></li>`; }).join('')}</ul>` : '<p class="muted">Aucune fiche.</p>'}
  </div>`;
}
function bindFluidesCompagnon(root, u, sous) {
  if (sous === 'nouvelle' || sous === 'miseEnService') {
    bindFicheForm(root, ficheBrouillon.f, () => { location.hash = '#/pointage/fluides'; });
    // Mise en service : l'équipement est créé d'abord (photo de la plaque), puis la fiche Cerfa est complétée
    if (ficheBrouillon.f.ouvrirEquipement) { delete ficheBrouillon.f.ouvrirEquipement; nouvelEquipementTerrain(ficheBrouillon.f, () => App.render()); }
    if (sous === 'miseEnService') history.replaceState(null, '', '#/pointage/fluides/nouvelle');
    return;
  }
  root.querySelectorAll('[data-fiche]').forEach(el => el.onclick = () => {
    const f = Store.get('fichesFluides', el.dataset.fiche);
    if (f && f.statut === 'Brouillon') { ficheBrouillon.f = JSON.parse(JSON.stringify(f)); location.hash = '#/pointage/fluides/nouvelle'; } else voirFiche(el.dataset.fiche);
  });
}
