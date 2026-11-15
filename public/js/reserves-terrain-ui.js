// Réserves affectées aux compagnons (ReservesTerrain) : au bureau, sur l'écran « Réserves et réception », reprise des
// réserves de conformité de l'étude et des PV de mise en service, affectation à un compagnon (notifié) ; dans l'appli
// des compagnons, fiche du chantier : « Mes réserves à lever », levée avec photo et commentaire, hors connexion comprise
// (enregistrement mis en file et envoyé au retour du réseau). La levée remonte dans l'étude et le DOE.
const liensReserves = new Map();
const compagnonsAffectables = () => Store.all('users').filter(u => !['charge', 'admin'].includes(u.role) && !u.archive && u.actif !== false).sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'));
const optionsCompagnons = sel => `<option value="">— non affectée —</option>${compagnonsAffectables().map(u => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.nom || u.login || u.id)}</option>`).join('')}`;

// Bureau : réserves à reprendre (étude, PV) et affectation des réserves ouvertes
function reservesTerrainHtml(a) {
  const res = reservesDe(a.id), liens = liensReserves.get(a.id) || [], ouvertes = res.filter(r => r.statut !== 'Levée');
  const cands = ReservesTerrain.candidats({ liens, mesReserves: Essais.reservesReception(misesDe(a.id)), reserves: res });
  if (!cands.length && !ouvertes.length) return '';
  return `<div class="card" id="rt-carte"><strong>🛠️ Réserves à lever par les compagnons</strong>
    <p class="small muted">Affectées à un compagnon, elles apparaissent dans son appli (fiche du chantier) ; il les lève avec une photo et un commentaire, même sans réseau. Les réserves de conformité levées sont cochées dans l'étude et reprises dans le DOE.</p>
    ${cands.length ? `<h3 style="margin:.4em 0">À reprendre <span class="muted small">${cands.length}</span></h3>
      <div class="table-wrap"><table><tr><th></th><th>Origine</th><th>Localisation</th><th>Réserve</th></tr>
      ${cands.map((c, i) => `<tr><td><input type="checkbox" data-rt-c="${i}" checked aria-label="Reprendre"></td><td class="small">${c.source === 'etude' ? `Étude${c.origine.etude ? ` « ${esc(c.origine.etude)} »` : ''}<br>${esc(c.categorie)}` : 'PV de mise en service'}</td><td>${esc(c.localisation)}</td><td>${esc(c.description)}</td></tr>`).join('')}</table></div>
      <div class="toolbar" style="margin:6px 0"><label class="small" for="rt-qui">Affecter à</label><select id="rt-qui" style="width:auto">${optionsCompagnons('')}</select>
        <label class="small" for="rt-ech">à lever avant le</label><input id="rt-ech" type="date" style="width:auto" value="${isoDate(addDays(new Date(), 15))}"><button class="small" id="rt-creer">Reprendre les réserves cochées</button></div>` : ''}
    ${ouvertes.length ? `<h3 style="margin:.4em 0">Affectation des réserves ouvertes</h3><div class="table-wrap"><table><tr><th>N°</th><th>Réserve</th><th>Affectée à</th></tr>
      ${ouvertes.map(r => `<tr><td>${esc(r.numero)}</td><td>${esc(r.description)}${r.origine && r.origine.app === 'etudes' ? ' <span class="badge b-info">étude</span>' : r.cleMes ? ' <span class="badge b-info">PV</span>' : ''}</td><td><select data-rt-aff="${esc(r.id)}" aria-label="Affectée à" ${r.pvId && !Store.can('admin') ? 'disabled' : ''}>${optionsCompagnons(r.assigneA || '')}</select></td></tr>`).join('')}</table></div>` : ''}</div>`;
}
const notifierAffectation = (r, a) => { if (!r.assigneA) return; Store.upsert('notifications', { type: 'reserve', userId: r.assigneA, affaireId: a.id, titre: `🛠️ Réserve à lever : ${a.code || ''}`.trim(), texte: `N° ${r.numero} — ${r.description}`.slice(0, 300), lien: `#/pointage/chantier/${a.id}`, date: new Date().toISOString(), lu: false }); };
async function chargerReservesTerrain(root, a) {
  const z = root.querySelector('#res-terrain'); if (!z) return;
  try { liensReserves.set(a.id, await api('GET', `/api/liens?affaireId=${encodeURIComponent(a.id)}&app=etudes`)); } catch (e) { if (!liensReserves.has(a.id)) liensReserves.set(a.id, []); }
  const n = document.querySelector('#res-terrain'); if (!n) return;
  n.innerHTML = reservesTerrainHtml(Store.get('affaires', a.id) || a); bindReservesTerrain(n, a);
}
function bindReservesTerrain(z, a) {
  const cr = z.querySelector('#rt-creer');
  if (cr) cr.onclick = () => {
    const res = reservesDe(a.id), cands = ReservesTerrain.candidats({ liens: liensReserves.get(a.id) || [], mesReserves: Essais.reservesReception(misesDe(a.id)), reserves: res });
    const choix = [...z.querySelectorAll('[data-rt-c]:checked')].map(c => cands[+c.dataset.rtC]).filter(Boolean);
    if (!choix.length) return notify('Cochez au moins une réserve.');
    let k = res.reduce((m, r) => Math.max(m, num(r.numero)), 0);
    const qui = z.querySelector('#rt-qui').value, ech = z.querySelector('#rt-ech').value;
    choix.forEach(c => { const r = Store.upsert('reserves', { affaireId: a.id, ...ReservesTerrain.creer(c, { numero: ++k, assigneA: qui, echeance: ech }) }); notifierAffectation(r, a); });
    App.toast(`${choix.length} réserve(s) reprise(s)${qui ? ` et affectée(s) à ${userName(qui)}` : ''}`, 4000); App.render();
  };
  z.querySelectorAll('[data-rt-aff]').forEach(s => s.onchange = () => {
    const r = Store.get('reserves', s.dataset.rtAff); if (!r) return;
    const n = Store.upsert('reserves', { ...r, assigneA: s.value }); notifierAffectation(n, a);
    App.toast(s.value ? `Réserve n° ${r.numero} affectée à ${userName(s.value)}` : `Réserve n° ${r.numero} sans affectation`);
  });
}

// Appli des compagnons : ses réserves sur ce chantier
function mesReservesHtml(u, a) {
  const l = ReservesTerrain.duCompagnon(Store.all('reserves'), u.id, a.id);
  if (!l.length) return '';
  const ouvertes = l.filter(r => r.statut !== 'Levée').length;
  return `<h2>🛠️ Mes réserves à lever <span class="muted small">${ouvertes} ouverte(s) sur ${l.length}</span></h2>
    <ul class="mat-liste" id="mes-reserves">${l.map(r => `<li><span><strong>N° ${esc(r.numero)}</strong> ${esc(r.description)}${r.localisation ? `<br><span class="small muted">📍 ${esc(r.localisation)}</span>` : ''}${r.echeance && r.statut !== 'Levée' ? `<br><span class="small ${r.echeance < isoDate(new Date()) ? 'neg' : 'muted'}">à lever avant le ${dateFr(r.echeance)}</span>` : ''}
      ${r.statut === 'Levée' ? `<br><span class="small pos">✓ Levée le ${dateFr(r.dateLevee)}${r.commentaireLevee ? ` : ${esc(r.commentaireLevee)}` : ''}</span>` : ''}${HorsLigne.enAttente('reserves', r.id) ? '<br><span class="badge b-warn">⏳ à envoyer</span>' : ''}</span>
      <span>${r.statut === 'Levée' ? (r.photoLeveeId ? `<img class="thumb" src="${fileUrl(r.photoLeveeId)}" alt="Photo de la levée">` : '') : `<button type="button" class="small" data-lever-terrain="${esc(r.id)}">✅ Lever</button>`}</span></li>`).join('')}</ul>`;
}
function bindMesReserves(root) {
  root.querySelectorAll('[data-lever-terrain]').forEach(b => b.onclick = () => leverReserveTerrain(Store.get('reserves', b.dataset.leverTerrain)));
}
function leverReserveTerrain(r) {
  if (!r) return;
  let photo = null;
  const box = Modal.open(`<h2 style="margin-top:0">Lever la réserve n° ${esc(r.numero)}</h2><p>${esc(r.description)}</p>
    <div class="field"><label for="lt-com">Travaux réalisés</label><textarea id="lt-com" rows="3" data-dictee placeholder="Ex. calorifuge posé et étiqueté"></textarea></div>
    <div class="toolbar" style="margin-top:8px"><label class="btn secondary" for="lt-photo">📷 Photo après travaux<input id="lt-photo" type="file" accept="image/*" capture="environment" hidden></label><img class="thumb" id="lt-apercu" alt="" hidden></div>
    <p class="small muted">Sans réseau, la levée est gardée sur le téléphone et envoyée au retour de la connexion.</p>
    <div class="modal-actions"><button class="secondary" id="lt-x">Annuler</button><button id="lt-ok">Réserve levée</button></div>`);
  box.querySelector('#lt-x').onclick = Modal.close;
  box.querySelector('#lt-photo').onchange = async e => { try { photo = await compressImage(e.target.files[0], 1600, 0.8); const im = box.querySelector('#lt-apercu'); im.src = photo; im.hidden = false; } catch (err) { notify('Photo illisible.'); } };
  box.querySelector('#lt-ok').onclick = async () => {
    const com = box.querySelector('#lt-com').value.trim();
    if (!com && !photo) return notify('Ajoutez une photo ou un commentaire.');
    let photoId = '';
    try { if (photo) photoId = await HorsLigne.envoyerImage(photo); } catch (err) { return notify(`Photo : ${err.message}`); }
    Store.upsert('reserves', ReservesTerrain.lever(r, { date: isoDate(new Date()), commentaire: com, photoId, par: userName(Store.me.userId) || Store.me.nom || '', parId: Store.me.userId || '' }));
    Modal.close(); App.toast(HorsLigne.enLigne() ? 'Réserve levée : le bureau est informé' : 'Réserve levée — enregistrée sur le téléphone, envoyée au retour du réseau', 4000); App.render();
  };
}
