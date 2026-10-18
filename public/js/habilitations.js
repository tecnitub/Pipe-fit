// RH → Habilitations : visites médicales et habilitations des compagnons (QMOS, fluides, électrique, CACES…),
// tableau personne × habilitation, alertes d'expiration, justificatif (photo ou PDF du titre).
const habsDe = uid => Store.all('habilitations').filter(h => h.userId === uid);
const habDe = (uid, cle) => habsDe(uid).filter(h => h.cle === cle).sort((a, b) => (b.expire || '').localeCompare(a.expire || ''))[0];
const personnesRH = () => Store.all('users').filter(u => !u.archive && u.role !== 'charge').sort((a, b) => a.nom.localeCompare(b.nom));
const alertesHabilitations = (auj = isoDate(new Date())) => Echeances.alertesPersonne(personnesRH().flatMap(u => Echeances.HABILITATIONS.map(([cle]) => habDe(u.id, cle)).filter(Boolean)), auj)
  .sort((a, b) => a.jours - b.jours);
// Petit signal à côté d'un nom (planning, pointage) quand une habilitation ou la visite médicale est expirée
function signalHabilitation(uid) {
  const a = Echeances.alertesPersonne(Echeances.HABILITATIONS.map(([cle]) => habDe(uid, cle)).filter(Boolean), isoDate(new Date()));
  const exp = a.filter(x => x.etat === 'expire');
  if (!a.length) return '';
  return ` <span class="hab-signal ${exp.length ? 'expire' : 'bientot'}" title="${esc(a.map(x => `${x.libelle} : ${Echeances.texte(x)}`).join('\n'))}">${exp.length ? '⛔' : '⚠'}</span>`;
}

function rhHabilitations() {
  const auj = isoDate(new Date()), alertes = alertesHabilitations(auj), gens = personnesRH();
  const exp = alertes.filter(a => a.etat === 'expire'), bientot = alertes.filter(a => a.etat === 'bientot');
  const cellule = (u, cle) => {
    const h = habDe(u.id, cle), e = h ? Echeances.etat(h.expire, auj) : { etat: 'absent' };
    return `<td class="hab-c ${e.etat}"><button class="hab-b" data-hab="${u.id}|${cle}" title="${esc(Echeances.libelleHab(cle))}${h && h.niveau ? ` · ${esc(h.niveau)}` : ''}">${h ? `${h.expire ? dateFr(h.expire) : 'sans date'}${h.niveau ? `<br><span class="small">${esc(h.niveau)}</span>` : ''}` : '<span class="muted">+</span>'}</button></td>`;
  };
  return `<h1>RH</h1>${rhTabs('habilitations')}
  <div class="cards">
    <div class="card"><div class="label">Expirées</div><div class="value ${exp.length ? 'neg' : ''}">${exp.length}</div><div class="sub">visites médicales et habilitations</div></div>
    <div class="card"><div class="label">À renouveler sous ${Echeances.SEUIL} jours</div><div class="value ${bientot.length ? 'warn-text' : ''}">${bientot.length}</div><div class="sub">prévoir la formation ou le rendez-vous</div></div>
  </div>
  ${alertes.length ? `<div class="card"><strong>À traiter</strong><ul class="alertes-hab">${alertes.map(a => `<li class="${a.etat}"><button class="linklike" data-hab="${a.userId}|${a.cle}">${esc(userName(a.userId))} · ${esc(a.libelle)}</button> <span class="badge ${a.etat === 'expire' ? 'b-bad' : 'b-warn'}">${esc(Echeances.texte(a))}</span></li>`).join('')}</ul></div>` : '<p class="note">Aucune habilitation ni visite médicale expirée ou à renouveler dans les 60 jours.</p>'}
  <p class="muted small">Cliquez une case pour saisir ou renouveler (date d'obtention, date d'expiration, niveau, justificatif). Les compagnons concernés et le bureau sont prévenus 60 jours avant l'expiration, puis à l'expiration. Le planning signale ⚠ / ⛔ les personnes concernées.</p>
  <div class="table-wrap"><table class="hab-table"><tr><th>Personne</th>${Echeances.HABILITATIONS.map(([cle, lib]) => `<th title="${esc(lib)}">${esc(Echeances.COURT[cle])}</th>`).join('')}</tr>
    ${gens.map(u => `<tr><td><strong>${esc(u.nom)}</strong> ${interimBadge(u)}</td>${Echeances.HABILITATIONS.map(([cle]) => cellule(u, cle)).join('')}</tr>`).join('')}</table></div>
  <p class="small"><span class="hab-leg ok"></span> valide <span class="hab-leg bientot"></span> à renouveler <span class="hab-leg expire"></span> expirée</p>`;
}

function editerHabilitation(uid, cle) {
  const h = habDe(uid, cle) || {}, mois = (Echeances.HABILITATIONS.find(x => x[0] === cle) || [])[2] || 24;
  const peut = Store.can('write', 'habilitations');
  let fichier = h.fichierId || '';
  const box = Modal.open(`<h2 style="margin-top:0">${esc(Echeances.libelleHab(cle))}</h2><p class="muted">${esc(userName(uid))}</p>
    <div class="grid2">
      <div class="field"><label for="hb-niv">${cle === 'visite' ? 'Type de suivi / avis' : 'Niveau, catégorie, procédé'}</label><input id="hb-niv" value="${esc(h.niveau || '')}" placeholder="${cle === 'visite' ? 'Ex. VIP, SIR, apte' : cle === 'elec' ? 'Ex. B1V, BR, H0V' : cle === 'qmos' ? 'Ex. 141 + 111, P235GH, Ø > 25' : cle === 'fluides' ? 'Ex. catégorie I' : ''}"></div>
      <div class="field"><label for="hb-num">N° du titre / organisme</label><input id="hb-num" value="${esc(h.numero || '')}"></div>
      <div class="field"><label for="hb-obt">${cle === 'visite' ? 'Date de la visite' : 'Date d\'obtention'}</label><input id="hb-obt" type="date" value="${esc(h.obtenue || '')}"></div>
      <div class="field"><label for="hb-exp">${cle === 'visite' ? 'Prochaine visite' : 'Valable jusqu\'au'}</label><input id="hb-exp" type="date" value="${esc(h.expire || '')}"><span class="small muted">Vide : calculée (${mois} mois)</span></div>
    </div>
    <div class="field"><label>Justificatif (photo ou PDF)</label><div id="hb-f">${fichier ? `<a href="${fileUrl(fichier)}" target="_blank" rel="noopener">📎 Voir le justificatif</a>` : '<span class="muted small">aucun</span>'}</div>
      ${peut ? '<input id="hb-file" type="file" accept="image/*,application/pdf">' : ''}</div>
    <div class="modal-actions">${peut && h.id ? '<button class="danger" id="hb-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="hb-x">Fermer</button>${peut ? '<button id="hb-ok">Enregistrer</button>' : ''}</div>`);
  const $ = s => box.querySelector(s);
  $('#hb-x').onclick = Modal.close;
  if (!peut) return;
  $('#hb-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const dataUrl = /pdf/.test(f.type) ? await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); }) : await compressImage(f, 1600, 0.8);
      fichier = (await api('POST', '/api/files', { dataUrl })).id;
      $('#hb-f').innerHTML = `<a href="${fileUrl(fichier)}" target="_blank" rel="noopener">📎 Justificatif ajouté</a>`;
    } catch (err) { notify('Envoi impossible : ' + err.message); }
  };
  if ($('#hb-del')) $('#hb-del').onclick = async () => { if (await ask('Supprimer cette habilitation ?', 'Supprimer')) { Store.remove('habilitations', h.id); Modal.close(); App.render(); } };
  $('#hb-ok').onclick = () => {
    const obtenue = $('#hb-obt').value, expire = $('#hb-exp').value || Echeances.ajouterMois(obtenue, mois);
    if (!obtenue && !expire) return notify('Indiquez au moins une date.');
    Store.upsert('habilitations', { ...(h.id ? h : {}), userId: uid, cle, niveau: $('#hb-niv').value.trim(), numero: $('#hb-num').value.trim(), obtenue, expire, fichierId: fichier });
    Modal.close(); App.render();
  };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-hab]');
  if (!b) return;
  const [uid, cle] = b.dataset.hab.split('|');
  editerHabilitation(uid, cle);
});

// Côté compagnon : ses propres habilitations (onglet Chantiers de l'appli)
function mesHabilitations(u) {
  const auj = isoDate(new Date()), l = Echeances.HABILITATIONS.map(([cle]) => habDe(u.id, cle)).filter(Boolean);
  if (!l.length) return '';
  return `<h2>Mes habilitations</h2><div class="card"><ul class="punch-list">${l.map(h => { const e = Echeances.etat(h.expire, auj);
    return `<li><div><strong>${esc(Echeances.libelleHab(h.cle))}</strong>${h.niveau ? ` <span class="muted small">${esc(h.niveau)}</span>` : ''}</div>
      <div class="num"><span class="badge ${e.etat === 'expire' ? 'b-bad' : e.etat === 'bientot' ? 'b-warn' : 'b-ok'}">${h.expire ? (e.etat === 'expire' ? 'expirée' : `jusqu'au ${dateFr(h.expire)}`) : 'sans date'}</span></div></li>`; }).join('')}</ul></div>`;
}
// Avertissement dans la fenêtre d'affectation du planning
function alertesHabPlanning(uid) {
  const a = Echeances.alertesPersonne(Echeances.HABILITATIONS.map(([cle]) => habDe(uid, cle)).filter(Boolean), isoDate(new Date()));
  return a.length ? `<p class="note warn-note small">${a.map(x => `${x.etat === 'expire' ? '⛔' : '⚠'} ${esc(x.libelle)} : ${esc(Echeances.texte(x))}`).join('<br>')}</p>` : '';
}
