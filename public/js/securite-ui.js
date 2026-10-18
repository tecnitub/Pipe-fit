// Chantier → onglet Sécurité : PGC du coordonnateur SPS, plan de prévention (annuel du client ou spécifique au chantier),
// rédaction du PPSPS d'après les contraintes du chantier (risques, secours, intervenants et habilitations, matériel,
// produits et FDS) et génération du PDF enregistré dans les documents du chantier.
// Client → plans de prévention annuels. Appli des compagnons → fiche sécurité du chantier.
const EPI_BASE = 'Casque, chaussures de sécurité, gants, lunettes de protection, vêtements de travail, gilet haute visibilité';
const BASE_VIE = 'Installations du client mises à disposition (vestiaires, sanitaires, réfectoire) selon le plan de prévention ou le PGC. Eau potable sur site. Repas pris hors des zones de travail.';
const CONSIGNES_ALERTE = 'Protéger la victime et la zone, alerter le sauveteur secouriste (SST) le plus proche et le poste de garde du site, puis appeler le 15 (ou le 112) en précisant l\'adresse, le bâtiment et l\'accès. Envoyer une personne guider les secours. Prévenir le chargé d\'affaires.';
const docsSecurite = (a, cat) => (a.documents || []).filter(d => d.categorie === cat).sort((x, y) => (y.date || '').localeCompare(x.date || ''));

// Date d'une ligne de planning : le jour, ou le lundi de la semaine pour une affectation à la semaine (« 2026-W43 »)
function datePlanning(p) {
  if (p.date) return p.date;
  const m = /^(\d{4})-W(\d{2})$/.exec(p.semaine || '');
  if (!m) return '';
  const j4 = new Date(Date.UTC(+m[1], 0, 4)), d = new Date(j4);
  d.setUTCDate(j4.getUTCDate() - ((j4.getUTCDay() || 7) - 1) + (+m[2] - 1) * 7);
  return d.toISOString().slice(0, 10);
}
// Contexte calculé du chantier : intervenants planifiés, dates, matériel, produits, SST
function contexteSecurite(a) {
  const s = a.securite || {}, plan = Store.all('planning').filter(p => p.affaireId === a.id).map(p => ({ ...p, date: datePlanning(p) })).filter(p => p.date).sort((x, y) => x.date.localeCompare(y.date));
  // Intervenants : l'équipe planifiée à partir d'aujourd'hui (à défaut, toutes les personnes déjà planifiées)
  const recents = plan.filter(p => p.date >= isoDate(addDays(new Date(), -7)));
  const ids = [...new Set((recents.length ? recents : plan).map(p => p.userId))].filter(id => Store.get('users', id));
  const debut = s.debut || (plan[0] || {}).date || '', fin = s.fin || (plan[plan.length - 1] || {}).date || '', date = debut && debut > isoDate(new Date()) ? debut : isoDate(new Date());
  const risques = Object.keys(s.risques || {});
  const controle = Securite.controleIntervenants(ids, Store.all('habilitations'), risques, date);
  const materiel = Store.all('materiels').filter(m => !m.archive && m.affectation && (m.affectation.affaireId === a.id || ids.includes(m.affectation.userId)));
  const produits = Securite.produitsDesPersonnes(ids, Store.all('materiels')).map(id => Store.get('produits', id)).filter(p => p && !p.archive);
  const sst = controle.filter(c => c.sst).map(c => userName(c.userId));
  const client = entreprise(a.clientId), planAnnuel = Securite.planApplicable(client.plansPrevention, a.siteId, date);
  return { s, ids, debut, fin, date, risques, controle, materiel, produits, sst, client, planAnnuel };
}
const libHabs = cles => cles.map(c => Echeances.COURT[c] || Echeances.libelleHab(c)).join(', ');

function securiteChantier(a) {
  const c = contexteSecurite(a), s = c.s, edit = Store.can('write', 'affaires'), dis = edit ? '' : 'disabled';
  const site = siteOf(a.clientId, a.siteId), pgc = docsSecurite(a, 'PGC'), pdp = docsSecurite(a, 'Plan de prévention'), ppsps = docsSecurite(a, 'Sécurité / PPSPS');
  const pb = c.controle.filter(x => x.manque.length || x.expirees.length || x.visite !== 'ok');
  const urg = s.urgences || {}, peut = edit ? '' : 'hidden';
  const v = (k, def = '') => esc(s[k] !== undefined ? s[k] : def);
  const depot = (cat, label) => `<label class="btn secondary small" ${peut}>${label}<input type="file" data-depot="${esc(cat)}" accept=".pdf,.doc,.docx,image/*" hidden></label>`;
  const liste = docs => docs.map(d => `<li><a href="${lienDocument(d)}" target="_blank" rel="noopener">${iconeDoc(d.categorie)} ${esc(d.nom)}</a>${d.indice ? ` <span class="badge">ind. ${esc(d.indice)}</span>` : ''} <span class="muted small">${dateFr(d.date)}${d.visible ? ' · transmis' : ' · bureau'}</span></li>`).join('');
  const etatPlan = p => { const e = Securite.etatPlan(p, c.date); return `<span class="badge ${e === 'echu' ? 'b-bad' : e === 'bientot' ? 'b-warn' : e === 'futur' ? 'b-info' : 'b-ok'}">${e === 'echu' ? 'échu' : e === 'bientot' ? 'à renouveler' : e === 'futur' ? 'à venir' : 'valide'}${p.fin ? ` jusqu'au ${dateFr(p.fin)}` : ''}</span>`; };
  return `<div class="toolbar"><a href="#/chantiers" class="btn secondary">← Chantiers</a></div>
  <h1>${esc(affaireLabel(a))} ${badge(a.statut)}</h1>${chantierOnglets(a, 'securite')}
  <p class="muted">Joignez le PGC du coordonnateur SPS et le plan de prévention, puis rédigez le PPSPS d'après les contraintes du chantier : le PDF est enregistré dans les documents du chantier et transmis aux compagnons, qui retrouvent aussi les numéros d'urgence, les consignes et les FDS des produits de leur véhicule.</p>
  <div class="secu-docs">
    <div class="card"><strong>🦺 PGC</strong> <span class="muted small">plan général de coordination (coordonnateur SPS)</span>
      ${pgc.length ? `<ul class="secu-liste">${liste(pgc)}</ul>` : '<p class="muted small">Aucun PGC joint (opération sans coordination SPS : sans objet).</p>'}${depot('PGC', '📤 Joindre le PGC')}</div>
    <div class="card"><strong>🛡️ Plan de prévention</strong> <span class="muted small">intervention sur le site d'un client exploitant</span>
      ${c.planAnnuel ? `<p class="small" style="margin:6px 0">Plan annuel du client : <a href="${lienDocument({ fichierId: c.planAnnuel.fichierId, nom: c.planAnnuel.nom })}" target="_blank" rel="noopener">${esc(c.planAnnuel.nom)}</a> ${etatPlan(c.planAnnuel)}</p>`
        : `<p class="small warn-text" style="margin:6px 0">Aucun plan de prévention annuel valide chez ${esc(c.client.nom || 'le client')}${site ? ` pour ${esc(site.libelle)}` : ''}. <a href="#/entreprise/${esc(a.clientId || '')}">Ajouter le plan annuel du client</a></p>`}
      ${pdp.length ? `<ul class="secu-liste">${liste(pdp)}</ul>` : ''}${depot('Plan de prévention', '📤 Plan spécifique au chantier')}
      <p class="muted small" style="margin-bottom:0">Écrit obligatoire au-delà de 400 h de travaux sur 12 mois ou pour les travaux dangereux (arrêté du 19 mars 1993 : points chauds, hauteur, espaces confinés…).</p></div>
    <div class="card"><strong>⛑️ PPSPS</strong> <span class="muted small">plan particulier de sécurité et de protection de la santé</span>
      ${ppsps.length ? `<ul class="secu-liste">${liste(ppsps)}</ul>` : '<p class="muted small">Pas encore généré.</p>'}
      ${edit ? '<div class="toolbar" style="margin:0"><button id="sc-gen">📄 Générer le PPSPS (PDF)</button><button class="secondary small" id="sc-apercu">Aperçu</button></div><label class="check small"><input type="checkbox" id="sc-vis" checked> Transmettre aux compagnons</label>' : ''}</div>
  </div>

  <h2>Rédaction du PPSPS</h2>
  <div class="card secu-form">
    <h3>1. Renseignements généraux</h3>
    <div class="grid2">
      <div class="field"><label for="sc-nat">Nature des travaux</label><input id="sc-nat" data-s="nature" value="${v('nature', a.nom || '')}" ${dis}></div>
      <div class="field"><label for="sc-resp">Responsable des travaux sur le site</label><select id="sc-resp" data-s="responsableId" ${dis}>${options(Store.all('users').filter(u => !u.archive), s.responsableId || a.chargeId)}</select></div>
      <div class="field"><label for="sc-cn">Coordonnateur SPS (nom, société)</label><input id="sc-cn" data-s="coordonnateur" value="${v('coordonnateur')}" ${dis} placeholder="Sans objet si pas de coordination"></div>
      <div class="field"><label for="sc-ct">Téléphone du coordonnateur</label><input id="sc-ct" data-s="coordTel" type="tel" value="${v('coordTel')}" ${dis}></div>
      <div class="field"><label for="sc-db">Début des travaux</label><input id="sc-db" type="date" data-s="debut" value="${esc(s.debut || '')}" ${dis}>${!s.debut && c.debut ? `<span class="small muted">planning : ${dateFr(c.debut)}</span>` : ''}</div>
      <div class="field"><label for="sc-fn">Fin prévue</label><input id="sc-fn" type="date" data-s="fin" value="${esc(s.fin || '')}" ${dis}>${!s.fin && c.fin ? `<span class="small muted">planning : ${dateFr(c.fin)}</span>` : ''}</div>
      <div class="field"><label for="sc-ef">Effectif prévisionnel</label><input id="sc-ef" type="number" min="0" data-s="effectif" value="${esc(s.effectif ?? '')}" placeholder="${c.ids.length}" ${dis}></div>
      <div class="field"><label for="sc-hr">Horaires de travail</label><input id="sc-hr" data-s="horaires" value="${v('horaires', '7 h 30 – 12 h · 13 h – 16 h 30, du lundi au vendredi')}" ${dis}></div>
    </div>
    <div class="field"><label for="sc-st">Sous-traitants, intérimaires (entreprise, travaux)</label><input id="sc-st" data-s="soustraitants" value="${v('soustraitants')}" ${dis}></div>

    <h3>2. Contraintes du PGC et du site</h3>
    <div class="field"><label for="sc-cr">Contraintes, consignes du site, zones interdites, permis exigés…</label><textarea id="sc-cr" data-s="contraintes" rows="4" ${dis} placeholder="Recopiez les exigences du PGC ou du plan de prévention : accueil sécurité, permis de feu, travaux en hauteur, coactivité, consignation des réseaux…">${v('contraintes')}</textarea></div>
    ${edit ? '<button class="secondary small" id="sc-detect">🔎 Proposer les risques d\'après les contraintes et le chantier</button>' : ''}

    <h3>3. Analyse des risques et mesures de prévention</h3>
    <div class="secu-risques">${Securite.RISQUES.map(([k, l, , , habs]) => { const r = (s.risques || {})[k]; return `<div class="secu-risque ${r ? 'on' : ''}">
      <label class="check"><input type="checkbox" data-rq="${k}" ${r ? 'checked' : ''} ${dis}> <strong>${esc(l)}</strong>${habs.length ? ` <span class="muted small">(${esc(libHabs(habs))})</span>` : ''}</label>
      ${r ? `<textarea data-rqm="${k}" rows="3" aria-label="Mesures : ${esc(l)}" ${dis}>${esc(r.mesures || '')}</textarea><input data-rqe="${k}" value="${esc(r.epi || '')}" placeholder="EPI spécifiques" aria-label="EPI : ${esc(l)}" ${dis}>` : ''}</div>`; }).join('')}</div>
    <div class="field"><label for="sc-epi">EPI obligatoires en permanence</label><input id="sc-epi" data-s="epiBase" value="${v('epiBase', EPI_BASE)}" ${dis}></div>

    <h3>4. Organisation des secours</h3>
    <div class="grid2">${Securite.URGENCES.map(([k, l, def]) => `<div class="field"><label for="sc-u-${k}">${esc(l)}</label><input id="sc-u-${k}" type="tel" data-urg="${k}" value="${esc(urg[k] !== undefined ? urg[k] : def)}" ${dis}></div>`).join('')}
      <div class="field"><label for="sc-hop">Hôpital le plus proche (nom, adresse)</label><input id="sc-hop" data-s="hopital" value="${v('hopital')}" ${dis}></div>
      <div class="field"><label for="sc-ras">Point de rassemblement</label><input id="sc-ras" data-s="rassemblement" value="${v('rassemblement')}" ${dis}></div>
      <div class="field"><label for="sc-ss">Sauveteurs secouristes (SST) sur le chantier</label><input id="sc-ss" data-s="sst" value="${v('sst', c.sst.join(', '))}" ${dis} placeholder="Aucun SST planifié">${c.sst.length ? '' : '<span class="small warn-text">Aucun intervenant planifié n\'a de SST valide.</span>'}</div>
      <div class="field"><label for="sc-tr">Trousse de secours, extincteur</label><input id="sc-tr" data-s="trousse" value="${v('trousse', 'Trousse de secours et extincteur dans chaque véhicule')}" ${dis}></div></div>
    <div class="field"><label for="sc-al">Consignes d'alerte</label><textarea id="sc-al" data-s="alerte" rows="2" ${dis}>${v('alerte', CONSIGNES_ALERTE)}</textarea></div>

    <h3>5. Hygiène et conditions de travail</h3>
    <div class="field"><label for="sc-bv">Base vie, vestiaires, sanitaires, repas</label><textarea id="sc-bv" data-s="baseVie" rows="2" ${dis}>${v('baseVie', BASE_VIE)}</textarea></div>

    <h3>6. Intervenants et habilitations</h3>
    ${c.ids.length ? `<div class="table-wrap"><table><tr><th>Intervenant</th><th>Habilitations valides</th><th>Visite médicale</th><th>À régler pour les risques retenus</th></tr>
      ${c.controle.map(x => { const h = Store.all('habilitations').filter(y => y.userId === x.userId && (!y.expire || y.expire >= c.date) && y.cle !== 'visite').map(y => y.cle);
        return `<tr><td><strong>${esc(userName(x.userId))}</strong>${(Store.get('users', x.userId) || {}).type === 'interimaire' ? ' <span class="badge">intérim</span>' : ''}</td><td class="small">${esc(libHabs(h)) || '<span class="muted">—</span>'}</td>
        <td>${x.visite === 'ok' ? '<span class="badge b-ok">à jour</span>' : `<span class="badge b-bad">${x.visite === 'absente' ? 'non renseignée' : 'expirée'}</span>`}</td>
        <td class="small">${x.manque.length ? `<span class="neg">manque : ${esc(libHabs(x.manque))}</span>` : ''}${x.expirees.length ? `${x.manque.length ? '<br>' : ''}<span class="neg">expirée : ${esc(libHabs(x.expirees))}</span>` : ''}${!x.manque.length && !x.expirees.length ? '<span class="pos">✓</span>' : ''}</td></tr>`; }).join('')}</table></div>
      ${pb.length ? `<p class="small warn-text">${pb.length} intervenant(s) à régulariser avant le début des travaux (RH → Habilitations).</p>` : ''}`
      : '<p class="muted small">Personne n\'est encore planifié sur ce chantier : planifiez l\'équipe pour contrôler les habilitations.</p>'}

    <h3>7. Matériel et contrôles</h3>
    ${c.materiel.length ? `<ul class="secu-liste">${c.materiel.map(m => `<li>${esc(m.designation)} <span class="muted small">${esc(m.categorie)}</span> · ${badgeEcheance(prochaineEcheance(m), c.date)}</li>`).join('')}</ul>` : '<p class="muted small">Aucun matériel du parc affecté au chantier ou à l\'équipe.</p>'}

    <h3>8. Produits dangereux et FDS</h3>
    ${c.produits.length ? `<ul class="secu-liste">${c.produits.map(p => `<li>${pictosHtml(p.pictos)} ${esc(p.nom)} ${p.fdsFichierId ? `<a href="${lienFds(p)}" target="_blank" rel="noopener">FDS</a>` : '<span class="badge b-bad">FDS manquante</span>'}</li>`).join('')}</ul>` : '<p class="muted small">Aucun produit enregistré dans les véhicules de l\'équipe (Parc → Produits et FDS).</p>'}
  </div>`;
}

function bindSecuriteChantier(root, a) {
  const s = () => (a.securite = a.securite || {});
  const enreg = (render) => { Store.upsert('affaires', a); if (render) App.render(); };
  root.querySelectorAll('[data-s]').forEach(el => el.onchange = () => { s()[el.dataset.s] = el.type === 'number' ? (el.value === '' ? '' : num(el.value)) : el.value; enreg(['debut', 'fin'].includes(el.dataset.s)); });
  root.querySelectorAll('[data-urg]').forEach(el => el.onchange = () => { s().urgences = { ...(s().urgences || {}), [el.dataset.urg]: el.value }; enreg(); });
  root.querySelectorAll('[data-rq]').forEach(el => el.onchange = () => {
    const k = el.dataset.rq, r = Securite.risque(k), rq = { ...(s().risques || {}) };
    if (el.checked) rq[k] = { mesures: r[2], epi: r[3] }; else delete rq[k];
    s().risques = rq; enreg(true);
  });
  root.querySelectorAll('[data-rqm],[data-rqe]').forEach(el => el.onchange = () => { const k = el.dataset.rqm || el.dataset.rqe; s().risques[k][el.dataset.rqm ? 'mesures' : 'epi'] = el.value; enreg(); });
  const det = root.querySelector('#sc-detect');
  if (det) det.onclick = () => {
    const devis = Store.all('devis').filter(d => d.affaireId === a.id).flatMap(d => [d.objet, ...(d.lignes || []).map(l => `${l.designation || ''} ${l.titre || ''}`)]);
    const site = siteOf(a.clientId, a.siteId);
    const cles = Securite.detecter([s().contraintes, s().nature, a.nom, a.demande, site && site.acces, entreprise(a.clientId).secteur, ...devis].join(' ')).filter(k => !(s().risques || {})[k]);
    if (!cles.length) return App.toast('Aucun risque supplémentaire détecté');
    const rq = { ...(s().risques || {}) };
    cles.forEach(k => { const r = Securite.risque(k); rq[k] = { mesures: r[2], epi: r[3] }; });
    s().risques = rq; enreg(true); App.toast(`${cles.length} risque(s) ajouté(s) : ${cles.map(k => Securite.risque(k)[1].split(/[:(]/)[0].trim()).join(', ')}`);
  };
  // Dépôt du PGC ou d'un plan de prévention spécifique
  root.querySelectorAll('[data-depot]').forEach(inp => inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const r = await envoyerFichierDocument(f);
      a.documents = [...(a.documents || []), { id: uid(), fichierId: r.id, nom: f.name, categorie: inp.dataset.depot, indice: '', note: '', mime: r.mime, taille: r.taille, date: isoDate(new Date()), par: Store.me.nom, visible: true }];
      enreg(true); App.toast(`${f.name} ajouté et transmis aux compagnons`);
    } catch (e) { notify(e.message); }
  });
  const ap = root.querySelector('#sc-apercu');
  if (ap) ap.onclick = () => { const box = Modal.open(`<div class="doc doc-apercu">${ppspsDocument(a, indicePpsps(a))}</div><div class="modal-actions"><span style="flex:1"></span><button id="sc-fermer">Fermer</button></div>`, true); box.querySelector('#sc-fermer').onclick = Modal.close; };
  const gen = root.querySelector('#sc-gen');
  if (gen) gen.onclick = () => genererPpsps(a, root.querySelector('#sc-vis').checked);
}
const ppspsGenere = a => (a.documents || []).find(d => d.categorie === 'Sécurité / PPSPS' && d.genere);
const indicePpsps = a => { const d = ppspsGenere(a); return d ? Securite.indiceSuivant(d.indice) : 'A'; };

async function genererPpsps(a, visible) {
  const c = contexteSecurite(a);
  if (!c.risques.length && !(await ask('Aucun risque n\'est retenu dans l\'analyse. Générer le PPSPS quand même ?', 'Générer', false))) return;
  const pb = c.controle.filter(x => x.manque.length || x.expirees.length || x.visite !== 'ok');
  if (pb.length && !(await ask(`${pb.map(x => userName(x.userId)).join(', ')} : habilitation ou visite médicale à régulariser. Générer le PPSPS quand même ?`, 'Générer', false))) return;
  const indice = indicePpsps(a), nom = nomFichier(`PPSPS ${a.code || a.nom}`);
  try {
    App.toast('Génération du PPSPS…');
    const bytes = await PDF.depuisHTML(ppspsDocument(a, indice), `PPSPS ${a.code || ''}`);
    const r = await envoyerFichierDocument(new File([bytes], nom, { type: 'application/pdf' }));
    const d = ppspsGenere(a), auj = isoDate(new Date());
    if (d) {
      d.anciens = [...(d.anciens || []), { fichierId: d.fichierId, indice: d.indice, date: d.date }];
      Object.assign(d, { fichierId: r.id, taille: r.taille, mime: r.mime, indice, date: auj, par: Store.me.nom, visible });
    } else a.documents = [...(a.documents || []), { id: uid(), fichierId: r.id, nom, categorie: 'Sécurité / PPSPS', indice, note: 'PPSPS rédigé dans Pipe-Fit', mime: r.mime, taille: r.taille, date: auj, par: Store.me.nom, visible, genere: true }];
    a.securite = { ...(a.securite || {}), dateEdition: auj, indice };
    if (a.securite.sst === undefined) a.securite.sst = c.sst.join(', ');
    Store.upsert('affaires', a); App.render(); App.toast(`PPSPS indice ${indice} enregistré dans les documents du chantier${visible ? ' et transmis aux compagnons' : ''}`);
  } catch (e) { notify(`PPSPS : ${e.message}`); }
}

// Document A4 du PPSPS
function ppspsDocument(a, indice) {
  const c = contexteSecurite(a), s = c.s, st = Store.data.settings, site = siteOf(a.clientId, a.siteId), urg = s.urgences || {};
  const val = (k, def = '') => (s[k] !== undefined && s[k] !== '' ? s[k] : def);
  const ligne = (l, x) => (x ? `<tr><th>${esc(l)}</th><td>${esc(x)}</td></tr>` : '');
  const pgc = docsSecurite(a, 'PGC'), pdp = docsSecurite(a, 'Plan de prévention');
  return `${Doc.entete('facture', 'PPSPS', `Plan particulier de sécurité et de protection de la santé<br>Chantier ${esc(a.code || '')} · indice ${esc(indice)} · ${dateFr(isoDate(new Date()))}`)}
    <h3 class="doc-h">1. Renseignements d'ordre général</h3>
    <table class="doc-lines compact ppsps-t">
      ${ligne('Entreprise', [st.societe, st.adresse, st.siret && `SIRET ${st.siret}`].filter(Boolean).join(' · '))}
      ${ligne('Chantier', `${a.code || ''} ${a.nom || ''}`)}${ligne('Adresse du chantier', site ? `${site.libelle} · ${fullAddress(site)}` : '')}${ligne('Accès', site && site.acces)}
      ${ligne('Maître d\'ouvrage / donneur d\'ordre', c.client.nom)}${ligne('Maître d\'œuvre', a.moeId ? entreprise(a.moeId).nom : '')}
      ${ligne('Coordonnateur SPS', [val('coordonnateur'), val('coordTel')].filter(Boolean).join(' · ') || 'Sans objet')}
      ${ligne('Nature des travaux', val('nature', a.nom))}${ligne('Responsable des travaux', userName(val('responsableId', a.chargeId)))}
      ${ligne('Période', [c.debut && `du ${dateFr(c.debut)}`, c.fin && `au ${dateFr(c.fin)}`].filter(Boolean).join(' '))}${ligne('Effectif prévisionnel', String(val('effectif', c.ids.length) || ''))}
      ${ligne('Horaires', val('horaires'))}${ligne('Sous-traitants, intérimaires', val('soustraitants'))}
      ${ligne('Documents de référence', [...pgc.map(d => `PGC : ${d.nom}${d.indice ? ` (ind. ${d.indice})` : ''}`), c.planAnnuel && `Plan de prévention annuel : ${c.planAnnuel.nom}`, ...pdp.map(d => `Plan de prévention : ${d.nom}`)].filter(Boolean).join(' · '))}
    </table>
    ${val('contraintes') ? `<h3 class="doc-h">2. Contraintes du PGC et du site</h3><p class="pre">${esc(val('contraintes'))}</p>` : ''}
    <h3 class="doc-h">3. Analyse des risques et mesures de prévention</h3>
    <table class="doc-lines compact"><tr><th style="width:24%">Risque</th><th>Mesures de prévention</th><th style="width:22%">EPI</th></tr>
      ${c.risques.map(k => { const r = s.risques[k]; return `<tr><td><strong>${esc(Securite.risque(k)[1])}</strong></td><td class="pre">${esc(r.mesures || '')}</td><td>${esc(r.epi || '')}</td></tr>`; }).join('') || '<tr><td colspan="3">Aucun risque particulier retenu.</td></tr>'}</table>
    <p><strong>EPI obligatoires en permanence :</strong> ${esc(val('epiBase', EPI_BASE))}</p>
    <h3 class="doc-h">4. Organisation des secours</h3>
    <table class="doc-lines compact ppsps-t">${Securite.URGENCES.map(([k, l, def]) => ligne(l, urg[k] !== undefined ? urg[k] : def)).join('')}
      ${ligne('Hôpital le plus proche', val('hopital'))}${ligne('Point de rassemblement', val('rassemblement'))}${ligne('Sauveteurs secouristes du travail', val('sst', c.sst.join(', ')) || 'Aucun')}
      ${ligne('Trousse de secours, extincteur', val('trousse', 'Trousse de secours et extincteur dans chaque véhicule'))}${ligne('Consignes d\'alerte', val('alerte', CONSIGNES_ALERTE))}</table>
    <h3 class="doc-h">5. Hygiène et conditions de travail</h3><p class="pre">${esc(val('baseVie', BASE_VIE))}</p>
    <h3 class="doc-h">6. Intervenants</h3>
    <table class="doc-lines compact"><tr><th>Nom</th><th>Qualification</th><th>Habilitations valides</th><th>Visite médicale</th></tr>
      ${c.controle.map(x => { const u = Store.get('users', x.userId) || {}, h = Store.all('habilitations').filter(y => y.userId === x.userId && y.cle !== 'visite' && (!y.expire || y.expire >= c.date)).map(y => y.cle);
        return `<tr><td>${esc(u.nom || '')}${u.type === 'interimaire' ? ' (intérim)' : ''}</td><td>${esc((Store.get('mainoeuvre', u.categorieId) || {}).libelle || '')}</td><td>${esc(libHabs(h))}</td><td>${x.visite === 'ok' ? 'à jour' : 'à régulariser'}</td></tr>`; }).join('') || '<tr><td colspan="4">À compléter</td></tr>'}</table>
    ${c.materiel.length ? `<h3 class="doc-h">7. Matériel et vérifications</h3><table class="doc-lines compact"><tr><th>Matériel</th><th>Catégorie</th><th>Prochain contrôle</th></tr>
      ${c.materiel.map(m => { const e = prochaineEcheance(m); return `<tr><td>${esc(m.designation)}</td><td>${esc(m.categorie)}</td><td>${e ? `${esc(e.libelle)} : ${dateFr(e.prochaine)}` : ''}</td></tr>`; }).join('')}</table>` : ''}
    ${c.produits.length ? `<h3 class="doc-h">8. Produits dangereux (FDS dans les véhicules)</h3><table class="doc-lines compact"><tr><th>Produit</th><th>Dangers</th><th>EPI</th><th>FDS</th></tr>
      ${c.produits.map(p => `<tr><td>${esc(p.nom)}</td><td>${esc((p.pictos || []).map(g => (Securite.PICTOS.find(x => x[0] === g) || [])[1]).filter(Boolean).join(', '))}${p.mentionsH ? ` (${esc(p.mentionsH)})` : ''}</td><td>${esc(p.epi || '')}</td><td>${p.dateFds ? `version du ${dateFr(p.dateFds)}` : p.fdsFichierId ? 'disponible' : 'à obtenir'}</td></tr>`).join('')}</table>` : ''}
    <p style="margin-top:18px">Établi par ${esc(Store.me.nom || '')}, le ${dateFr(isoDate(new Date()))}. Ce PPSPS est tenu à disposition sur le chantier et transmis au coordonnateur SPS, à l'inspection du travail, à la CARSAT et à l'OPPBTP sur demande.</p>
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}

/* ---------- Client : plans de prévention annuels ---------- */
function plansPreventionClient(e) {
  const auj = isoDate(new Date()), plans = (e.plansPrevention || []).slice().sort((x, y) => (y.debut || '').localeCompare(x.debut || ''));
  const lib = { valide: ['b-ok', 'valide'], bientot: ['b-warn', 'à renouveler'], echu: ['b-bad', 'échu'], futur: ['b-info', 'à venir'] };
  return `<h2>🛡️ Plans de prévention annuels</h2>
  <p class="muted small" style="margin-top:-6px">Plan établi avec ${esc(e.nom)} pour l'ensemble des interventions de l'année : consultable par les compagnons sur chaque chantier de ce client (ou du site concerné).</p>
  <div class="toolbar"><button id="pp-add">+ Plan de prévention</button></div>
  ${plans.length ? `<div class="table-wrap"><table><tr><th>Plan</th><th>Site</th><th>Validité</th><th></th></tr>${plans.map(p => { const x = lib[Securite.etatPlan(p, auj)];
    return `<tr><td><a href="${lienDocument({ fichierId: p.fichierId, nom: p.nom })}" target="_blank" rel="noopener">🛡️ ${esc(p.nom)}</a>${p.note ? `<br><span class="muted small">${esc(p.note)}</span>` : ''}</td><td>${p.siteId ? esc(siteLabel(siteOf(e.id, p.siteId))) : 'Tous les sites'}</td>
      <td>${p.debut ? dateFr(p.debut) : ''} → ${p.fin ? dateFr(p.fin) : ''} <span class="badge ${x[0]}">${x[1]}</span></td><td class="actions"><button class="small secondary" data-pp="${p.id}">Modifier</button></td></tr>`; }).join('')}</table></div>`
    : '<p class="muted">Aucun plan de prévention enregistré.</p>'}`;
}
function bindPlansPrevention(root, e) {
  const b = root.querySelector('#pp-add'); if (!b) return;
  b.onclick = () => editerPlanPrevention(e, null);
  root.querySelectorAll('[data-pp]').forEach(x => x.onclick = () => editerPlanPrevention(e, x.dataset.pp));
}
function editerPlanPrevention(e, id) {
  const an = new Date().getFullYear(), auj = isoDate(new Date());
  const p = id ? { ...(e.plansPrevention || []).find(x => x.id === id) } : { nom: `Plan de prévention ${an}`, debut: auj, fin: Echeances.ajouterMois(auj, 12), siteId: '' };
  if (!id) { const d = new Date(`${p.fin}T12:00:00`); d.setDate(d.getDate() - 1); p.fin = isoDate(d); }
  let fichier = null;
  const box = Modal.open(`<h2 style="margin-top:0">${id ? 'Plan de prévention' : 'Nouveau plan de prévention annuel'}</h2>
    <div class="field"><label for="pp-f">Document signé (PDF)</label><input id="pp-f" type="file" accept=".pdf,image/*">${p.fichierId ? `<span class="small">Actuel : <a href="${lienDocument({ fichierId: p.fichierId, nom: p.nom })}" target="_blank" rel="noopener">${esc(p.nom)}</a></span>` : ''}</div>
    <div class="field"><label for="pp-n">Intitulé</label><input id="pp-n" value="${esc(p.nom || '')}"></div>
    <div class="grid2"><div class="field"><label for="pp-d">Valable du</label><input id="pp-d" type="date" value="${esc(p.debut || '')}"></div>
      <div class="field"><label for="pp-e">au</label><input id="pp-e" type="date" value="${esc(p.fin || '')}"></div></div>
    <div class="field"><label for="pp-s">Site concerné</label><select id="pp-s"><option value="">Tous les sites</option>${(e.adresses || []).map(s => `<option value="${esc(s.id)}" ${p.siteId === s.id ? 'selected' : ''}>${esc(s.libelle)}</option>`).join('')}</select></div>
    <div class="field"><label for="pp-no">Note (inspection commune, interlocuteur…)</label><input id="pp-no" value="${esc(p.note || '')}"></div>
    <div class="modal-actions">${id ? '<button class="danger" id="pp-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="pp-x">Annuler</button><button id="pp-ok">Enregistrer</button></div>`);
  const $ = s => box.querySelector(s);
  $('#pp-x').onclick = Modal.close;
  $('#pp-f').onchange = () => { fichier = $('#pp-f').files[0] || null; };
  if ($('#pp-del')) $('#pp-del').onclick = async () => { if (await ask('Supprimer ce plan de prévention ?', 'Supprimer')) { Store.upsert('entreprises', { ...e, plansPrevention: e.plansPrevention.filter(x => x.id !== id) }); Modal.close(); App.render(); } };
  $('#pp-ok').onclick = async () => {
    Object.assign(p, { nom: $('#pp-n').value.trim() || 'Plan de prévention', debut: $('#pp-d').value, fin: $('#pp-e').value, siteId: $('#pp-s').value, note: $('#pp-no').value.trim() });
    if (p.debut && p.fin && p.fin < p.debut) return notify('La fin de validité précède le début.');
    if (!fichier && !p.fichierId) return notify('Joignez le plan de prévention signé.');
    try {
      if (fichier) p.fichierId = (await envoyerFichierDocument(fichier)).id;
    } catch (err) { return notify(err.message); }
    if (!p.id) p.id = uid();
    const plans = (e.plansPrevention || []).filter(x => x.id !== p.id);
    Store.upsert('entreprises', { ...e, plansPrevention: [...plans, p] }); Modal.close(); App.render();
  };
}

/* ---------- Appli des compagnons : sécurité du chantier ---------- */
function securiteCompagnon(u, a) {
  const s = a.securite || {}, auj = isoDate(new Date()), urg = s.urgences || {};
  const docs = documentsVisibles(a).filter(d => Securite.estDocSecurite(d.categorie)).sort((x, y) => Securite.CATEGORIES.indexOf(x.categorie) - Securite.CATEGORIES.indexOf(y.categorie) || (y.date || '').localeCompare(x.date || ''));
  const plan = Securite.planApplicable(entreprise(a.clientId).plansPrevention, a.siteId, auj);
  const equipe = [u.id, ...Store.all('users').filter(x => x.chefId === u.id).map(x => x.id)];
  const produits = Securite.produitsDesPersonnes(equipe, Store.all('materiels'));
  const risques = Object.keys(s.risques || {}).map(k => Securite.risque(k)).filter(Boolean);
  const vus = new Set(), epi = [s.epiBase || EPI_BASE, ...Object.values(s.risques || {}).map(r => r.epi)].filter(Boolean).flatMap(x => x.split(/,\s*/)).map(x => x.trim())
    .filter(x => { const k = x.toLowerCase(); if (!x || vus.has(k)) return false; vus.add(k); return true; });
  const tel = n => String(n || '').replace(/[^\d+]/g, '');
  const numeros = Securite.URGENCES.map(([k, l, def]) => [l, urg[k] !== undefined ? urg[k] : def]).filter(x => x[1]);
  if (!docs.length && !plan && !produits.length && !a.securite) return '';
  return `<h2>⛑️ Sécurité</h2>
    <div class="card secu-mobile">
      <div class="secu-urgences">${numeros.map(([l, n]) => `<a class="btn ${/^1[58]$|^112$/.test(tel(n)) ? 'danger' : 'secondary'}" href="tel:${esc(tel(n))}">📞 ${esc(n)}<span class="small">${esc(l)}</span></a>`).join('')}</div>
      ${s.rassemblement ? `<div class="small">🚩 Point de rassemblement : <strong>${esc(s.rassemblement)}</strong></div>` : ''}
      ${s.hopital ? `<div class="small">🏥 Hôpital : ${esc(s.hopital)}</div>` : ''}
      ${s.sst ? `<div class="small">⛑️ SST : ${esc(s.sst)}</div>` : ''}
      ${risques.length ? `<div class="small" style="margin-top:6px"><strong>Risques du chantier :</strong> ${risques.map(r => esc(r[1].split(/[:(]/)[0].trim())).join(' · ')}</div>` : ''}
      ${a.securite ? `<div class="small"><strong>EPI :</strong> ${esc(epi.join(', '))}</div>` : ''}
    </div>
    ${docs.length || plan ? `<ul class="docs-mobile">${docs.map(d => `<li><a href="${lienDocument(d)}" target="_blank" rel="noopener"><span class="doc-ic">${iconeDoc(d.categorie)}</span>
      <span><strong>${esc(d.nom)}</strong><br><span class="small muted">${esc(d.categorie === 'Sécurité / PPSPS' ? 'PPSPS' : d.categorie)}${d.indice ? ` · indice ${esc(d.indice)}` : ''} · ${dateFr(d.date)}</span></span></a></li>`).join('')}
      ${plan ? `<li><a href="${lienDocument({ fichierId: plan.fichierId, nom: plan.nom })}" target="_blank" rel="noopener"><span class="doc-ic">🛡️</span><span><strong>${esc(plan.nom)}</strong><br><span class="small muted">Plan de prévention annuel du client${plan.fin ? ` · valable jusqu'au ${dateFr(plan.fin)}` : ''}</span></span></a></li>` : ''}</ul>` : ''}
    ${produits.length ? `<h3>🧪 FDS des produits de votre véhicule</h3>${fdsListe(produits)}` : ''}`;
}
