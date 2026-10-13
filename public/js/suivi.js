// Suivi de chantier : rapports d'intervention des équipes (avec photos), réserves de fin de chantier,
// procès-verbal de réception signé par le client sur l'écran (fige les réserves, feu vert pour la facturation).
const RESPONSABLES = ['Pipe-Fit', 'Autre lot', 'Client'];

/* ---------- Signature au doigt ou au stylet ---------- */
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let vide = true, trace = false;
  const ajuster = () => {
    const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * k); canvas.height = Math.max(1, r.height * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14286e';
    vide = true;
  };
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); trace = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
  canvas.addEventListener('pointermove', e => { if (!trace) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); vide = false; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => canvas.addEventListener(t, () => { trace = false; }));
  ajuster();
  return { vide: () => vide, effacer: ajuster, image: () => canvas.toDataURL('image/png') };
}
const envoyerImage = async dataUrl => (await api('POST', '/api/files', { dataUrl })).id;

/* ---------- Rapports d'intervention (application des équipes) ---------- */
const brouillonRapport = { uid: null, affaireId: '', date: '', intervenants: null, travaux: '', observations: '', besoins: '', photos: [] };

function rapportsView(u) {
  const b = brouillonRapport;
  const team = equipeDe(u.id);
  if (b.uid !== u.id) Object.assign(brouillonRapport, { uid: u.id, affaireId: '', date: isoDate(new Date()), intervenants: [u.id, ...team.map(x => x.id)], travaux: '', observations: '', besoins: '', photos: [] });
  const dernier = Store.all('temps').filter(t => t.userId === u.id).sort((x, y) => y.date.localeCompare(x.date))[0] || {};
  const mes = Store.all('rapports').filter(r => r.userId === u.id).sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 15);
  return `<div class="pointage">
    <h1>Pointage</h1>
    ${Store.me.role !== 'atelier' ? `<div class="field"><label for="p-pour">Pointer en tant que</label><select id="p-pour">${options(operateurs(), u.id, undefined, false)}</select></div>` : ''}
    ${pointageTabs('rapports', u.id)}
    <div class="card punch">
      <strong>Rapport d'intervention</strong>
      <div class="grid2">
        <div class="field"><label for="r-aff">Chantier</label><select id="r-aff" class="big-select">${options(chantiersActifs(), b.affaireId || dernier.affaireId, affaireLabel, false)}</select></div>
        <div class="field"><label for="r-date">Date</label><input id="r-date" type="date" value="${esc(b.date)}"></div>
      </div>
      ${team.length ? `<fieldset class="intervenants"><legend>Intervenants</legend>${[u, ...team].map(m => `<label class="check"><input type="checkbox" data-int="${m.id}" ${b.intervenants.includes(m.id) ? 'checked' : ''}> ${esc(m.nom)} ${interimBadge(m)}</label>`).join('')}</fieldset>` : ''}
      <div class="field"><label for="r-travaux">Travaux réalisés *</label><textarea id="r-travaux" rows="5" placeholder="Ex. pose de 40 ml de DN50 inox rack nord, soudure de 18 joints, essais…">${esc(b.travaux)}</textarea></div>
      <div class="field"><label for="r-obs">Observations, difficultés, incidents</label><textarea id="r-obs" rows="3">${esc(b.observations)}</textarea></div>
      <div class="field"><label for="r-besoins">Besoins (matériel, informations, accès)</label><textarea id="r-besoins" rows="2">${esc(b.besoins)}</textarea></div>
      <div class="photos-grid">${b.photos.map((p, i) => `<div class="ph"><img src="${p}" alt="Photo ${i + 1}"><button class="icon" data-rmph="${i}" aria-label="Retirer la photo">✕</button></div>`).join('')}
        <label class="ph add" for="r-photo"><span aria-hidden="true">📷</span><span class="small">Ajouter une photo</span><input id="r-photo" type="file" accept="image/*" capture="environment" multiple hidden></label></div>
      <button class="big" id="r-send">Envoyer le rapport</button>
    </div>
    <h2>Mes derniers rapports</h2>
    <div class="card"><ul class="punch-list">${mes.map(r => `<li class="clickable" data-rapport="${r.id}"><div><strong>${dateFr(r.date)}</strong> · ${esc(affaireOf(r.affaireId).code || '')} <span class="muted small">${esc(r.numero || '')}</span><br>
      <span class="muted small">${esc((r.travaux || '').slice(0, 90))}${(r.travaux || '').length > 90 ? '…' : ''}</span></div><div class="num">${(r.photos || []).length ? `<span class="muted small">${r.photos.length} 📷</span>` : ''}</div></li>`).join('') || '<li class="muted">Aucun rapport.</li>'}</ul></div>
  </div>`;
}

function bindRapports(root, uid) {
  const b = brouillonRapport;
  const garder = () => {
    b.affaireId = root.querySelector('#r-aff').value; b.date = root.querySelector('#r-date').value;
    b.travaux = root.querySelector('#r-travaux').value; b.observations = root.querySelector('#r-obs').value; b.besoins = root.querySelector('#r-besoins').value;
    const ints = root.querySelectorAll('[data-int]');
    if (ints.length) b.intervenants = [...ints].filter(c => c.checked).map(c => c.dataset.int);
  };
  root.querySelectorAll('#r-aff, #r-date, #r-travaux, #r-obs, #r-besoins, [data-int]').forEach(el => { el.onchange = garder; el.oninput = garder; });
  root.querySelector('#r-photo').onchange = async e => {
    garder();
    for (const f of e.target.files) { try { b.photos.push(await compressImage(f)); } catch (err) { notify('Photo illisible.'); } }
    App.render();
  };
  root.querySelectorAll('[data-rmph]').forEach(x => x.onclick = () => { garder(); b.photos.splice(+x.dataset.rmph, 1); App.render(); });
  root.querySelectorAll('[data-rapport]').forEach(li => li.onclick = () => voirRapport(Store.get('rapports', li.dataset.rapport)));
  root.querySelector('#r-send').onclick = async () => {
    garder();
    if (!b.affaireId) { notify('Choisissez le chantier.'); return; }
    if (!b.travaux.trim()) { notify('Décrivez les travaux réalisés.'); return; }
    const btn = root.querySelector('#r-send'); btn.disabled = true; btn.textContent = 'Envoi en cours…';
    try {
      const photos = [];
      for (const p of b.photos) photos.push(await envoyerImage(p));
      Store.upsert('rapports', { numero: '', affaireId: b.affaireId, userId: uid, date: b.date, intervenants: b.intervenants || [uid],
        travaux: b.travaux, observations: b.observations, besoins: b.besoins, photos, statut: 'Envoyé' });
      brouillonRapport.uid = null;
      App.render(); App.toast('Rapport envoyé au chargé d\'affaires');
    } catch (err) { btn.disabled = false; btn.textContent = 'Envoyer le rapport'; notify('Envoi impossible : ' + err.message); }
  };
}

function voirRapport(r) {
  if (!r) return;
  const a = affaireOf(r.affaireId);
  const box = Modal.open(`<h2 style="margin-top:0">Rapport d'intervention ${esc(r.numero || '')}</h2>
    <p class="muted">${dateFr(r.date)} · ${esc(affaireLabel(a))} · rédigé par ${esc(userName(r.userId))}${(r.intervenants || []).length ? ` · intervenants : ${(r.intervenants || []).map(userName).map(esc).join(', ')}` : ''}</p>
    <h3>Travaux réalisés</h3><p class="pre">${esc(r.travaux)}</p>
    ${r.observations ? `<h3>Observations</h3><p class="pre">${esc(r.observations)}</p>` : ''}
    ${r.besoins ? `<h3>Besoins</h3><p class="pre">${esc(r.besoins)}</p>` : ''}
    ${(r.photos || []).length ? `<div class="photos-grid big">${r.photos.map(id => `<a href="${fileUrl(id)}" target="_blank" rel="noopener"><img src="${fileUrl(id)}" alt="Photo du chantier"></a>`).join('')}</div>` : ''}
    <div class="modal-actions"><button id="rp-close">Fermer</button></div>`, true);
  box.querySelector('#rp-close').onclick = Modal.close;
}

/* ---------- Réserves et réception (réunion de fin de chantier) ---------- */
const reservesDe = id => Store.all('reserves').filter(r => r.affaireId === id).sort((a, b) => num(a.numero) - num(b.numero));
const pvDe = id => Store.all('receptions').filter(p => p.affaireId === id).sort((a, b) => (a.numero || '~').localeCompare(b.numero || '~'));
const pvReception = id => pvDe(id).find(p => p.type === 'reception' && p.statut === 'Signé');
let photoReserve = null;

Views.reception = params => {
  const a = Store.get('affaires', params[0]);
  if (!a) return '<p>Chantier introuvable.</p>';
  const res = reservesDe(a.id), pv = pvReception(a.id);
  const ouvertes = res.filter(r => r.statut !== 'Levée');
  const contact = Store.get('contacts', a.contactId) || {};
  const site = siteOf(a.clientId, a.siteId);
  const pvLevee = pvDe(a.id).find(p => p.type === 'levee' && p.statut === 'Signé');
  const signer = !pv ? 'reception' : (pv.decision === 'Avec réserves' && !ouvertes.length && !pvLevee ? 'levee' : null);
  return `<div class="toolbar"><a href="#/chantier/${a.id}" class="btn secondary">← Chantier ${esc(a.code || '')}</a><span class="spacer"></span>
    ${pvDe(a.id).filter(p => p.statut === 'Signé').map(p => `<a class="btn secondary" href="#/pv/${p.id}">${p.type === 'levee' ? 'PV de levée' : 'PV de réception'} ${esc(p.numero || '')}</a>`).join('')}</div>
  <h1>Réception · ${esc(affaireLabel(a))}</h1>
  <p class="muted">${esc(clientName(a.clientId))}${site ? ` · ${esc(site.libelle)}` : ''} · ${pv ? `<span class="badge b-ok">PV signé le ${dateFr(pv.date)} · ${esc(pv.decision)}</span>` : '<span class="badge b-warn">Réception non signée</span>'}${a.okFacturation ? ' <span class="badge b-ok">OK pour facturation</span>' : ''}</p>

  <h2>Réserves <span class="muted small">${ouvertes.length} ouverte(s) sur ${res.length}</span></h2>
  <div class="table-wrap"><table><tr><th>N°</th><th>Localisation</th><th>Description</th><th>Responsable</th><th>Échéance</th><th>Photo</th><th>Statut</th><th></th></tr>
    ${res.map(r => `<tr><td>${r.numero}</td><td>${esc(r.localisation)}</td><td>${esc(r.description)}${r.commentaireLevee ? `<br><span class="small pos">Levée : ${esc(r.commentaireLevee)}</span>` : ''}</td><td>${esc(r.responsable)}</td>
      <td class="${r.statut !== 'Levée' && r.echeance && r.echeance < isoDate(new Date()) ? 'neg' : ''}">${dateFr(r.echeance)}</td>
      <td>${r.photoId ? `<a href="${fileUrl(r.photoId)}" target="_blank" rel="noopener"><img class="thumb" src="${fileUrl(r.photoId)}" alt="Photo de la réserve"></a>` : ''}${r.photoLeveeId ? `<a href="${fileUrl(r.photoLeveeId)}" target="_blank" rel="noopener"><img class="thumb" src="${fileUrl(r.photoLeveeId)}" alt="Photo après levée"></a>` : ''}</td>
      <td>${r.statut === 'Levée' ? `<span class="badge b-ok">Levée le ${dateFr(r.dateLevee)}</span>` : '<span class="badge b-warn">Ouverte</span>'}${r.pvId ? ' <span class="badge" title="Figée par le procès-verbal">PV</span>' : ''}</td>
      <td class="actions">${r.statut !== 'Levée' ? `<button class="small" data-lever="${r.id}">Lever</button>` : ''}${!r.pvId ? `<button class="small danger" data-delres="${r.id}" aria-label="Supprimer la réserve">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Aucune réserve.</td></tr>'}
  </table></div>
  ${!pv ? `<div class="card reserve-form">
    <strong>Nouvelle réserve</strong>
    <div class="grid2">
      <div class="field"><label for="rs-loc">Localisation</label><input id="rs-loc" placeholder="Ex. local CIP, rack nord"></div>
      <div class="field"><label for="rs-resp">Responsable</label><select id="rs-resp">${optionsStr(RESPONSABLES, 'Pipe-Fit')}</select></div>
      <div class="field"><label for="rs-ech">À lever avant le</label><input id="rs-ech" type="date" value="${isoDate(addDays(new Date(), 15))}"></div>
      <div class="field" style="grid-column:1/-1"><label for="rs-desc">Description</label><input id="rs-desc" placeholder="Ex. calorifuge manquant sur 3 m de ligne retour"></div>
    </div>
    <div class="toolbar" style="margin:10px 0 0">
      <label class="btn secondary" for="rs-photo">${photoReserve ? 'Photo ajoutée ✓' : '📷 Photo'}<input id="rs-photo" type="file" accept="image/*" capture="environment" hidden></label>
      ${photoReserve ? `<img class="thumb" src="${photoReserve}" alt="">` : ''}
      <button id="rs-add">Ajouter la réserve</button>
    </div></div>` : ''}

  ${signer ? `<h2>${signer === 'reception' ? 'Procès-verbal de réception' : 'Procès-verbal de levée des réserves'}</h2>
  <div class="card pv-form">
    <div class="grid2">
      <div class="field"><label for="pv-date">Date</label><input id="pv-date" type="date" value="${isoDate(new Date())}"></div>
      <div class="field"><label for="pv-lieu">Lieu</label><input id="pv-lieu" value="${esc(site ? site.libelle : '')}"></div>
      <div class="field" style="grid-column:1/-1"><label for="pv-presents">Personnes présentes</label><input id="pv-presents" value="${esc([contactName(contact) !== '—' ? `${contactName(contact)} (${clientName(a.clientId)})` : '', `${userName(a.chargeId)} (${Store.data.settings.societe})`].filter(Boolean).join(', '))}"></div>
    </div>
    ${signer === 'reception' ? `<fieldset class="decision"><legend>Décision du client</legend>
      <label class="check"><input type="radio" name="pv-dec" value="Sans réserve" ${ouvertes.length ? '' : 'checked'}> Réception prononcée sans réserve</label>
      <label class="check"><input type="radio" name="pv-dec" value="Avec réserves" ${ouvertes.length ? 'checked' : ''}> Réception prononcée avec ${ouvertes.length} réserve(s) listée(s) ci-dessus</label>
      <label class="check"><input type="radio" name="pv-dec" value="Refusée"> Réception refusée</label></fieldset>`
    : `<p>Toutes les réserves du PV ${esc(pv.numero)} sont levées. Le client confirme leur levée.</p>`}
    <div class="field"><label for="pv-com">Commentaire</label><input id="pv-com"></div>
    <div class="sign-grid">
      <div><div class="grid2"><div class="field"><label for="pv-snom">Pour le client : nom</label><input id="pv-snom" value="${esc(contactName(contact) !== '—' ? contactName(contact) : '')}"></div>
        <div class="field"><label for="pv-squal">Qualité</label><input id="pv-squal" value="${esc(contact.fonction || '')}"></div></div>
        <canvas class="sign-pad" id="sig-client" aria-label="Signature du client"></canvas><button class="small secondary" id="sig-client-clear">Effacer</button></div>
      <div><div class="field"><label for="pv-enom">Pour ${esc(Store.data.settings.societe)}</label><input id="pv-enom" value="${esc(userName(a.chargeId) !== '—' ? userName(a.chargeId) : Store.me.nom)}"></div>
        <canvas class="sign-pad" id="sig-ent" aria-label="Signature de l'entreprise"></canvas><button class="small secondary" id="sig-ent-clear">Effacer</button></div>
    </div>
    <button class="big" id="pv-sign">Valider et signer le procès-verbal</button>
    <p class="muted small">Une fois signé, le procès-verbal et la liste des réserves sont figés.</p>
  </div>` : ''}`;
};

Views.reception.bind = (root, params) => {
  const a = Store.get('affaires', params[0]);
  if (!a) return;
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const ph = root.querySelector('#rs-photo');
  if (ph) ph.onchange = async e => {
    const keep = ['#rs-loc', '#rs-desc', '#rs-resp', '#rs-ech'].map(s => root.querySelector(s).value);
    try { photoReserve = await compressImage(e.target.files[0]); } catch (err) { notify('Photo illisible.'); return; }
    App.render();
    ['#rs-loc', '#rs-desc', '#rs-resp', '#rs-ech'].forEach((s, i) => { const el = document.querySelector(s); if (el) el.value = keep[i]; });
  };
  on('#rs-add', async () => {
    const desc = root.querySelector('#rs-desc').value.trim();
    if (!desc) { notify('Décrivez la réserve.'); return; }
    let photoId = '';
    try { if (photoReserve) photoId = await envoyerImage(photoReserve); } catch (err) { notify('Envoi de la photo impossible : ' + err.message); return; }
    Store.upsert('reserves', { affaireId: a.id, numero: reservesDe(a.id).reduce((m, r) => Math.max(m, num(r.numero)), 0) + 1, localisation: root.querySelector('#rs-loc').value,
      description: desc, responsable: root.querySelector('#rs-resp').value, echeance: root.querySelector('#rs-ech').value, photoId, statut: 'Ouverte', pvId: '' });
    photoReserve = null;
    App.render();
  });
  root.querySelectorAll('[data-delres]').forEach(b => b.onclick = () => ask('Supprimer cette réserve ?', 'Supprimer').then(ok => { if (ok) { Store.remove('reserves', b.dataset.delres); App.render(); } }));
  root.querySelectorAll('[data-lever]').forEach(b => b.onclick = () => leverReserve(Store.get('reserves', b.dataset.lever)));

  const cvC = root.querySelector('#sig-client');
  if (!cvC) return;
  const padC = signaturePad(cvC), padE = signaturePad(root.querySelector('#sig-ent'));
  on('#sig-client-clear', padC.effacer); on('#sig-ent-clear', padE.effacer);
  on('#pv-sign', async () => {
    const pvRec = pvReception(a.id);
    const type = pvRec ? 'levee' : 'reception';
    const decision = type === 'reception' ? (root.querySelector('input[name=pv-dec]:checked') || {}).value : 'Réserves levées';
    const ouvertes = reservesDe(a.id).filter(r => r.statut !== 'Levée');
    if (!root.querySelector('#pv-snom').value.trim()) { notify('Indiquez le nom du signataire pour le client.'); return; }
    if (padC.vide() || padE.vide()) { notify('Les deux signatures sont nécessaires.'); return; }
    if (decision === 'Sans réserve' && ouvertes.length && !await ask(`${ouvertes.length} réserve(s) sont encore ouvertes. Signer quand même une réception sans réserve ?`, 'Signer sans réserve', false)) return;
    const btn = root.querySelector('#pv-sign'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const [sc, se] = [await envoyerImage(padC.image()), await envoyerImage(padE.image())];
      const snap = r => ({ numero: r.numero, localisation: r.localisation, description: r.description, responsable: r.responsable, echeance: r.echeance, dateLevee: r.dateLevee || '' });
      const liste = type === 'reception' ? (decision === 'Avec réserves' ? ouvertes : []) : reservesDe(a.id).filter(r => r.pvId === pvRec.id);
      const pv = Store.upsert('receptions', {
        numero: '', affaireId: a.id, type, date: root.querySelector('#pv-date').value, lieu: root.querySelector('#pv-lieu').value, presents: root.querySelector('#pv-presents').value,
        contactId: a.contactId || '', signataireNom: root.querySelector('#pv-snom').value, signataireQualite: root.querySelector('#pv-squal').value, decision,
        reservesSnapshot: liste.map(snap), commentaire: root.querySelector('#pv-com').value, signatureClientId: sc, signatureEntrepriseId: se,
        signataireEntreprise: root.querySelector('#pv-enom').value, signeLe: new Date().toISOString(), statut: 'Signé',
      });
      if (type === 'reception') {
        liste.forEach(r => Store.upsert('reserves', { ...r, pvId: pv.id }));
        Object.assign(a, { dateReception: pv.date, okFacturation: decision !== 'Refusée', statut: decision !== 'Refusée' && ['En préparation', 'En cours'].includes(a.statut) ? 'Terminé' : a.statut });
      } else liste.forEach(r => Store.upsert('reserves', { ...r, pvLeveeId: pv.id }));
      Store.upsert('affaires', a);
      App.toast(type === 'reception' ? (decision === 'Refusée' ? 'PV de refus enregistré' : 'Réception signée : feu vert pour la facturation') : 'Levée des réserves signée', 4000);
      location.hash = `#/pv/${pv.id}`;
    } catch (err) { btn.disabled = false; btn.textContent = 'Valider et signer le procès-verbal'; notify('Enregistrement impossible : ' + err.message); }
  });
};

function leverReserve(r) {
  let photo = null;
  const render = () => {
    const box = Modal.open(`<h2 style="margin-top:0">Lever la réserve n° ${r.numero}</h2>
      <p>${esc(r.description)} <span class="muted">· ${esc(r.localisation)}</span></p>
      <div class="grid2"><div class="field"><label for="lv-date">Date de levée</label><input id="lv-date" type="date" value="${isoDate(new Date())}"></div>
        <div class="field"><label for="lv-com">Travaux réalisés</label><input id="lv-com" placeholder="Ex. calorifuge posé"></div></div>
      <div class="toolbar" style="margin-top:10px"><label class="btn secondary" for="lv-photo">📷 Photo après travaux<input id="lv-photo" type="file" accept="image/*" capture="environment" hidden></label>${photo ? `<img class="thumb" src="${photo}" alt="">` : ''}</div>
      <div class="modal-actions"><button class="secondary" id="lv-cancel">Annuler</button><button id="lv-ok">Réserve levée</button></div>`);
    box.querySelector('#lv-cancel').onclick = Modal.close;
    box.querySelector('#lv-photo').onchange = async e => { const keep = [box.querySelector('#lv-date').value, box.querySelector('#lv-com').value]; photo = await compressImage(e.target.files[0]); render(); document.querySelector('#lv-date').value = keep[0]; document.querySelector('#lv-com').value = keep[1]; };
    box.querySelector('#lv-ok').onclick = async () => {
      let photoLeveeId = '';
      try { if (photo) photoLeveeId = await envoyerImage(photo); } catch (err) { notify(err.message); return; }
      Store.upsert('reserves', { ...r, statut: 'Levée', dateLevee: box.querySelector('#lv-date').value, commentaireLevee: box.querySelector('#lv-com').value, photoLeveeId });
      Modal.close(); App.render();
    };
  };
  render();
}

/* ---------- Procès-verbal (document imprimable) ---------- */
Views.pv = params => {
  const pv = Store.get('receptions', params[0]);
  if (!pv) return '<p>Procès-verbal introuvable.</p>';
  const a = affaireOf(pv.affaireId), s = Store.data.settings, site = siteOf(a.clientId, a.siteId);
  const titre = pv.type === 'levee' ? 'PROCÈS-VERBAL DE LEVÉE DES RÉSERVES' : 'PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX';
  const coche = v => (pv.decision === v ? '☒' : '☐');
  return `<div class="toolbar"><a href="#/reception/${a.id}" class="btn secondary">← Réception</a><a href="#/chantier/${a.id}" class="btn secondary">Chantier</a><span class="spacer"></span>
    <button class="secondary print-btn" onclick="window.print()">Imprimer / PDF</button></div>
  <h1 class="no-print">${pv.type === 'levee' ? 'PV de levée des réserves' : 'PV de réception'} ${esc(pv.numero || '')} <span class="badge ${pv.statut === 'Signé' ? 'b-ok' : 'b-warn'}">${esc(pv.statut)}</span></h1>
  <div class="doc-print">
    <div class="doc-head"><div><strong>${esc(s.societe)}</strong><br>${esc(s.adresse)}<br>SIRET ${esc(s.siret)}</div>
      <div><strong style="font-size:17px">${titre}</strong><br>N° ${esc(pv.numero || '')} du ${dateFr(pv.date)}${pv.lieu ? `<br>Lieu : ${esc(pv.lieu)}` : ''}</div></div>
    <div class="doc-parties"><div>Maître d'ouvrage : <strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)}<br>${esc(fullAddress(site))}` : ''}</div>
      <div>Chantier : <strong>${esc(a.code || '')} – ${esc(a.nom)}</strong>${a.moeId ? `<br>Maîtrise d'œuvre : ${esc(clientName(a.moeId))}` : ''}</div></div>
    ${pv.presents ? `<p><strong>Présents :</strong> ${esc(pv.presents)}</p>` : ''}
    ${pv.type === 'reception' ? `<p>Après visite contradictoire des ouvrages exécutés par ${esc(s.societe)}, le maître d'ouvrage déclare :</p>
      <p class="pv-decision">${coche('Sans réserve')} prononcer la réception sans réserve<br>${coche('Avec réserves')} prononcer la réception avec les réserves listées ci-dessous<br>${coche('Refusée')} refuser la réception</p>`
    : `<p>Le maître d'ouvrage constate la levée des réserves suivantes, formulées lors de la réception :</p>`}
    ${(pv.reservesSnapshot || []).length ? `<div class="table-wrap"><table class="doc-lines"><tr><th>N°</th><th>Localisation</th><th>Réserve</th><th>Responsable</th><th>${pv.type === 'levee' ? 'Levée le' : 'À lever avant le'}</th></tr>
      ${pv.reservesSnapshot.map(r => `<tr><td>${r.numero}</td><td>${esc(r.localisation)}</td><td>${esc(r.description)}</td><td>${esc(r.responsable)}</td><td>${dateFr(pv.type === 'levee' ? r.dateLevee : r.echeance)}</td></tr>`).join('')}</table></div>` : ''}
    ${pv.commentaire ? `<p><strong>Observations :</strong> ${esc(pv.commentaire)}</p>` : ''}
    <div class="signatures signed">
      <div>Pour le maître d'ouvrage<br><strong>${esc(pv.signataireNom)}</strong>${pv.signataireQualite ? `, ${esc(pv.signataireQualite)}` : ''}${pv.signatureClientId ? `<img src="${fileUrl(pv.signatureClientId)}" alt="Signature du client">` : ''}</div>
      <div>Pour ${esc(s.societe)}<br><strong>${esc(pv.signataireEntreprise || '')}</strong>${pv.signatureEntrepriseId ? `<img src="${fileUrl(pv.signatureEntrepriseId)}" alt="Signature de l'entreprise">` : ''}</div>
    </div>
    ${pv.signeLe ? `<p class="muted small">Signé sur écran le ${new Date(pv.signeLe).toLocaleString('fr-FR')}.</p>` : ''}
  </div>`;
};
