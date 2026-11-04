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
  const habs = Store.all('habilitations'), alertesPdp = Autorisations.alertesPlans(Store.all('entreprises'), auj);
  const autor = u => { const l = Autorisations.pourPersonne(u.id, habs, auj); if (!l.length) return '<td class="muted small">—</td>';
    const ok = l.filter(x => x.ok);
    return `<td><button class="small ${ok.length ? '' : 'secondary'}" data-autor="${u.id}" title="${esc(l.map(x => `${x.court} : ${x.ok ? `valable jusqu'au ${dateFr(x.jusqua)}` : x.motifs.join(', ')}`).join('\n'))}">📄 ${ok.map(x => x.court).join(', ') || 'à régulariser'}</button></td>`; };
  const cellule = (u, cle) => {
    const h = habDe(u.id, cle), e = h ? Echeances.etat(h.expire, auj) : { etat: 'absent' };
    return `<td class="hab-c ${e.etat}"><button class="hab-b" data-hab="${u.id}|${cle}" title="${esc(Echeances.libelleHab(cle))}${h && h.niveau ? ` · ${esc(h.niveau)}` : ''}">${h ? `${h.expire ? dateFr(h.expire) : 'sans date'}${h.niveau ? `<br><span class="small">${esc(h.niveau)}</span>` : ''}` : '<span class="muted">+</span>'}</button></td>`;
  };
  return `<h1>RH</h1>${rhTabs('habilitations')}
  <div class="cards">
    <div class="card"><div class="label">Expirées</div><div class="value ${exp.length ? 'neg' : ''}">${exp.length}</div><div class="sub">visites médicales et habilitations</div></div>
    <div class="card"><div class="label">À renouveler sous ${Echeances.SEUIL} jours</div><div class="value ${bientot.length ? 'warn-text' : ''}">${bientot.length}</div><div class="sub">prévoir la formation ou le rendez-vous</div></div>
  </div>
  <div class="toolbar"><button id="hab-recap">📄 Fiche récapitulative pour un client</button><button class="secondary" id="hab-autor-tous" title="Une autorisation par page pour chaque personne dont le CACES (ou la formation) et la visite médicale sont à jour">📄 Autorisations de conduite de toute l'équipe</button></div>
  ${alertes.length || alertesPdp.length ? `<div class="card"><strong>À traiter</strong><ul class="alertes-hab">${alertes.map(a => `<li class="${a.etat}"><button class="linklike" data-hab="${a.userId}|${a.cle}">${esc(userName(a.userId))} · ${esc(a.libelle)}</button> <span class="badge ${a.etat === 'expire' ? 'b-bad' : 'b-warn'}">${esc(Echeances.texte(a))}</span>${a.cle === 'visite' && a.id ? ` <button class="small secondary" data-rdv="${a.id}">📅 ${a.rdv ? 'Modifier le rendez-vous' : 'Rendez-vous pris'}</button>` : ''}</li>`).join('')}
    ${alertesPdp.map(a => `<li class="${a.etat === 'bientot' ? 'bientot' : 'expire'}"><button class="linklike" data-pdp-charger="${a.entrepriseId}">🛡️ ${esc(a.nom)}</button> <span class="badge ${a.etat === 'bientot' ? 'b-warn' : 'b-bad'}">${esc(a.texte)}</span></li>`).join('')}</ul></div>` : '<p class="note">Aucune habilitation, visite médicale ni plan de prévention expiré ou à renouveler.</p>'}
  <p class="muted small">Cliquez une case pour saisir ou renouveler (date d'obtention, date d'expiration, niveau, justificatif). Les compagnons concernés et le bureau sont prévenus 60 jours avant l'expiration, puis à l'expiration. Le planning signale ⚠ / ⛔ les personnes concernées.</p>
  <div class="table-wrap"><table class="hab-table"><tr><th>Personne</th>${Echeances.HABILITATIONS.map(([cle, lib]) => `<th title="${esc(lib)}">${esc(Echeances.COURT[cle])}</th>`).join('')}<th title="Autorisations délivrées par l'employeur (nacelle, chariot, pont, harnais) : PDF en un clic">Autorisations</th></tr>
    ${gens.map(u => `<tr><td><strong>${esc(u.nom)}</strong> ${interimBadge(u)}</td>${Echeances.HABILITATIONS.map(([cle]) => cellule(u, cle)).join('')}${autor(u)}</tr>`).join('')}</table></div>
  <p class="small"><span class="hab-leg ok"></span> valide <span class="hab-leg bientot"></span> à renouveler <span class="hab-leg expire"></span> expirée</p>
  ${plansAnnuelsHtml(auj)}`;
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
      ${cle === 'visite' ? `<div class="field"><label for="hb-rdv">Rendez-vous pris le</label><input id="hb-rdv" type="date" value="${esc(h.rdv || '')}"><span class="small muted">Arrête l'alerte « prendre rendez-vous »</span></div>` : ''}
    </div>
    ${Autorisations.type(cle) && h.id ? (() => { const c = Autorisations.conditions(uid, cle, Store.all('habilitations'), isoDate(new Date()));
      return `<div class="note ${c.ok ? '' : 'warn-note'} small">${c.ok ? `Autorisation possible jusqu'au ${dateFr(c.jusqua)} (fin du titre ou de la visite médicale).` : `Autorisation impossible : ${esc(c.motifs.join(', '))}.`}
        ${h.autorisationId ? ` <a href="${fileUrl(h.autorisationId)}" target="_blank" rel="noopener">📎 Dernière autorisation (${dateFr(h.autorisationLe)})</a>` : ''}
        ${c.ok && peut ? ` <button class="small" id="hb-autor">📄 Générer l'autorisation</button>` : ''}</div>`; })() : ''}
    <div class="field"><label>Justificatif (photo ou PDF)</label><div id="hb-f">${fichier ? `<a href="${fileUrl(fichier)}" target="_blank" rel="noopener">📎 Voir le justificatif</a>` : '<span class="muted small">aucun</span>'}</div>
      ${peut ? '<input id="hb-file" type="file" accept="image/*,application/pdf">' : ''}</div>
    <div class="modal-actions">${peut && h.id ? '<button class="danger" id="hb-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="hb-x">Fermer</button>${peut ? '<button id="hb-ok">Enregistrer</button>' : ''}</div>`);
  const $ = s => box.querySelector(s);
  $('#hb-x').onclick = Modal.close;
  if (!peut) return;
  if ($('#hb-autor')) $('#hb-autor').onclick = () => { Modal.close(); genererAutorisations([uid], [cle]); };
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
    // Nouvelle visite enregistrée (date changée) : le rendez-vous est passé
    const rdv = $('#hb-rdv') ? $('#hb-rdv').value : h.rdv || '', nouvelle = cle === 'visite' && h.id && obtenue && obtenue !== h.obtenue;
    Store.upsert('habilitations', { ...(h.id ? h : {}), userId: uid, cle, niveau: $('#hb-niv').value.trim(), numero: $('#hb-num').value.trim(), obtenue, expire, fichierId: fichier, ...(cle === 'visite' ? { rdv: nouvelle && rdv && rdv <= obtenue ? '' : rdv } : {}) });
    Modal.close(); App.render();
  };
}
document.addEventListener('click', e => {
  const t = e.target, b = t.closest('[data-hab]');
  if (b) { const [uid, cle] = b.dataset.hab.split('|'); editerHabilitation(uid, cle); return; }
  const x = t.closest('[data-autor]'); if (x) return genererAutorisations([x.dataset.autor]);
  const r = t.closest('[data-rdv]'); if (r) return saisirRdv(r.dataset.rdv);
  const pc = t.closest('[data-pdp-charger]'); if (pc) { const en = Store.get('entreprises', pc.dataset.pdpCharger); if (en) editerPlanPrevention(en, null); return; }
  const pm = t.closest('[data-pdp-modif]'); if (pm) { const [eid, pid] = pm.dataset.pdpModif.split('|'); const en = Store.get('entreprises', eid); if (en) editerPlanPrevention(en, pid); return; }
  const pr = t.closest('[data-pdp-retirer]'); if (pr) { const en = Store.get('entreprises', pr.dataset.pdpRetirer); if (en) { Store.upsert('entreprises', { ...en, pdpAnnuel: false }); App.render(); } return; }
  if (t.closest('#hab-recap')) return ficheRecapHabilitations({});
  const fh = t.closest('[data-fiche-hab]'); if (fh) return ficheRecapHabilitations({ affaireId: fh.dataset.ficheHab });
  const ae = t.closest('[data-autor-equipe]'); if (ae) return genererAutorisations(ae.dataset.autorEquipe.split(',').filter(Boolean));
  if (t.closest('#hab-autor-tous')) return genererAutorisations(personnesRH().map(u => u.id));
});
document.addEventListener('change', e => {
  if (e.target.id !== 'pdp-suivre' || !e.target.value) return;
  const en = Store.get('entreprises', e.target.value); if (!en) return;
  Store.upsert('entreprises', { ...en, pdpAnnuel: true }); App.render();
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

/* ---------- Visite médicale : rendez-vous pris ---------- */
function saisirRdv(hid) {
  const h = Store.get('habilitations', hid); if (!h) return;
  const box = Modal.open(`<h2 style="margin-top:0">Visite médicale – ${esc(userName(h.userId))}</h2>
    <p class="muted small">Échéance : ${h.expire ? dateFr(h.expire) : '—'}. Une fois la visite passée, chargez l'attestation (fiche d'aptitude) et la date de la visite dans la case « Visite méd. ».</p>
    <div class="field"><label for="rv-d">Rendez-vous pris le</label><input id="rv-d" type="date" value="${esc(h.rdv || '')}"></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rv-x">Annuler</button><button id="rv-ok">Enregistrer</button></div>`);
  box.querySelector('#rv-x').onclick = Modal.close;
  box.querySelector('#rv-ok').onclick = () => { Store.upsert('habilitations', { ...h, rdv: box.querySelector('#rv-d').value }); Modal.close(); App.render(); };
}

/* ---------- Autorisations de conduite / de travail en hauteur (PDF, une par page) ---------- */
const qualifDe = u => (Store.get('mainoeuvre', u.categorieId) || {}).libelle || (u.type === 'interimaire' ? 'Intérimaire' : '');
function autorisationHtml(u, t, c) {
  const st = Store.data.settings, h = c.hab, v = c.visite, auj = isoDate(new Date());
  const l = (k, x) => (x ? `<tr><th style="width:38%">${esc(k)}</th><td>${x}</td></tr>` : '');
  return `${Doc.entete('facture', t.titre, `Délivrée le ${dateFr(auj)}`)}
    <h3 class="doc-h">${esc(t.objet)}</h3>
    <p>Je soussigné(e), représentant de l'entreprise <strong>${esc(st.societe || '')}</strong>, autorise :</p>
    <table class="doc-table"><tbody>
      ${l('Nom', `<strong>${esc(u.nom)}</strong>`)}${l('Qualification', esc(qualifDe(u)))}
      ${l(t.cle === 'hauteur' ? 'Travaux autorisés' : 'Équipements', esc(t.objet))}
      ${l(t.cle === 'hauteur' ? 'Équipements de protection' : 'Catégories autorisées', esc((h && h.niveau) || t.categories))}
      ${l('Formation / titre', `${esc(t.formation)}${h && h.numero ? ` – n° ${esc(h.numero)}` : ''}${h && h.obtenue ? ` – obtenu le ${dateFr(h.obtenue)}` : ''}${h && h.expire ? `, valable jusqu'au ${dateFr(h.expire)}` : ''}`)}
      ${l('Aptitude médicale', v ? `${esc(v.niveau || 'Apte')} – visite du ${v.obtenue ? dateFr(v.obtenue) : '—'}, prochaine avant le ${v.expire ? dateFr(v.expire) : '—'}` : '')}
      ${l('Validité de l\'autorisation', `<strong>jusqu'au ${dateFr(c.jusqua)}</strong> (échéance la plus proche du titre et de la visite médicale), sauf retrait`)}
    </tbody></table>
    <p class="small">${t.cle === 'hauteur'
      ? 'à réaliser des travaux en hauteur avec port du harnais antichute, après vérification du point d\'ancrage et de l\'état de l\'équipement avant chaque utilisation, dans le respect des consignes du chantier et du plan de prévention ou du PPSPS.'
      : 'à conduire les équipements désignés ci-dessus sur les chantiers et sites de l\'entreprise et de ses clients, après accueil sécurité et prise de connaissance des lieux, des consignes et des instructions propres à chaque site (vérification de l\'équipement avant utilisation, balisage, conditions météo).'}</p>
    <p class="small muted">Conditions de délivrance réunies : aptitude médicale, formation / contrôle des connaissances et du savoir-faire en cours de validité, connaissance des lieux et des instructions à respecter. Références : ${esc(t.textes)}. L'autorisation est retirée en cas d'inaptitude ou de comportement dangereux.</p>
    <div class="signatures"><div>Pour ${esc(st.societe || 'l\'entreprise')}<br>Nom, fonction, date et signature :</div><div>Le salarié, ${esc(u.nom)}<br>Lu et approuvé, date et signature :</div></div>`;
}
// Personnes × types : une page par autorisation possible ; les autorisations impossibles sont signalées
async function genererAutorisations(uids, cles) {
  const auj = isoDate(new Date()), habs = Store.all('habilitations'), ok = [], ko = [];
  uids.forEach(id => { const u = Store.get('users', id); if (!u) return;
    Autorisations.pourPersonne(id, habs, auj).filter(x => !cles || cles.includes(x.cle)).forEach(x => (x.ok ? ok : ko).push({ u, x })); });
  if (!ok.length) return notify(ko.length ? `Aucune autorisation possible :\n${ko.map(k => `${k.u.nom} – ${k.x.court} : ${k.x.motifs.join(', ')}`).join('\n')}` : 'Aucune habilitation nacelle, chariot, pont roulant ou travail en hauteur enregistrée.');
  if (ko.length && !(await ask(`${ok.length} autorisation(s) prête(s). À régulariser d'abord :\n${ko.map(k => `• ${k.u.nom} – ${k.x.court} : ${k.x.motifs.join(', ')}`).join('\n')}\n\nGénérer les autorisations possibles ?`, 'Générer', false))) return;
  try {
    App.toast('Génération des autorisations…');
    const html = ok.map(({ u, x }, i) => `${i ? '<div class="pdf-saut"></div>' : ''}${autorisationHtml(u, Autorisations.type(x.cle), x)}`).join('');
    const nom = nomFichier(`Autorisations ${uids.length === 1 ? ok[0].u.nom : 'equipe'} ${auj}`);
    const bytes = await PDF.depuisHTML(html, nom.replace(/\.pdf$/i, ''));
    // Copie gardée sur chaque habilitation (lien « Dernière autorisation »)
    if (Store.can('write', 'habilitations')) {
      const dataUrl = await new Promise((r, k) => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = k; f.readAsDataURL(new Blob([bytes], { type: 'application/pdf' })); });
      const fid = (await api('POST', '/api/files', { dataUrl })).id;
      ok.forEach(({ x }) => Store.upsert('habilitations', { ...x.hab, autorisationId: fid, autorisationLe: auj, autorisationJusqua: x.jusqua }));
    }
    download(/\.pdf$/i.test(nom) ? nom : `${nom}.pdf`, bytes, 'application/pdf');
    App.render(); App.toast(`${ok.length} autorisation(s) générée(s) : à signer par l'employeur et le salarié`, 5000);
  } catch (e) { notify('Autorisations : ' + e.message); }
}

/* ---------- Fiche récapitulative des habilitations à jour (à joindre au client) ---------- */
function ficheRecapHabilitations({ affaireId = '', clientId = '', personnes = null }) {
  const gens = personnesRH(), a = Store.get('affaires', affaireId);
  const equipe = personnes || (a && typeof contexteSecurite === 'function' ? contexteSecurite(a).controle.map(c => c.userId) : null);
  const coche = new Set(equipe && equipe.length ? equipe : gens.map(u => u.id));
  const clients = Store.all('entreprises').filter(e => !e.archive && (typeof isClient !== 'function' || isClient(e))).sort((x, y) => x.nom.localeCompare(y.nom));
  const box = Modal.open(`<h2 style="margin-top:0">Fiche récapitulative des habilitations</h2>
    <p class="muted small">Habilitations, visites médicales et autorisations en cours de validité des personnes choisies, à transmettre au client (plan de prévention, accueil sécurité).</p>
    <div class="grid2"><div class="field"><label for="fr-c">Client</label><select id="fr-c"><option value="">—</option>${clients.map(e => `<option value="${e.id}" ${e.id === (clientId || (a && a.clientId)) ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></div>
      <div class="field"><label for="fr-a">Chantier</label><select id="fr-a"><option value="">—</option>${Store.all('affaires').filter(x => !x.archive && x.statut !== 'Terminé').map(x => `<option value="${x.id}" ${x.id === affaireId ? 'selected' : ''}>${esc(affaireLabel(x))}</option>`).join('')}</select></div></div>
    <div class="field"><label>Personnes</label><div class="fr-gens">${gens.map(u => `<label class="check"><input type="checkbox" data-fr="${u.id}" ${coche.has(u.id) ? 'checked' : ''}> ${esc(u.nom)}</label>`).join('')}</div></div>
    <label class="check"><input type="checkbox" id="fr-pj" checked> Joindre les justificatifs en photo (attestations, cartes CACES, fiches d'aptitude)</label>
    <label class="check"><input type="checkbox" id="fr-doc" ${a ? 'checked' : ''}> Enregistrer dans les documents du chantier</label>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="fr-x">Annuler</button><button id="fr-ok">📄 Générer le PDF</button></div>`);
  const $ = s => box.querySelector(s);
  $('#fr-x').onclick = Modal.close;
  $('#fr-a').onchange = () => { const af = Store.get('affaires', $('#fr-a').value); if (!af) return; if (af.clientId) $('#fr-c').value = af.clientId;
    if (typeof contexteSecurite === 'function') { const ids = new Set(contexteSecurite(af).controle.map(c => c.userId)); if (ids.size) box.querySelectorAll('[data-fr]').forEach(c => { c.checked = ids.has(c.dataset.fr); }); }
    $('#fr-doc').checked = true; };
  $('#fr-ok').onclick = async () => {
    const ids = [...box.querySelectorAll('[data-fr]:checked')].map(c => c.dataset.fr);
    if (!ids.length) return notify('Choisissez au moins une personne.');
    const af = Store.get('affaires', $('#fr-a').value), cl = Store.get('entreprises', $('#fr-c').value), pj = $('#fr-pj').checked, enDoc = $('#fr-doc').checked && af;
    Modal.close();
    try {
      App.toast('Génération de la fiche…');
      const html = await recapHtml(ids.map(id => Store.get('users', id)).filter(Boolean), cl, af, pj);
      const nom = nomFichier(`Habilitations ${cl ? cl.nom : ''} ${af ? af.code || '' : ''} ${isoDate(new Date())}`.replace(/\s+/g, ' '));
      const fichier = /\.pdf$/i.test(nom) ? nom : `${nom}.pdf`, bytes = await PDF.depuisHTML(html, fichier.replace(/\.pdf$/i, ''));
      if (enDoc) {
        const r = await envoyerFichierDocument(new File([bytes], fichier, { type: 'application/pdf' }));
        af.documents = [...(af.documents || []), { id: uid(), fichierId: r.id, nom: fichier, categorie: 'Sécurité / PPSPS', indice: '', note: 'Fiche récapitulative des habilitations', mime: r.mime, taille: r.taille, date: isoDate(new Date()), par: Store.me.nom, visible: false }];
        Store.upsert('affaires', af);
      }
      download(fichier, bytes, 'application/pdf');
      App.toast(`Fiche des habilitations générée${enDoc ? ' et enregistrée dans les documents du chantier' : ''}`, 4000);
    } catch (e) { notify('Fiche des habilitations : ' + e.message); }
  };
}
// Image chargée ? (les justificatifs PDF ne s'insèrent pas : ils restent disponibles sur demande)
const imageOk = src => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); i.src = src; });
async function recapHtml(gens, client, affaire, avecPj) {
  const auj = isoDate(new Date()), habs = Store.all('habilitations'), st = Store.data.settings;
  const r = Autorisations.recap(gens, habs, auj, { cles: Echeances.HABILITATIONS.map(([c]) => c) });
  // Une ligne par intervenant : visite médicale, titres valides (libellé, niveau, échéance), autorisations de l'employeur
  const titre = h => `<strong>${esc(Echeances.COURT[h.cle] || Echeances.libelleHab(h.cle))}</strong>${h.niveau ? ` (${esc(h.niveau)})` : ''}${h.numero ? ` n° ${esc(h.numero)}` : ''} – ${h.expire ? `jusqu'au ${dateFr(h.expire)}` : 'sans échéance'}`;
  const lignes = r.lignes.map(({ u, cells }) => {
    const aut = Autorisations.pourPersonne(u.id, habs, auj).filter(x => x.ok);
    const titres = Echeances.HABILITATIONS.map(([c]) => cells[c]).filter(h => h && h.cle !== 'visite');
    return `<tr><td><strong>${esc(u.nom)}</strong>${qualifDe(u) ? `<br><span class="small">${esc(qualifDe(u))}</span>` : ''}</td>
      <td>${cells.visite ? `Apte${cells.visite.niveau && !/apte/i.test(cells.visite.niveau) ? ` (${esc(cells.visite.niveau)})` : ''}<br><span class="small">jusqu'au ${dateFr(cells.visite.expire)}</span>` : '<span class="small">non renseignée</span>'}</td>
      <td class="small">${titres.map(titre).join('<br>') || '—'}</td>
      <td class="small">${aut.map(x => `${esc(x.court)} – jusqu'au ${dateFr(x.jusqua)}`).join('<br>') || '—'}</td></tr>`;
  }).join('');
  let annexe = '';
  if (avecPj) {
    const pieces = [];
    for (const { u, cells } of r.lignes) for (const h of Object.values(cells)) if (h.fichierId && await imageOk(fileUrl(h.fichierId))) pieces.push({ u, h });
    if (pieces.length) annexe = `<div class="pdf-saut"></div><h3 class="doc-h">Justificatifs</h3>${pieces.map(({ u, h }) => `<p><strong>${esc(u.nom)}</strong> – ${esc(Echeances.libelleHab(h.cle))}</p><img src="${fileUrl(h.fichierId)}" alt="" style="max-width:100%;max-height:420px;object-fit:contain;display:block;margin:0 0 12px">`).join('')}`;
  }
  return `${Doc.entete('facture', 'Habilitations du personnel', `${client ? `Pour ${esc(client.nom)}<br>` : ''}${affaire ? `Chantier ${esc(affaire.code || '')} – ${esc(affaire.nom || '')}<br>` : ''}À jour au ${dateFr(auj)}`)}
    <p>Liste des intervenants de ${esc(st.societe || 'l\'entreprise')} et de leurs habilitations en cours de validité à la date du document (visite médicale, titres, CACES et autorisations délivrées par l'employeur).</p>
    <table class="doc-table"><thead><tr><th style="width:22%">Intervenant</th><th style="width:16%">Visite médicale</th><th>Habilitations et titres valides</th><th style="width:22%">Autorisations de l'employeur</th></tr></thead><tbody>${lignes}</tbody></table>
    <p class="small muted">Seules les habilitations valables à la date du document figurent. Justificatifs ${avecPj ? 'en photo en annexe ; ceux au format PDF sont ' : ''}disponibles sur demande. ${r.cles.filter(c => c !== 'visite').map(c => `${Echeances.COURT[c] || c} : ${Echeances.libelleHab(c)}`).join(' · ')}.</p>
    <div class="signatures"><div>Certifié exact par ${esc(st.societe || 'l\'entreprise')}<br>Date et signature :</div><div></div></div>${annexe}`;
}

/* ---------- Plans de prévention annuels des clients suivis ---------- */
function plansAnnuelsHtml(auj) {
  const suivis = Store.all('entreprises').filter(Autorisations.clientSuivi).sort((a, b) => a.nom.localeCompare(b.nom));
  const autres = Store.all('entreprises').filter(e => !e.archive && !Autorisations.clientSuivi(e) && (typeof isClient !== 'function' || isClient(e))).sort((a, b) => a.nom.localeCompare(b.nom));
  const lib = { valide: ['b-ok', 'valide'], bientot: ['b-warn', 'à renouveler'], echu: ['b-bad', 'échu'], absent: ['b-bad', 'à charger'] };
  const an = new Date().getFullYear(), edit = Store.can('write', 'entreprises');
  return `<h2>🛡️ Plans de prévention annuels des clients</h2>
  <p class="muted small" style="margin-top:-6px">Chez les gros clients, le plan de prévention est signé chaque année : chargez-le ici. Il est repris sur chaque chantier du client (onglet Sécurité, appli des compagnons), et une alerte prévient 45 jours avant son échéance.</p>
  ${suivis.length ? `<div class="table-wrap"><table><tr><th>Client</th><th>Plan en cours</th><th>Validité</th><th></th></tr>${suivis.map(e => { const x = Autorisations.etatPlanAnnuel(e, auj), p = x.plan, b = lib[x.etat];
    return `<tr><td><a href="#/entreprise/${e.id}">${esc(e.nom)}</a></td><td>${p ? `<a href="${lienDocument({ fichierId: p.fichierId, nom: p.nom })}" target="_blank" rel="noopener">🛡️ ${esc(p.nom)}</a>` : '<span class="muted">aucun</span>'}</td>
      <td>${p ? `${p.debut ? dateFr(p.debut) : ''} → ${p.fin ? dateFr(p.fin) : ''} ` : ''}<span class="badge ${b[0]}">${b[1]}</span></td>
      <td class="actions">${edit ? `<button class="small ${x.etat === 'valide' ? 'secondary' : ''}" data-pdp-charger="${e.id}">📤 Charger le plan ${x.etat === 'valide' && p && p.fin && p.fin.slice(0, 4) > String(an) ? an + 1 : an}</button>${p ? ` <button class="small secondary" data-pdp-modif="${e.id}|${p.id}">Modifier</button>` : ''} <button class="icon small" data-pdp-retirer="${e.id}" title="Ne plus suivre ce client" aria-label="Ne plus suivre">✕</button>` : ''}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">Aucun client suivi.</p>'}
  ${edit ? `<div class="toolbar"><select id="pdp-suivre" style="width:auto"><option value="">+ Suivre le plan annuel d'un client…</option>${autres.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join('')}</select></div>` : ''}`;
}
