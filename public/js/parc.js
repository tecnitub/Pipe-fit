// Parc : véhicules et outillage (nacelles, postes à souder, appareils de mesure, échafaudages…), affectation à une personne
// ou à un chantier avec historique, kilométrage, contrôles périodiques (CT, VGP, étalonnage…) et alertes d'échéance.
const estVehicule = m => Echeances.VEHICULES.includes(m.categorie);
const parcFiltre = { type: '', q: '' };
const affectationTxt = m => { const a = m.affectation || {}; return a.userId ? `👷 ${esc(userName(a.userId))}` : a.affaireId ? `🏗 ${esc(affaireOf(a.affaireId).code || '')} ${esc(affaireOf(a.affaireId).nom || '')}` : '<span class="muted">Atelier / dépôt</span>'; };
const prochaineEcheance = m => (m.echeances || []).filter(e => e.prochaine).sort((a, b) => a.prochaine.localeCompare(b.prochaine))[0];
const alertesParc = (auj = isoDate(new Date())) => Store.all('materiels').filter(m => !m.archive).flatMap(m => Echeances.alertesMateriel(m, auj).map(a => ({ ...a, m }))).sort((a, b) => a.jours - b.jours);
const badgeEcheance = (e, auj) => { if (!e) return '<span class="muted small">—</span>'; const x = Echeances.etat(e.prochaine, auj, 30);
  return `<span class="badge ${x.etat === 'expire' ? 'b-bad' : x.etat === 'bientot' ? 'b-warn' : 'b-ok'}">${dateFr(e.prochaine)}</span> <span class="small">${esc(e.libelle)}</span>`; };

Views.parc = () => {
  const auj = isoDate(new Date()), f = parcFiltre, peut = Store.can('write', 'materiels');
  const tous = Store.all('materiels').filter(m => !m.archive);
  const liste = tous.filter(m => (!f.type || (f.type === 'vehicule') === estVehicule(m))
    && (!f.q || RechercheArticles.norm([m.designation, m.immat, m.numeroSerie, m.categorie, m.marque, userName((m.affectation || {}).userId)].join(' ')).includes(RechercheArticles.norm(f.q))))
    .sort((a, b) => (estVehicule(b) - estVehicule(a)) || a.categorie.localeCompare(b.categorie) || a.designation.localeCompare(b.designation));
  const alertes = alertesParc(auj), exp = alertes.filter(a => a.etat === 'expire');
  return `<h1>Parc véhicules et outillage</h1>
  <div class="cards">
    <div class="card"><div class="label">Véhicules</div><div class="value">${tous.filter(estVehicule).length}</div><div class="sub">${fmt(sumBy(tous.filter(estVehicule), m => num(m.km)))} km au compteur</div></div>
    <div class="card"><div class="label">Outillage et matériel</div><div class="value">${tous.filter(m => !estVehicule(m)).length}</div><div class="sub">${tous.filter(m => (m.affectation || {}).affaireId).length} sur chantier</div></div>
    <div class="card"><div class="label">Contrôles dépassés</div><div class="value ${exp.length ? 'neg' : ''}">${exp.length}</div><div class="sub">${alertes.length - exp.length} à prévoir sous 30 jours</div></div>
  </div>
  ${alertes.length ? `<div class="card"><strong>Contrôles à prévoir</strong><ul class="alertes-hab">${alertes.map(a => `<li class="${a.etat}"><button class="linklike" data-pm="${a.m.id}">${esc(a.m.designation)}${a.m.immat ? ` (${esc(a.m.immat)})` : ''}</button> · ${esc(a.libelle)} <span class="badge ${a.etat === 'expire' ? 'b-bad' : 'b-warn'}">${esc(Echeances.texte(a))}</span>${peut ? ` <button class="small secondary" data-fait="${a.m.id}|${a.cle}">✓ Fait</button>` : ''}</li>`).join('')}</ul></div>` : ''}
  <div class="toolbar">${peut ? '<button id="pm-add">+ Véhicule ou matériel</button>' : ''}
    <div class="seg" role="group" aria-label="Type">${[['', 'Tout'], ['vehicule', 'Véhicules'], ['outil', 'Outillage']].map(([k, l]) => `<button class="${f.type === k ? 'on' : ''}" data-type="${k}">${l}</button>`).join('')}</div>
    <span class="spacer"></span><input id="pm-q" type="search" value="${esc(f.q)}" placeholder="Rechercher (immatriculation, n° de série, personne…)" style="width:auto;min-width:0;flex:1 1 200px;max-width:320px"></div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>Désignation</th><th>Catégorie</th><th>Affecté à</th><th>Prochain contrôle</th><th class="num">Kilométrage</th><th></th></tr>
    ${liste.map(m => `<tr class="clickable" data-pm="${m.id}"><td><strong>${esc(m.designation)}</strong>${m.immat ? `<br><span class="immat">${esc(m.immat)}</span>` : m.numeroSerie ? `<br><span class="muted small">n° ${esc(m.numeroSerie)}</span>` : ''}</td>
      <td>${esc(m.categorie)}</td><td>${affectationTxt(m)}</td><td>${badgeEcheance(prochaineEcheance(m), auj)}</td>
      <td class="num">${estVehicule(m) ? `${fmt(m.km)} km<br><span class="muted small">${m.kmDate ? dateFr(m.kmDate) : ''}</span>` : ''}</td>
      <td class="actions" data-nocl>${peut ? `<button class="small secondary" data-affecter="${m.id}">Affecter</button>${estVehicule(m) ? `<button class="small secondary" data-km="${m.id}">Km</button>` : ''}` : ''}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun véhicule ni matériel enregistré.</p>'}`;
};
Views.parc.bind = root => {
  root.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { parcFiltre.type = b.dataset.type; App.render(); });
  const q = root.querySelector('#pm-q');
  q.onchange = () => { parcFiltre.q = q.value; App.render(); };
  const a = root.querySelector('#pm-add'); if (a) a.onclick = () => editerMateriel(null);
  root.querySelectorAll('[data-pm]').forEach(el => el.onclick = ev => { if (!ev.target.closest('[data-nocl]')) editerMateriel(el.dataset.pm); });
  root.querySelectorAll('[data-affecter]').forEach(b => b.onclick = () => affecterMateriel(b.dataset.affecter));
  root.querySelectorAll('[data-km]').forEach(b => b.onclick = () => releverKm(b.dataset.km));
  root.querySelectorAll('[data-fait]').forEach(b => b.onclick = () => { const [id, cle] = b.dataset.fait.split('|'); controleFait(id, cle); });
};
// Contrôle réalisé aujourd'hui : prochaine échéance = aujourd'hui + périodicité
function controleFait(id, cle) {
  const m = Store.get('materiels', id), e = (m.echeances || []).find(x => x.cle === cle);
  if (!e) return;
  const auj = isoDate(new Date());
  Object.assign(e, { derniere: auj, prochaine: num(e.periodicite) ? Echeances.ajouterMois(auj, e.periodicite) : '' });
  Store.upsert('materiels', m); App.render(); App.toast(`${e.libelle} enregistré${e.prochaine ? ` · prochain le ${dateFr(e.prochaine)}` : ''}`);
}
async function releverKm(id) {
  const m = Store.get('materiels', id);
  const v = await askValue(`Kilométrage de ${m.designation}${m.immat ? ` (${m.immat})` : ''}`, String(m.km || ''), 'number');
  if (v === null || v === '') return;
  if (num(v) < num(m.km) && !(await ask(`Le kilométrage saisi (${fmt(num(v))} km) est inférieur au dernier relevé (${fmt(m.km)} km). Enregistrer quand même ?`, 'Enregistrer', false))) return;
  Object.assign(m, { km: num(v), kmDate: isoDate(new Date()) }); Store.upsert('materiels', m); App.render();
}
function affecterMateriel(id) {
  const m = Store.get('materiels', id), a = m.affectation || {};
  const box = Modal.open(`<h2 style="margin-top:0">Affecter : ${esc(m.designation)}</h2>
    <div class="field"><label for="af-u">À une personne</label><select id="af-u">${options(Store.all('users').filter(u => !u.archive), a.userId)}</select></div>
    <div class="field"><label for="af-a">Sur un chantier</label><select id="af-a">${options(chantiersActifs(), a.affaireId, affaireLabel)}</select></div>
    <p class="muted small">Laisser les deux vides : retour à l'atelier / au dépôt.</p>
    ${(m.historique || []).length ? `<details><summary class="small">Historique (${m.historique.length})</summary><ul class="hist-relances">${m.historique.slice().reverse().map(h => `<li>${dateFr(h.date)} · ${h.userId ? esc(userName(h.userId)) : ''}${h.userId && h.affaireId ? ' · ' : ''}${h.affaireId ? esc(affaireOf(h.affaireId).code || '') : ''}${!h.userId && !h.affaireId ? 'Atelier' : ''} <span class="muted">(${esc(h.par || '')})</span></li>`).join('')}</ul></details>` : ''}
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="af-x">Annuler</button><button id="af-ok">Affecter</button></div>`);
  box.querySelector('#af-x').onclick = Modal.close;
  box.querySelector('#af-ok').onclick = () => {
    const userId = box.querySelector('#af-u').value, affaireId = box.querySelector('#af-a').value, auj = isoDate(new Date());
    m.affectation = { userId, affaireId, depuis: auj };
    m.historique = [...(m.historique || []), { date: auj, userId, affaireId, par: Store.me.nom || Store.me.login }];
    Store.upsert('materiels', m); Modal.close(); App.render();
  };
}
function editerMateriel(id) {
  const m = id ? JSON.parse(JSON.stringify(Store.get('materiels', id))) : { categorie: 'Véhicule utilitaire', designation: '', echeances: [], affectation: { userId: '', affaireId: '' } };
  const peut = Store.can('write', 'materiels');
  if (!id) m.echeances = (Echeances.PARC[m.categorie] || []).map(([cle, libelle, p]) => ({ cle, libelle, periodicite: p, derniere: '', prochaine: '' }));
  const dessiner = () => {
    const box = Modal.open(`<h2 style="margin-top:0">${id ? esc(m.designation) : 'Nouveau véhicule ou matériel'}</h2>
      <div class="grid2">
        <div class="field"><label for="pm-cat">Catégorie</label><select id="pm-cat" ${peut ? '' : 'disabled'}>${optionsStr(Object.keys(Echeances.PARC), m.categorie)}</select></div>
        <div class="field"><label for="pm-des">Désignation</label><input id="pm-des" value="${esc(m.designation || '')}" placeholder="Ex. Renault Master L3H2, nacelle Haulotte…"></div>
        <div class="field"><label for="pm-mar">Marque</label><input id="pm-mar" value="${esc(m.marque || '')}"></div>
        ${Echeances.VEHICULES.includes(m.categorie) ? `<div class="field"><label for="pm-imm">Immatriculation</label><input id="pm-imm" value="${esc(m.immat || '')}" placeholder="AB-123-CD"></div>` : `<div class="field"><label for="pm-ns">N° de série</label><input id="pm-ns" value="${esc(m.numeroSerie || '')}"></div>`}
        <div class="field"><label for="pm-da">Date d'achat / mise en service</label><input id="pm-da" type="date" value="${esc(m.dateAchat || '')}"></div>
        <div class="field"><label for="pm-val">Valeur d'achat HT (€)</label><input id="pm-val" type="number" step="1" value="${esc(m.valeur ?? '')}"></div>
      </div>
      <h3>Contrôles périodiques</h3>
      <div class="table-wrap"><table class="pm-ech"><tr><th>Contrôle</th><th>Dernier</th><th>Périodicité (mois)</th><th>Prochain</th><th></th></tr>
        ${m.echeances.map((e, i) => `<tr><td><input data-e="${i}|libelle" value="${esc(e.libelle)}"></td><td><input type="date" data-e="${i}|derniere" value="${esc(e.derniere || '')}"></td>
          <td><input type="number" min="0" data-e="${i}|periodicite" value="${esc(e.periodicite ?? '')}" style="width:80px"></td><td><input type="date" data-e="${i}|prochaine" value="${esc(e.prochaine || '')}"></td>
          <td><button class="icon" data-rme="${i}" aria-label="Retirer">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun contrôle.</td></tr>'}</table></div>
      <button class="small secondary" id="pm-adde">+ Contrôle</button>
      <div class="field"><label for="pm-notes">Notes</label><textarea id="pm-notes" rows="2">${esc(m.notes || '')}</textarea></div>
      <div class="modal-actions">${peut && id ? '<button class="danger" id="pm-arch">Sortir du parc</button>' : ''}<span style="flex:1"></span><button class="secondary" id="pm-x">Fermer</button>${peut ? '<button id="pm-ok">Enregistrer</button>' : ''}</div>`, true);
    const $ = s => box.querySelector(s);
    const lire = () => {
      Object.assign(m, { designation: $('#pm-des').value.trim(), marque: $('#pm-mar').value.trim(), dateAchat: $('#pm-da').value, valeur: $('#pm-val').value === '' ? '' : num($('#pm-val').value), notes: $('#pm-notes').value });
      if ($('#pm-imm')) m.immat = $('#pm-imm').value.trim().toUpperCase(); if ($('#pm-ns')) m.numeroSerie = $('#pm-ns').value.trim();
    };
    box.querySelectorAll('[data-e]').forEach(el => el.onchange = () => {
      const [i, k] = el.dataset.e.split('|'), e = m.echeances[+i];
      e[k] = k === 'periodicite' ? num(el.value) : el.value;
      // Dernier contrôle ou périodicité changés : prochaine échéance recalculée
      if ((k === 'derniere' || k === 'periodicite') && e.derniere && num(e.periodicite)) { e.prochaine = Echeances.ajouterMois(e.derniere, e.periodicite); box.querySelector(`[data-e="${i}|prochaine"]`).value = e.prochaine; }
    });
    box.querySelectorAll('[data-rme]').forEach(b => b.onclick = () => { lire(); m.echeances.splice(+b.dataset.rme, 1); dessiner(); });
    $('#pm-adde').onclick = () => { lire(); m.echeances.push({ cle: `c${Date.now().toString(36)}`, libelle: '', derniere: '', periodicite: 12, prochaine: '' }); dessiner(); };
    $('#pm-cat').onchange = () => {
      lire(); m.categorie = $('#pm-cat').value;
      // Les contrôles non renseignés de l'ancienne catégorie sont remplacés par ceux de la nouvelle
      m.echeances = m.echeances.filter(e => e.derniere || e.prochaine);
      const deja = new Set(m.echeances.map(e => e.cle));
      (Echeances.PARC[m.categorie] || []).forEach(([cle, libelle, p]) => { if (!deja.has(cle)) m.echeances.push({ cle, libelle, periodicite: p, derniere: '', prochaine: '' }); });
      dessiner();
    };
    $('#pm-x').onclick = Modal.close;
    if (!peut) return;
    if ($('#pm-arch')) $('#pm-arch').onclick = async () => { if (await ask('Sortir ce matériel du parc (vendu, réformé) ? Il reste dans l\'historique.', 'Sortir du parc')) { Store.upsert('materiels', { ...m, archive: true }); Modal.close(); App.render(); } };
    $('#pm-ok').onclick = () => {
      lire();
      if (!m.designation) return notify('Indiquez la désignation.');
      m.echeances = m.echeances.filter(e => e.libelle || e.prochaine);
      Store.upsert('materiels', m); Modal.close(); App.render();
    };
  };
  dessiner();
}

// Appli des compagnons : véhicule et outillage qui leur sont confiés
function monMateriel(u) {
  const ids = [u.id, ...Store.all('users').filter(x => x.chefId === u.id).map(x => x.id)], auj = isoDate(new Date());
  const l = Store.all('materiels').filter(m => !m.archive && m.affectation && ids.includes(m.affectation.userId));
  if (!l.length) return '';
  return `<h2>Mon véhicule et mon outillage</h2><div class="card"><ul class="punch-list">${l.map(m => `<li><div><strong>${esc(m.designation)}</strong>${m.immat ? ` <span class="immat">${esc(m.immat)}</span>` : ''}${m.affectation.userId !== u.id ? ` <span class="muted small">(${esc(userName(m.affectation.userId))})</span>` : ''}
    <br><span class="small">Prochain contrôle : ${badgeEcheance(prochaineEcheance(m), auj)}</span></div></li>`).join('')}</ul></div>`;
}
