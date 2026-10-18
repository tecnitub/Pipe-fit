// Parc → Produits et FDS : produits dangereux transportés dans les véhicules (gaz de soudage, décapants, colles, fluides…)
// avec leur fiche de données de sécurité. Les compagnons les consultent depuis leur téléphone (Mon véhicule, sécurité du chantier).
const pictosHtml = codes => (codes || []).map(c => { const x = Securite.PICTOS.find(y => y[0] === c); return x ? `<span class="ghs" title="${esc(x[1])} (${c})" aria-label="${esc(x[1])}"><i>${x[2]}</i></span>` : ''; }).join('');
const vehiculesParc = () => Store.all('materiels').filter(m => !m.archive && estVehicule(m));
const vehiculesDuProduit = id => Store.all('materiels').filter(m => !m.archive && (m.produits || []).includes(id));
const lienFds = p => (p.fdsFichierId ? lienDocument({ fichierId: p.fdsFichierId, nom: p.fdsNom || `FDS ${p.nom}.pdf` }) : '');

function parcOnglets(actif) {
  return `<div class="tabs"><a href="#/parc" class="${actif === 'parc' ? 'active' : ''}">🚐 Véhicules et outillage</a>
    <a href="#/parc/produits" class="${actif === 'produits' ? 'active' : ''}">🧪 Produits et FDS <span class="count">${Store.all('produits').filter(p => !p.archive).length}</span></a></div>`;
}

function produitsView() {
  const auj = isoDate(new Date()), peut = Store.can('write', 'produits');
  const liste = Store.all('produits').filter(p => !p.archive).sort((a, b) => a.nom.localeCompare(b.nom));
  const sansFds = liste.filter(p => !p.fdsFichierId), anciennes = liste.filter(p => p.fdsFichierId && Securite.fdsAncienne(p.dateFds, auj));
  return `<h1>Parc véhicules et outillage</h1>${parcOnglets('produits')}
  <p class="muted">Produits dangereux transportés dans les véhicules et leur fiche de données de sécurité (FDS). Les compagnons retrouvent les FDS des produits de leur véhicule sur leur téléphone, avec la fiche sécurité de leurs chantiers.</p>
  ${sansFds.length || anciennes.length ? `<div class="card"><ul class="alertes-hab">${sansFds.map(p => `<li class="expire"><button class="linklike" data-pr="${p.id}">${esc(p.nom)}</button> <span class="badge b-bad">FDS manquante</span></li>`).join('')}
    ${anciennes.map(p => `<li class="bientot"><button class="linklike" data-pr="${p.id}">${esc(p.nom)}</button> <span class="badge b-warn">FDS ${p.dateFds ? `du ${dateFr(p.dateFds)}` : 'non datée'} : demander la version à jour au fournisseur</span></li>`).join('')}</ul></div>` : ''}
  <div class="toolbar">${peut ? '<button id="pr-add">+ Produit</button>' : ''}</div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>Produit</th><th>Dangers</th><th>Usage</th><th>FDS</th><th>À bord de</th></tr>
    ${liste.map(p => { const v = vehiculesDuProduit(p.id); return `<tr class="clickable" data-pr="${p.id}"><td><strong>${esc(p.nom)}</strong>${p.fabricant ? `<br><span class="muted small">${esc(p.fabricant)}</span>` : ''}</td>
      <td class="nowrap">${pictosHtml(p.pictos)}${p.mentionsH ? `<br><span class="small muted">${esc(p.mentionsH)}</span>` : ''}</td><td class="small">${esc(p.usage || '')}</td>
      <td data-nocl>${p.fdsFichierId ? `<a href="${lienFds(p)}" target="_blank" rel="noopener">📄 FDS</a><br><span class="small ${Securite.fdsAncienne(p.dateFds, auj) ? 'warn-text' : 'muted'}">${p.dateFds ? dateFr(p.dateFds) : 'non datée'}</span>` : '<span class="badge b-bad">manquante</span>'}</td>
      <td class="small">${v.map(m => `${esc(m.designation)}${m.immat ? ` <span class="immat">${esc(m.immat)}</span>` : ''}`).join('<br>') || '<span class="muted">—</span>'}</td></tr>`; }).join('')}</table></div>`
    : '<p class="muted">Aucun produit enregistré.</p>'}`;
}
function bindProduits(root) {
  const a = root.querySelector('#pr-add'); if (a) a.onclick = () => editerProduit(null);
  root.querySelectorAll('[data-pr]').forEach(el => el.onclick = ev => { if (!ev.target.closest('[data-nocl]')) editerProduit(el.dataset.pr); });
}

function editerProduit(id) {
  const p = id ? JSON.parse(JSON.stringify(Store.get('produits', id))) : { nom: '', pictos: [] };
  const peut = Store.can('write', 'produits'), vehicules = vehiculesParc();
  let abord = new Set(id ? vehiculesDuProduit(id).map(m => m.id) : []);
  const box = Modal.open(`<h2 style="margin-top:0">${id ? esc(p.nom) : 'Nouveau produit'}</h2>
    <div class="grid2">
      <div class="field"><label for="pr-nom">Nom commercial</label><input id="pr-nom" value="${esc(p.nom)}" placeholder="Ex. Acétylène dissous, pâte de décapage inox…"></div>
      <div class="field"><label for="pr-fab">Fabricant / fournisseur</label><input id="pr-fab" value="${esc(p.fabricant || '')}"></div>
      <div class="field"><label for="pr-us">Usage</label><input id="pr-us" value="${esc(p.usage || '')}" placeholder="Soudage, décapage des soudures inox…"></div>
      <div class="field"><label for="pr-h">Mentions de danger (H)</label><input id="pr-h" value="${esc(p.mentionsH || '')}" placeholder="H220, H280…"></div>
    </div>
    <div class="field"><span class="label">Pictogrammes de danger</span><div class="ghs-choix">${Securite.PICTOS.map(([c, l, ic]) => `<label class="check small"><input type="checkbox" data-ghs="${c}" ${(p.pictos || []).includes(c) ? 'checked' : ''}><span class="ghs"><i>${ic}</i></span> ${esc(l)}</label>`).join('')}</div></div>
    <div class="grid2">
      <div class="field"><label for="pr-epi">EPI à porter</label><input id="pr-epi" value="${esc(p.epi || '')}" placeholder="Gants nitrile, lunettes…"></div>
      <div class="field"><label for="pr-st">Stockage, transport</label><input id="pr-st" value="${esc(p.stockage || '')}" placeholder="Bouteilles debout, arrimées, véhicule ventilé…"></div>
    </div>
    <div class="field"><label for="pr-ps">Premiers secours (résumé de la FDS)</label><textarea id="pr-ps" rows="2">${esc(p.secours || '')}</textarea></div>
    <div class="field"><span class="label">Fiche de données de sécurité</span>
      <div class="toolbar" style="margin:0"><span id="pr-fds-nom">${p.fdsFichierId ? `<a href="${lienFds(p)}" target="_blank" rel="noopener">📄 ${esc(p.fdsNom || 'FDS')}</a>` : '<span class="muted">aucune</span>'}</span>
        ${peut ? '<label class="btn secondary small">📤 Joindre la FDS (PDF)<input type="file" id="pr-fds" accept=".pdf,image/*" hidden></label>' : ''}
        <label class="small" for="pr-dfds">Version du</label><input id="pr-dfds" type="date" value="${esc(p.dateFds || '')}" style="width:auto"></div></div>
    ${vehicules.length ? `<div class="field"><span class="label">À bord des véhicules</span><div class="ghs-choix">${vehicules.map(m => `<label class="check small"><input type="checkbox" data-veh="${m.id}" ${abord.has(m.id) ? 'checked' : ''}> ${esc(m.designation)}${m.immat ? ` <span class="immat">${esc(m.immat)}</span>` : ''}${(m.affectation || {}).userId ? ` <span class="muted">(${esc(userName(m.affectation.userId))})</span>` : ''}</label>`).join('')}</div></div>` : ''}
    <div class="modal-actions">${peut && id ? '<button class="danger" id="pr-arch">Retirer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="pr-x">Fermer</button>${peut ? '<button id="pr-ok">Enregistrer</button>' : ''}</div>`, true);
  const $ = s => box.querySelector(s);
  $('#pr-x').onclick = Modal.close;
  if (!peut) return;
  $('#pr-fds').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    $('#pr-fds-nom').textContent = `Envoi de ${f.name}…`;
    try { const r = await envoyerFichierDocument(f); Object.assign(p, { fdsFichierId: r.id, fdsNom: f.name }); if (!$('#pr-dfds').value) $('#pr-dfds').value = isoDate(new Date()); $('#pr-fds-nom').innerHTML = `📄 ${esc(f.name)}`; }
    catch (e) { $('#pr-fds-nom').textContent = ''; notify(e.message); }
  };
  if ($('#pr-arch')) $('#pr-arch').onclick = async () => {
    if (!(await ask('Retirer ce produit (plus transporté) ? Il est aussi retiré des véhicules.', 'Retirer'))) return;
    vehiculesDuProduit(id).forEach(m => Store.upsert('materiels', { ...m, produits: m.produits.filter(x => x !== id) }));
    Store.upsert('produits', { ...p, archive: true }); Modal.close(); App.render();
  };
  $('#pr-ok').onclick = () => {
    Object.assign(p, { nom: $('#pr-nom').value.trim(), fabricant: $('#pr-fab').value.trim(), usage: $('#pr-us').value.trim(), mentionsH: $('#pr-h').value.trim(), epi: $('#pr-epi').value.trim(),
      stockage: $('#pr-st').value.trim(), secours: $('#pr-ps').value.trim(), dateFds: $('#pr-dfds').value, pictos: [...box.querySelectorAll('[data-ghs]:checked')].map(c => c.dataset.ghs) });
    if (!p.nom) return notify('Indiquez le nom du produit.');
    const rec = Store.upsert('produits', p), pid = (rec && rec.id) || p.id;
    abord = new Set([...box.querySelectorAll('[data-veh]:checked')].map(c => c.dataset.veh));
    vehicules.forEach(m => {
      const avant = (m.produits || []).includes(pid), apres = abord.has(m.id);
      if (avant !== apres) Store.upsert('materiels', { ...m, produits: apres ? [...(m.produits || []), pid] : m.produits.filter(x => x !== pid) });
    });
    Modal.close(); App.render();
  };
}

// FDS des produits (liste pour le téléphone)
function fdsListe(ids) {
  const l = ids.map(id => Store.get('produits', id)).filter(p => p && !p.archive).sort((a, b) => a.nom.localeCompare(b.nom));
  if (!l.length) return '';
  return `<ul class="docs-mobile">${l.map(p => `<li>${p.fdsFichierId ? `<a href="${lienFds(p)}" target="_blank" rel="noopener">` : '<div class="fds-sans">'}<span class="doc-ic">🧪</span>
    <span><strong>${esc(p.nom)}</strong> ${pictosHtml(p.pictos)}<br><span class="small muted">${p.fdsFichierId ? 'FDS' : 'FDS non disponible : voir le bureau'}${p.epi ? ` · EPI : ${esc(p.epi)}` : ''}</span>
    ${p.secours ? `<br><span class="small">🚑 ${esc(p.secours)}</span>` : ''}</span>${p.fdsFichierId ? '</a>' : '</div>'}</li>`).join('')}</ul>`;
}
