// Chantier → onglet Sécurité : PGC du coordonnateur SPS, plan de prévention (annuel du client ou spécifique au chantier),
// rédaction du PPSPS d'après les contraintes du chantier (risques, secours, intervenants et habilitations, matériel,
// produits et FDS) et génération du PDF enregistré dans les documents du chantier.
// Client → plans de prévention annuels. Appli des compagnons → fiche sécurité du chantier.
const EPI_BASE = 'Casque, chaussures de sécurité, gants, lunettes de protection, vêtements de travail, gilet haute visibilité';
const BASE_VIE = 'Installations du client mises à disposition (vestiaires, sanitaires, réfectoire) selon le plan de prévention ou le PGC. Eau potable sur site. Repas pris hors des zones de travail.';
const CONSIGNES_ALERTE = 'Protéger la victime et la zone, alerter le sauveteur secouriste (SST) le plus proche et le poste de garde du site, puis appeler le 15 (ou le 112) en précisant l\'adresse, le bâtiment et l\'accès. Envoyer une personne guider les secours. Prévenir le chargé d\'affaires.';
// Organismes de prévention et concessionnaires (chapitre II du PPSPS) : repris du dernier PPSPS pour ceux qui ne
// dépendent pas du site (médecine du travail, inspection, CARSAT, OPPBTP, réseaux)
const ORGANISMES = [['medecine', 'Médecine du travail'], ['inspection', 'Inspection du travail'], ['carsat', 'CARSAT'], ['oppbtp', 'OPPBTP'], ['gendarmerie', 'Police ou gendarmerie'],
  ['mairie', 'Commune (mairie)'], ['pharmacie', 'Pharmacie'], ['eau', 'Service des eaux'], ['electricite', 'Électricité (dépannage)'], ['gaz', 'Gaz (urgence)'], ['telecom', 'Télécom']];
const ORGANISMES_FIXES = ['medecine', 'inspection', 'carsat', 'oppbtp', 'electricite', 'gaz', 'telecom'];
const DECHETS_DEF = 'Bois, plastique, carton, PVC, acier, inox, aluminium';
const EVAC_DEF = 'Évacuation de nos déchets de chantier par nos soins (tri par matière) et stockage dans notre atelier avant enlèvement en filière agréée.';
const RISQUES_AUTRES_DEF = 'Chutes d\'objets, chocs, accrochages. Chutes d\'outillages ou de matériaux. Brûlures, dégagement de fumée, projection de métal. Bruit.';
const PRECAUTIONS_DEF = 'Respecter le balisage et le guidage mis en place par les autres entreprises.\nPorter les équipements de protection individuelle adaptés (casque, gants, chaussures de sécurité, harnais, lunettes de protection, bouchons d\'oreille…).\nPrivilégier les moyens de manutention mécanique (chariot élévateur, grue).\nPersonnel formé et habilité à la conduite de chariot et nacelle (autorisation de conduite).\nPermis de feu si nécessaire, extincteur à proximité.\nAssurer une ventilation suffisante de la zone.';
const organismesDefaut = a => { const der = Store.all('affaires').filter(x => x.id !== a.id && x.securite && x.securite.organismes).sort((x, y) => (y.securite.dateEdition || '').localeCompare(x.securite.dateEdition || ''))[0];
  return der ? Object.fromEntries(ORGANISMES_FIXES.map(k => [k, der.securite.organismes[k] || ''])) : {}; };
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
      ${pgc.length ? `<ul class="secu-liste">${liste(pgc)}</ul>` : '<p class="muted small">Aucun PGC joint (opération sans coordination SPS : sans objet).</p>'}${depot('PGC', '📤 Joindre le PGC')}
      ${pgc.length && edit ? ` <button class="small" id="sc-pgc">📖 Reprendre le PGC dans le PPSPS</button>` : ''}
      ${s.pgcLu ? `<p class="small muted" style="margin:4px 0 0">PGC repris le ${dateFr(s.pgcLu.date)}${s.pgcLu.reference ? ` (${esc(s.pgcLu.reference)})` : ''}${s.pgcLu.categorie ? ` · opération de catégorie ${s.pgcLu.categorie}` : ''}${s.pgcLu.delai ? ` · PPSPS à remettre sous ${s.pgcLu.delai} jours` : ''}</p>` : ''}</div>
    <div class="card"><strong>🛡️ Plan de prévention</strong> <span class="muted small">intervention sur le site d'un client exploitant</span>
      ${c.planAnnuel ? `<p class="small" style="margin:6px 0">Plan annuel du client : <a href="${lienDocument({ fichierId: c.planAnnuel.fichierId, nom: c.planAnnuel.nom })}" target="_blank" rel="noopener">${esc(c.planAnnuel.nom)}</a> ${etatPlan(c.planAnnuel)}</p>`
        : `<p class="small warn-text" style="margin:6px 0">Aucun plan de prévention annuel valide chez ${esc(c.client.nom || 'le client')}${site ? ` pour ${esc(site.libelle)}` : ''}. <a href="#/entreprise/${esc(a.clientId || '')}">Ajouter le plan annuel du client</a></p>`}
      ${pdp.length ? `<ul class="secu-liste">${liste(pdp)}</ul>` : ''}${depot('Plan de prévention', '📤 Plan spécifique au chantier')}
      <p class="muted small" style="margin-bottom:0">Écrit obligatoire au-delà de 400 h de travaux sur 12 mois ou pour les travaux dangereux (arrêté du 19 mars 1993 : points chauds, hauteur, espaces confinés…).</p></div>
    <div class="card"><strong>⛑️ PPSPS</strong> <span class="muted small">plan particulier de sécurité et de protection de la santé</span>
      ${ppsps.length ? `<ul class="secu-liste">${liste(ppsps)}</ul>` : '<p class="muted small">Pas encore généré.</p>'}
      ${edit ? `<div class="toolbar" style="margin:0"><button id="sc-gen">📄 Générer le PPSPS (PDF)</button><button class="secondary small" id="sc-apercu">Aperçu</button>${ppspsGenere(a) && ['admin', 'charge'].includes(Store.me.role) ? '<button class="small" id="sc-mail">✉ Envoyer le PPSPS</button>' : ''}</div><label class="check small"><input type="checkbox" id="sc-vis" checked> Transmettre aux compagnons</label>${s.envoyeLe ? `<p class="small muted" style="margin:4px 0 0">Envoyé le ${dateFr(s.envoyeLe)}${s.envoyeA ? ` à ${esc(s.envoyeA)}` : ''}</p>` : ''}` : ''}</div>
  </div>

  <h2>Rédaction du PPSPS</h2>
  <div class="card secu-form">
    <h3>1. Renseignements généraux</h3>
    <div class="grid2">
      <div class="field"><label for="sc-op">Désignation de l'opération</label><input id="sc-op" data-s="operation" value="${v('operation', a.nom || '')}" ${dis}></div>
      <div class="field"><label for="sc-lot">Lot</label><input id="sc-lot" data-s="lot" value="${v('lot')}" placeholder="Ex. Lot n° 11 : CVC – Plomberie" ${dis}></div>
      <div class="field"><label for="sc-adr">Adresse du chantier</label><input id="sc-adr" data-s="adresseChantier" value="${v('adresseChantier', site ? fullAddress(site) : '')}" ${dis}></div>
      <div class="field"><label for="sc-nat">Nature des travaux</label><input id="sc-nat" data-s="nature" value="${v('nature', a.nom || '')}" ${dis}></div>
      <div class="field"><label for="sc-resp">Responsable des travaux sur le site</label><select id="sc-resp" data-s="responsableId" ${dis}>${options(Store.all('users').filter(u => !u.archive), s.responsableId || a.chargeId)}</select></div>
      <div class="field"><label for="sc-rq">Qualité du responsable</label><input id="sc-rq" data-s="responsableQualite" value="${v('responsableQualite', 'Responsable des travaux')}" ${dis}></div>
      <div class="field"><label for="sc-cn">Coordonnateur SPS (nom, société)</label><input id="sc-cn" data-s="coordonnateur" value="${v('coordonnateur')}" ${dis} placeholder="Sans objet si pas de coordination"></div>
      <div class="field"><label for="sc-ct">Téléphone du coordonnateur</label><input id="sc-ct" data-s="coordTel" type="tel" value="${v('coordTel')}" ${dis}></div>
      <div class="field"><label for="sc-ce">E-mail du coordonnateur (destinataire du PPSPS)</label><input id="sc-ce" data-s="coordEmail" type="email" value="${v('coordEmail')}" ${dis}></div>
      <div class="field"><label for="sc-ca">Adresse du coordonnateur</label><input id="sc-ca" data-s="coordAdresse" value="${v('coordAdresse')}" ${dis}></div>
      <div class="field"><label for="sc-db">Début des travaux</label><input id="sc-db" type="date" data-s="debut" value="${esc(s.debut || '')}" ${dis}>${!s.debut && c.debut ? `<span class="small muted">planning : ${dateFr(c.debut)}</span>` : ''}</div>
      <div class="field"><label for="sc-fn">Fin prévue</label><input id="sc-fn" type="date" data-s="fin" value="${esc(s.fin || '')}" ${dis}>${!s.fin && c.fin ? `<span class="small muted">planning : ${dateFr(c.fin)}</span>` : ''}</div>
      <div class="field"><label for="sc-ef">Effectif moyen</label><input id="sc-ef" type="number" min="0" data-s="effectif" value="${esc(s.effectif ?? '')}" placeholder="${c.ids.length}" ${dis}></div>
      <div class="field"><label for="sc-em">Effectif maximum</label><input id="sc-em" type="number" min="0" data-s="effectifMax" value="${esc(s.effectifMax ?? '')}" ${dis}></div>
      <div class="field"><label for="sc-hm">Horaires du matin</label><input id="sc-hm" data-s="horMatin" value="${v('horMatin', '07 h – 12 h')}" ${dis}></div>
      <div class="field"><label for="sc-ha">Horaires de l'après-midi</label><input id="sc-ha" data-s="horAprem" value="${v('horAprem', '13 h 30 – 17 h')}" ${dis}></div>
      <div class="field"><label for="sc-jr">Jours travaillés</label><input id="sc-jr" data-s="joursTravail" value="${v('joursTravail', 'lundi, mardi, mercredi, jeudi, vendredi')}" ${dis}></div>
    </div>
    <div class="field"><label for="sc-st">Sous-traitants, intérimaires (entreprise, travaux)</label><input id="sc-st" data-s="soustraitants" value="${v('soustraitants')}" ${dis}></div>
    <h4>Intervenants de l'opération</h4>
    <div class="table-wrap"><table class="compact sc-int"><tr><th>Rôle</th><th>Société</th><th>Contact</th><th>Adresse, téléphone, e-mail</th><th></th></tr>
      ${(s.intervenants || []).map((x, i) => `<tr data-int="${i}"><td><input data-k="role" value="${esc(x.role || '')}" list="sc-roles" ${dis}></td><td><input data-k="societe" value="${esc(x.societe || '')}" ${dis}></td><td><input data-k="contact" value="${esc(x.contact || '')}" ${dis}></td>
        <td><input data-k="coord" value="${esc([x.adresse, x.tel, x.email].filter(Boolean).join(' · ') || x.coord || '')}" ${dis}></td><td>${edit ? `<button class="small danger" data-int-del="${i}" aria-label="Retirer">✕</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5" class="muted small">Aucun intervenant : reprenez le PGC ou ajoutez-les.</td></tr>`}</table></div>
    <datalist id="sc-roles">${['Maître d\'ouvrage', 'Architecte', 'Maître d\'œuvre', 'OPC', 'BET structure', 'BET fluides', 'BET VRD', 'BET géotechnique', 'Contrôleur technique'].map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    ${edit ? '<button class="secondary small" id="sc-int-add">+ Intervenant</button>' : ''}

    <h3>2. Organismes de prévention et concessionnaires</h3>
    <div class="grid2">${ORGANISMES.map(([k, l]) => { const o = s.organismes || {}, d = organismesDefaut(a); return `<div class="field"><label for="sc-o-${k}">${esc(l)}</label><textarea id="sc-o-${k}" data-org="${k}" rows="2" placeholder="Nom, adresse, téléphone" ${dis}>${esc(o[k] !== undefined ? o[k] : d[k] || '')}</textarea></div>`; }).join('')}</div>

    <h3>3. Exigences du PGC et contraintes du site</h3>
    <div class="field"><label for="sc-cr">Contraintes, consignes du site, zones interdites, permis exigés…</label><textarea id="sc-cr" data-s="contraintes" rows="3" ${dis} placeholder="Exigences du PGC ou du plan de prévention : accueil sécurité, permis de feu, travaux en hauteur, coactivité, consignation des réseaux…">${v('contraintes')}</textarea></div>
    ${(s.exigencesPgc || []).length ? `<p class="small muted">Exigences du coordonnateur à la charge de l'entreprise (lots EC, TCE ou du lot) : indiquez la disposition prise, ou décochez celles qui ne vous concernent pas.</p>
    <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="compact sc-exig"><tr><th></th><th>Exigence du PGC</th><th style="width:34%">Disposition de l'entreprise</th></tr>
      ${s.exigencesPgc.map((x, i) => `<tr class="${x.retenue === false ? 'muted' : ''}"><td><input type="checkbox" data-exi="${i}" ${x.retenue === false ? '' : 'checked'} ${dis} aria-label="Retenue"></td><td class="small">${esc(x.texte)}${x.lots ? ` <span class="badge">${esc(x.lots)}</span>` : ''}</td>
        <td><input data-exr="${i}" value="${esc(x.reponse || '')}" placeholder="Respectée (par défaut)" ${dis}></td></tr>`).join('')}</table></div>` : ''}
    ${edit ? '<button class="secondary small" id="sc-detect">🔎 Proposer les risques d\'après les contraintes et le chantier</button>' : ''}

    <h3>4. Analyse des risques et mesures de prévention</h3>
    <div class="secu-risques">${Securite.RISQUES.map(([k, l, , , habs]) => { const r = (s.risques || {})[k]; return `<div class="secu-risque ${r ? 'on' : ''}">
      <label class="check"><input type="checkbox" data-rq="${k}" ${r ? 'checked' : ''} ${dis}> <strong>${esc(l)}</strong>${habs.length ? ` <span class="muted small">(${esc(libHabs(habs))})</span>` : ''}</label>
      ${r ? `<textarea data-rqm="${k}" rows="3" aria-label="Mesures : ${esc(l)}" ${dis}>${esc(r.mesures || '')}</textarea><input data-rqe="${k}" value="${esc(r.epi || '')}" placeholder="EPI spécifiques" aria-label="EPI : ${esc(l)}" ${dis}>` : ''}</div>`; }).join('')}</div>
    <div class="field"><label for="sc-epi">EPI obligatoires en permanence</label><input id="sc-epi" data-s="epiBase" value="${v('epiBase', EPI_BASE)}" ${dis}></div>
    <h4>Modes opératoires produisant des risques pour les autres entreprises</h4>
    <div class="table-wrap"><table class="compact sc-modes"><tr><th>Tâche à accomplir</th><th>Risques</th><th>Mesures prises</th><th></th></tr>
      ${(s.modes || []).map((x, i) => `<tr data-mode="${i}"><td><input data-k="tache" value="${esc(x.tache || '')}" ${dis}></td><td><input data-k="risques" value="${esc(x.risques || '')}" ${dis}></td><td><input data-k="mesures" value="${esc(x.mesures || '')}" ${dis}></td><td>${edit ? `<button class="small danger" data-mode-del="${i}" aria-label="Retirer">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted small">Aucun : proposez-les d\'après les risques retenus.</td></tr>'}</table></div>
    ${edit ? '<div class="toolbar"><button class="secondary small" id="sc-mode-add">+ Tâche</button><button class="secondary small" id="sc-mode-prop">Proposer d\'après les risques retenus</button></div>' : ''}
    <h4>Risques produits par les autres entreprises</h4>
    <div class="grid2"><div class="field"><label for="sc-ra">Risques</label><textarea id="sc-ra" data-s="risquesAutres" rows="3" ${dis}>${v('risquesAutres', RISQUES_AUTRES_DEF)}</textarea></div>
      <div class="field"><label for="sc-pa">Précautions et moyens</label><textarea id="sc-pa" data-s="precautionsAutres" rows="3" ${dis}>${v('precautionsAutres', PRECAUTIONS_DEF)}</textarea></div></div>

    <h3>5. Organisation des secours</h3>
    <div class="grid2">${Securite.URGENCES.map(([k, l, def]) => `<div class="field"><label for="sc-u-${k}">${esc(l)}</label><input id="sc-u-${k}" type="tel" data-urg="${k}" value="${esc(urg[k] !== undefined ? urg[k] : def)}" ${dis}></div>`).join('')}
      <div class="field"><label for="sc-hop">Hôpital le plus proche (nom, adresse)</label><input id="sc-hop" data-s="hopital" value="${v('hopital')}" ${dis}></div>
      <div class="field"><label for="sc-ras">Point de rassemblement</label><input id="sc-ras" data-s="rassemblement" value="${v('rassemblement')}" ${dis}></div>
      <div class="field"><label for="sc-ss">Sauveteurs secouristes (SST) sur le chantier</label><input id="sc-ss" data-s="sst" value="${v('sst', c.sst.join(', '))}" ${dis} placeholder="Aucun SST planifié">${c.sst.length ? '' : '<span class="small warn-text">Aucun intervenant planifié n\'a de SST valide.</span>'}</div>
      <div class="field"><label for="sc-tr">Trousse de secours, extincteur</label><input id="sc-tr" data-s="trousse" value="${v('trousse', 'Trousse de secours et extincteur dans chaque véhicule')}" ${dis}></div></div>
    <div class="field"><label for="sc-al">Consignes d'alerte</label><textarea id="sc-al" data-s="alerte" rows="2" ${dis}>${v('alerte', CONSIGNES_ALERTE)}</textarea></div>

    <h3>6. Hygiène, installations et déchets</h3>
    <div class="field"><label for="sc-bv">Base vie, vestiaires, sanitaires, repas</label><textarea id="sc-bv" data-s="baseVie" rows="2" ${dis}>${v('baseVie', BASE_VIE)}</textarea></div>
    <div class="grid2"><div class="field"><label for="sc-dc">Déchets de chantier</label><input id="sc-dc" data-s="dechets" value="${v('dechets', DECHETS_DEF)}" ${dis}></div>
      <div class="field"><label for="sc-ev">Évacuation des déchets</label><input id="sc-ev" data-s="evacDechets" value="${v('evacDechets', EVAC_DEF)}" ${dis}></div></div>

    <h3>7. Intervenants et habilitations</h3>
    ${c.ids.length ? `<div class="table-wrap"><table><tr><th>Intervenant</th><th>Habilitations valides</th><th>Visite médicale</th><th>À régler pour les risques retenus</th></tr>
      ${c.controle.map(x => { const h = Store.all('habilitations').filter(y => y.userId === x.userId && (!y.expire || y.expire >= c.date) && y.cle !== 'visite').map(y => y.cle);
        return `<tr><td><strong>${esc(userName(x.userId))}</strong>${(Store.get('users', x.userId) || {}).type === 'interimaire' ? ' <span class="badge">intérim</span>' : ''}</td><td class="small">${esc(libHabs(h)) || '<span class="muted">—</span>'}</td>
        <td>${x.visite === 'ok' ? '<span class="badge b-ok">à jour</span>' : `<span class="badge b-bad">${x.visite === 'absente' ? 'non renseignée' : 'expirée'}</span>`}</td>
        <td class="small">${x.manque.length ? `<span class="neg">manque : ${esc(libHabs(x.manque))}</span>` : ''}${x.expirees.length ? `${x.manque.length ? '<br>' : ''}<span class="neg">expirée : ${esc(libHabs(x.expirees))}</span>` : ''}${!x.manque.length && !x.expirees.length ? '<span class="pos">✓</span>' : ''}</td></tr>`; }).join('')}</table></div>
      ${pb.length ? `<p class="small warn-text">${pb.length} intervenant(s) à régulariser avant le début des travaux (RH → Habilitations).</p>` : ''}
      <div class="toolbar"><button class="secondary small" data-fiche-hab="${a.id}">📄 Fiche récapitulative des habilitations pour le client</button><button class="secondary small" data-autor-equipe="${esc(c.ids.join(','))}">📄 Autorisations de conduite de l'équipe</button></div>`
      : '<p class="muted small">Personne n\'est encore planifié sur ce chantier : planifiez l\'équipe pour contrôler les habilitations.</p>'}

    <h3>8. Matériel et contrôles</h3>
    ${c.materiel.length ? `<ul class="secu-liste">${c.materiel.map(m => `<li>${esc(m.designation)} <span class="muted small">${esc(m.categorie)}</span> · ${badgeEcheance(prochaineEcheance(m), c.date)}</li>`).join('')}</ul>` : '<p class="muted small">Aucun matériel du parc affecté au chantier ou à l\'équipe.</p>'}

    <h3>9. Produits dangereux et FDS</h3>
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
  // Organismes, intervenants, exigences du PGC, modes opératoires
  root.querySelectorAll('[data-org]').forEach(el => el.onchange = () => { s().organismes = { ...organismesDefaut(a), ...(s().organismes || {}), [el.dataset.org]: el.value }; enreg(); });
  root.querySelectorAll('.sc-int tr[data-int] [data-k]').forEach(el => el.onchange = () => { const x = s().intervenants[+el.closest('tr').dataset.int]; if (el.dataset.k === 'coord') { x.coord = el.value; delete x.adresse; delete x.tel; delete x.email; } else x[el.dataset.k] = el.value; enreg(); });
  root.querySelectorAll('[data-int-del]').forEach(b => b.onclick = () => { s().intervenants.splice(+b.dataset.intDel, 1); enreg(true); });
  const ia = root.querySelector('#sc-int-add'); if (ia) ia.onclick = () => { s().intervenants = [...(s().intervenants || []), { role: '', societe: '', contact: '', coord: '' }]; enreg(true); };
  root.querySelectorAll('[data-exi]').forEach(el => el.onchange = () => { s().exigencesPgc[+el.dataset.exi].retenue = el.checked; enreg(true); });
  root.querySelectorAll('[data-exr]').forEach(el => el.onchange = () => { s().exigencesPgc[+el.dataset.exr].reponse = el.value; enreg(); });
  root.querySelectorAll('.sc-modes tr[data-mode] [data-k]').forEach(el => el.onchange = () => { s().modes[+el.closest('tr').dataset.mode][el.dataset.k] = el.value; enreg(); });
  root.querySelectorAll('[data-mode-del]').forEach(b => b.onclick = () => { s().modes.splice(+b.dataset.modeDel, 1); enreg(true); });
  const ma = root.querySelector('#sc-mode-add'); if (ma) ma.onclick = () => { s().modes = [...(s().modes || []), { tache: '', risques: '', mesures: '' }]; enreg(true); };
  const mp = root.querySelector('#sc-mode-prop'); if (mp) mp.onclick = () => { s().modes = modesProposes(a); enreg(true); App.toast(`${s().modes.length} tâche(s) proposée(s) : à ajuster`); };
  const pg = root.querySelector('#sc-pgc'); if (pg) pg.onclick = () => reprendrePgc(a);
  const ml = root.querySelector('#sc-mail'); if (ml) ml.onclick = () => envoyerParMail('ppsps', a.id).catch(e => notify(e.message));
  // Dépôt du PGC ou d'un plan de prévention spécifique
  root.querySelectorAll('[data-depot]').forEach(inp => inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const r = await envoyerFichierDocument(f);
      a.documents = [...(a.documents || []), { id: uid(), fichierId: r.id, nom: f.name, categorie: inp.dataset.depot, indice: '', note: '', mime: r.mime, taille: r.taille, date: isoDate(new Date()), par: Store.me.nom, visible: true }];
      enreg(true); App.toast(`${f.name} ajouté et transmis aux compagnons`);
      // PGC déposé : lu tout de suite pour pré-remplir le PPSPS
      if (inp.dataset.depot === 'PGC' && /pdf/i.test(f.type || f.name)) reprendrePgc(a, f);
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

// Document A4 du PPSPS, sur le modèle de l'entreprise : page de garde, sommaire, puis les 9 chapitres
// (I renseignements généraux, II organismes de prévention, III entreprise et chantier, IV hygiène et locaux,
// V risques produits par les autres entreprises, VI modes opératoires, VII risques pour son personnel,
// VIII secours et évacuation, IX affichette « en cas d'accident »)
function ppspsDocument(a, indice) {
  const c = contexteSecurite(a), s = c.s, st = Store.data.settings, dc = Doc.cfg(), site = siteOf(a.clientId, a.siteId), urg = s.urgences || {};
  const val = (k, def = '') => (s[k] !== undefined && s[k] !== '' ? s[k] : def);
  const ligne = (l, x) => (x ? `<tr><th>${esc(l)}</th><td class="pre">${x}</td></tr>` : '');
  const L = (l, x) => ligne(l, x ? esc(x) : '');
  const pgc = docsSecurite(a, 'PGC'), pdp = docsSecurite(a, 'Plan de prévention'), auj = isoDate(new Date());
  const resp = Store.get('users', val('responsableId', a.chargeId)) || {}, org = { ...organismesDefaut(a), ...(s.organismes || {}) };
  const moa = (s.intervenants || []).find(x => /ouvrage/i.test(x.role || '')), client = c.client;
  const ville = (/\d{5}\s+([^,]+)$/.exec(st.adresse || '') || [])[1] || '';
  const saut = '<div class="pdf-saut"></div>', titre = (n, t) => `<h3 class="doc-h ppsps-chap">${n} – ${esc(t)}</h3>`;
  const coord = x => [x.adresse, x.tel && `Tél. ${x.tel}`, x.email, x.coord].filter(Boolean).join(' · ');
  const jours = norm => String(val('joursTravail', 'lundi, mardi, mercredi, jeudi, vendredi')).toLowerCase().includes(norm);
  const exig = (s.exigencesPgc || []).filter(x => x.retenue !== false);
  const sommaire = ['Renseignements généraux', 'Organismes de prévention', 'Renseignements concernant l\'entreprise et le chantier', 'Mesures prises pour assurer l\'hygiène des conditions de travail et celle des locaux destinés au personnel',
    'Mesures spécifiques prises par l\'entreprise destinées à prévenir certains risques spécifiques', 'Description des travaux et des modes opératoires de l\'entreprise titulaire du lot produisant des risques pour les autres entreprises',
    'Dispositions prises pour prévenir les risques liés à l\'intervention de l\'entreprise pour son personnel', 'Dispositions en matière de secours et d\'évacuation des blessés', 'Affichette : en cas d\'accident'];
  const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  return `${Doc.entete('facture', 'PPSPS', `Indice ${esc(indice)} · ${dateFr(auj)}`)}
    <div class="doc-parties"><div></div><div><strong>${esc(moa ? moa.societe : client.nom || '')}</strong>${moa && moa.adresse ? `<br>${esc(moa.adresse)}` : ''}<br><br>${esc(ville || '')}${ville ? ', le' : 'Le'} ${dateFr(auj)}</div></div>
    <div class="ppsps-garde"><p class="ppsps-titre">PLAN PARTICULIER DE SÉCURITÉ<br>ET DE PROTECTION DE LA SANTÉ</p><p class="ppsps-sigle">(P.P.S.P.S.)</p>
      <table class="doc-lines compact ppsps-t">${L('Désignation de l\'opération', val('operation', a.nom))}${L('Lot', val('lot'))}${L('Nature des travaux', val('nature', a.nom))}
        ${L('Adresse du chantier', val('adresseChantier', site ? fullAddress(site) : ''))}${L('Chantier', `${a.code || ''} ${a.nom || ''}`.trim())}</table></div>
    ${saut}<h3 class="doc-h">Sommaire</h3><div class="ppsps-sommaire">${sommaire.map((x, i) => `<p><strong>${R[i]}</strong> – ${esc(x)}</p>`).join('')}</div>

    ${saut}${titre('I', 'Renseignements généraux')}
    <table class="doc-lines compact ppsps-t">
      ${(s.intervenants || []).map(x => ligne(x.role || 'Intervenant', [`<strong>${esc(x.societe || '')}</strong>`, esc(x.contact || ''), esc(coord(x))].filter(Boolean).join('<br>'))).join('')}
      ${!(s.intervenants || []).length ? `${L('Maître d\'ouvrage / donneur d\'ordre', client.nom)}${L('Maître d\'œuvre', a.moeId ? entreprise(a.moeId).nom : '')}` : ''}
      ${ligne('Coordonnateur SPS', [esc(val('coordonnateur')), esc(val('coordAdresse')), [val('coordTel') && `Tél. ${esc(val('coordTel'))}`, esc(val('coordEmail'))].filter(Boolean).join(' · ')].filter(Boolean).join('<br>') || 'Sans objet')}
      ${L('Documents de référence', [...pgc.map(d => `PGC : ${d.nom}${d.indice ? ` (ind. ${d.indice})` : ''}${s.pgcLu && s.pgcLu.reference ? ` – ${s.pgcLu.reference}` : ''}`), c.planAnnuel && `Plan de prévention annuel : ${c.planAnnuel.nom}`, ...pdp.map(d => `Plan de prévention : ${d.nom}`)].filter(Boolean).join('\n'))}
    </table>

    ${titre('II', 'Coordonnées des organismes de prévention')}
    <table class="doc-lines compact ppsps-t">
      ${ORGANISMES.filter(([k]) => !['eau', 'electricite', 'gaz', 'telecom'].includes(k)).map(([k, l]) => L(l, org[k])).join('')}
      ${L('Pompiers', [urg.pompiers || '18', urg.europe || '112'].join(' / '))}${L('SAMU', urg.samu || '15')}${L('Hôpital le plus proche', val('hopital'))}${L('Centre antipoison', urg.antipoison)}
    </table>
    ${['eau', 'electricite', 'gaz', 'telecom'].some(k => org[k]) ? `<p><strong>Concessionnaires réseaux</strong></p><table class="doc-lines compact ppsps-t">${[['eau', 'Service des eaux'], ['electricite', 'Électricité'], ['gaz', 'Gaz'], ['telecom', 'Télécom']].map(([k, l]) => L(l, org[k])).join('')}</table>` : ''}

    ${saut}${titre('III', 'Renseignements concernant l\'entreprise et le chantier')}
    <table class="doc-lines compact ppsps-t">
      ${ligne('Nom de l\'entreprise', `<strong>${esc(st.societe || '')}</strong>`)}${L('Adresse du siège', st.adresse)}
      ${L('Téléphone, e-mail', [dc.tel, dc.email].filter(Boolean).join(' · '))}${L('N° de SIRET', st.siret)}
      ${L('Responsable', [resp.nom, resp.tel && `Tél. ${resp.tel}`, resp.email].filter(Boolean).join(' · '))}${L('En qualité de', val('responsableQualite', 'Responsable des travaux'))}
      ${L('Évolution prévisible de l\'effectif sur le chantier', [`Moyen : ${val('effectif', c.ids.length) || '—'}`, val('effectifMax') && `Maximum : ${val('effectifMax')}`].filter(Boolean).join(' · '))}
      ${L('Lot', val('lot'))}${L('Nature des travaux', val('nature', a.nom))}
      ${L('Période', [c.debut && `du ${dateFr(c.debut)}`, c.fin && `au ${dateFr(c.fin)}`].filter(Boolean).join(' '))}${L('Sous-traitants, intérimaires', val('soustraitants'))}
    </table>
    <p><strong>Horaires de travail du chantier</strong></p>
    <table class="doc-lines compact"><tr><th>Jour</th><th>Matin</th><th>Après-midi</th></tr>
      ${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(j => { const ok = jours(j.toLowerCase()); return `<tr><td>${j}</td><td>${ok ? esc(val('horMatin', '07 h – 12 h')) : '–'}</td><td>${ok ? esc(val('horAprem', '13 h 30 – 17 h')) : '–'}</td></tr>`; }).join('')}</table>

    ${saut}${titre('IV', 'Mesures prises pour assurer l\'hygiène des conditions de travail et celle des locaux destinés au personnel')}
    <p><strong>Installation du chantier</strong></p><p class="pre">${esc(val('baseVie', BASE_VIE))}</p>
    <p><strong>Déchets de chantier</strong> : ${esc(val('dechets', DECHETS_DEF))}</p>
    <p><strong>Évacuation de nos déchets</strong> : ${esc(val('evacDechets', EVAC_DEF))}</p>

    ${titre('V', 'Mesures spécifiques prises par l\'entreprise destinées à prévenir certains risques spécifiques')}
    <p><strong>Risques produits par d'autres entreprises</strong> – Travaux : ${esc(val('nature', a.nom))}</p>
    <table class="doc-lines compact ppsps-t">${L('Risques', val('risquesAutres', RISQUES_AUTRES_DEF))}${L('Précautions – moyens', val('precautionsAutres', PRECAUTIONS_DEF))}</table>
    ${val('contraintes') ? `<p><strong>Contraintes du site</strong></p><p class="pre">${esc(val('contraintes'))}</p>` : ''}
    ${exig.length ? `<p><strong>Exigences du PGC et dispositions de l'entreprise</strong></p><table class="doc-lines compact"><tr><th>Exigence du coordonnateur</th><th style="width:32%">Disposition de l'entreprise</th></tr>
      ${exig.map(x => `<tr><td>${esc(x.texte)}</td><td>${esc(x.reponse || 'Respectée')}</td></tr>`).join('')}</table>` : ''}

    ${saut}${titre('VI', 'Description des travaux et des modes opératoires de l\'entreprise titulaire du lot produisant des risques pour les autres entreprises')}
    <table class="doc-lines compact"><tr><th>Tâches à accomplir</th><th>Risques</th><th>Mesures prises</th></tr>
      ${(s.modes && s.modes.length ? s.modes : modesProposes(a)).map(m => `<tr><td>${esc(m.tache || '')}</td><td>${esc(m.risques || '')}</td><td>${esc(m.mesures || '')}</td></tr>`).join('')}</table>

    ${titre('VII', 'Dispositions prises pour prévenir les risques liés à l\'intervention de l\'entreprise pour son personnel')}
    <table class="doc-lines compact"><tr><th style="width:24%">Risque</th><th>Mesures de prévention</th><th style="width:22%">EPI</th></tr>
      ${c.risques.map(k => { const r = s.risques[k]; return `<tr><td><strong>${esc(Securite.risque(k)[1])}</strong></td><td class="pre">${esc(r.mesures || '')}</td><td>${esc(r.epi || '')}</td></tr>`; }).join('') || '<tr><td colspan="3">Aucun risque particulier retenu.</td></tr>'}</table>
    <p><strong>EPI obligatoires en permanence :</strong> ${esc(val('epiBase', EPI_BASE))}</p>
    <p><strong>Intervenants</strong></p>
    <table class="doc-lines compact"><tr><th>Nom</th><th>Qualification</th><th>Habilitations valides</th><th>Visite médicale</th></tr>
      ${c.controle.map(x => { const u = Store.get('users', x.userId) || {}, h = Store.all('habilitations').filter(y => y.userId === x.userId && y.cle !== 'visite' && (!y.expire || y.expire >= c.date)).map(y => y.cle);
        return `<tr><td>${esc(u.nom || '')}${u.type === 'interimaire' ? ' (intérim)' : ''}</td><td>${esc((Store.get('mainoeuvre', u.categorieId) || {}).libelle || '')}</td><td>${esc(libHabs(h))}</td><td>${x.visite === 'ok' ? 'à jour' : 'à régulariser'}</td></tr>`; }).join('') || '<tr><td colspan="4">À compléter</td></tr>'}</table>
    ${c.materiel.length ? `<p><strong>Matériel et vérifications</strong></p><table class="doc-lines compact"><tr><th>Matériel</th><th>Catégorie</th><th>Prochain contrôle</th></tr>
      ${c.materiel.map(m => { const e = prochaineEcheance(m); return `<tr><td>${esc(m.designation)}</td><td>${esc(m.categorie)}</td><td>${e ? `${esc(e.libelle)} : ${dateFr(e.prochaine)}` : ''}</td></tr>`; }).join('')}</table>` : ''}
    ${c.produits.length ? `<p><strong>Produits dangereux (FDS jointes, disponibles dans les véhicules)</strong></p><table class="doc-lines compact"><tr><th>Produit</th><th>Dangers</th><th>EPI</th><th>FDS</th></tr>
      ${c.produits.map(p => `<tr><td>${esc(p.nom)}</td><td>${esc((p.pictos || []).map(g => (Securite.PICTOS.find(x => x[0] === g) || [])[1]).filter(Boolean).join(', '))}${p.mentionsH ? ` (${esc(p.mentionsH)})` : ''}</td><td>${esc(p.epi || '')}</td><td>${p.dateFds ? `version du ${dateFr(p.dateFds)}` : p.fdsFichierId ? 'disponible' : 'à obtenir'}</td></tr>`).join('')}</table>` : ''}

    ${saut}${titre('VIII', 'Dispositions en matière de secours et d\'évacuation des blessés')}
    <table class="doc-lines compact ppsps-t">
      ${L('Sauveteurs secouristes du travail', val('sst', c.sst.join(', ')) || 'Aucun')}${L('Trousse de secours, extincteur', val('trousse', 'Trousse de secours et extincteur dans chaque véhicule'))}
      ${L('Point de rassemblement', val('rassemblement'))}${L('Hôpital le plus proche', val('hopital'))}${L('Consignes d\'alerte', val('alerte', CONSIGNES_ALERTE))}</table>
    <p>Voir l'affichette ci-après.</p>
    <div class="signatures"><div>Fait à ${esc(ville || '…')}, le ${dateFr(auj)}<br>${esc(resp.nom || Store.me.nom || '')}, ${esc(val('responsableQualite', 'Responsable des travaux'))}</div><div>Pour ${esc(st.societe || '')}<br>Cachet et signature :</div></div>

    ${saut}${titre('IX', 'Affichette')}
    <div class="ppsps-affiche"><p class="ppsps-titre">EN CAS D'ACCIDENT</p>
      <p><strong>Procédure de secours</strong> : faire cesser le risque · ne pas déplacer la victime, sauf en cas de danger immédiat · protéger la victime.</p>
      <p><strong>Au téléphone</strong> : « Je suis Monsieur… de l'entreprise ${esc(st.societe || '')} · Nous avons un… (accident ou incendie) · Je suis au chantier ${esc(val('operation', a.nom))}, ${esc(val('adresseChantier', site ? fullAddress(site) : ''))} · Nombre de blessés… (saignements, conscient ou inconscient, respire ou non) · Nature de l'accident… » Ne pas raccrocher le premier.</p>
      <p><strong>Pour l'arrivée des secours</strong> : indiquer le point de rencontre${val('rassemblement') ? ` (${esc(val('rassemblement'))})` : ''} et y envoyer une personne pour guider les secours jusqu'au lieu de l'accident.</p>
      <table class="doc-lines compact"><tr><th>Numéros d'appel des secours</th><th>Téléphone fixe</th><th>Portable</th></tr>
        <tr><td>Incendie : pompiers</td><td>${esc(urg.pompiers || '18')}</td><td>${esc(urg.europe || '112')}</td></tr>
        <tr><td>Accident corporel : SAMU ou pompiers</td><td>${esc(urg.samu || '15')} / ${esc(urg.pompiers || '18')}</td><td>${esc(urg.europe || '112')}</td></tr>
        <tr><td>Pour le public : police ou gendarmerie</td><td>17</td><td>112</td></tr>
        ${org.gendarmerie ? `<tr><td colspan="3">${esc(org.gendarmerie)}</td></tr>` : ''}${val('hopital') ? `<tr><td colspan="3">Hôpital : ${esc(val('hopital'))}</td></tr>` : ''}${urg.antipoison ? `<tr><td>Centre antipoison</td><td colspan="2">${esc(urg.antipoison)}</td></tr>` : ''}</table>
      <p><strong>Responsable sur le chantier</strong> : ${esc([resp.nom, resp.tel].filter(Boolean).join(' – '))}${val('coordonnateur') ? ` · <strong>Coordonnateur SPS</strong> : ${esc([val('coordonnateur'), val('coordTel')].filter(Boolean).join(' – '))}` : ''}</p></div>
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

/* ---------- PGC → PPSPS : lecture du plan général de coordination et reprise des informations ---------- */
// Tâches de l'entreprise produisant des risques pour les autres, d'après les risques retenus
function modesProposes(a) {
  const s = a.securite || {}, nat = s.nature || a.nom || 'Installation', rq = Object.keys(s.risques || {});
  const M = { feu: ['Soudure, brasage, meulage des tuyauteries', 'Brûlures, incendie, projections, fumées', 'Permis de feu, écran de protection, extincteur à proximité, surveillance 2 h après les travaux'],
    hauteur: ['Pose des réseaux en hauteur (nacelle, échafaudage)', 'Chute d\'objets et d\'outillage', 'Balisage de la zone au sol, pas de coactivité verticale, casque et EPI'],
    levage: ['Levage et approvisionnement des équipements', 'Chute de charge, écrasement', 'Zone de levage balisée, élingues vérifiées, personnel autorisé, homme-trafic au sol'],
    manutention: ['Approvisionnement et manutention des tubes et équipements', 'Heurts, encombrement des circulations', 'Stockage calé hors circulations, aides à la manutention, évacuation des déchets à l\'avancement'],
    pression: ['Essais de pression et mise en eau des réseaux', 'Projection, fuite, coup de bélier', 'Zone d\'essai balisée, montée en pression progressive, information des autres lots'],
    elec: ['Raccordements électriques des équipements', 'Électrisation', 'Consignation, personnel habilité, balisage des armoires ouvertes'],
    chimique: ['Utilisation de produits (colles, décapants)', 'Inhalation, projections', 'FDS disponibles, ventilation de la zone, interdiction de fumer'],
    frigo: ['Mise en service des équipements frigorifiques', 'Brûlure par le froid, fuite de fluide', 'Personnel avec attestation d\'aptitude, détecteur de fuite, zone ventilée'] };
  const l = rq.filter(k => M[k]).map(k => ({ tache: M[k][0], risques: M[k][1], mesures: M[k][2] }));
  return l.length ? l : [{ tache: nat, risques: 'Chute de matériels et outillages', mesures: 'Balisage de la zone, port du casque et des EPI' }];
}
async function reprendrePgc(a, fichier) {
  try {
    let f = fichier;
    if (!f) {
      const d = docsSecurite(a, 'PGC')[0]; if (!d) return notify('Joignez d\'abord le PGC.');
      const r = await fetch(fileUrl(d.fichierId), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('PGC introuvable');
      f = new File([await r.blob()], d.nom, { type: 'application/pdf' });
    }
    App.toast('Lecture du PGC…');
    const lu = await PdfLecture.lire(f, () => {}, { pagesMax: 60 });
    const r = Pgc.analyser(lu.lignes);
    const s = a.securite || {};
    const champs = [['operation', 'Désignation de l\'opération'], ['adresse', 'Adresse du chantier', 'adresseChantier'], ['coordonnateur', 'Coordonnateur SPS'], ['coordTel', 'Téléphone du coordonnateur'],
      ['coordEmail', 'E-mail du coordonnateur'], ['coordAdresse', 'Adresse du coordonnateur'], ['effectif', 'Effectif moyen'], ['effectifMax', 'Effectif maximum'], ['debut', 'Début des travaux'], ['fin', 'Fin des travaux'],
      ['horaires', 'Horaires', 'horMatin'], ['hopital', 'Hôpital'], ['rassemblement', 'Point de rassemblement'], ['baseVie', 'Base vie']].filter(([k]) => r[k] !== undefined && r[k] !== '');
    const box = Modal.open(`<h2 style="margin-top:0">Reprendre le PGC dans le PPSPS</h2>
      <p class="small muted">${esc(f.name)}${r.reference ? ` · ${esc(r.reference)}` : ''}${r.categorie ? ` · catégorie ${r.categorie}` : ''}${r.duree ? ` · durée ${esc(r.duree)}` : ''}${lu.ocr ? ' · lu par reconnaissance de caractères (vérifiez)' : ''}. Cochez ce qui doit être repris ; vous pourrez tout modifier ensuite.</p>
      <div class="table-wrap"><table class="compact"><tr><th></th><th>Rubrique</th><th>Lu dans le PGC</th><th>Actuellement</th></tr>
        ${champs.map(([k, l, cible]) => { const act = s[cible || k]; return `<tr><td><input type="checkbox" data-pg="${k}" ${act === undefined || act === '' ? 'checked' : ''}></td><td>${esc(l)}</td><td class="small">${esc(['debut', 'fin'].includes(k) ? dateFr(r[k]) : String(r[k]))}</td><td class="small muted">${esc(act === undefined ? '' : String(act))}</td></tr>`; }).join('')}
        ${r.intervenants.length ? `<tr><td><input type="checkbox" data-pg="intervenants" checked></td><td>Intervenants</td><td class="small" colspan="2">${r.intervenants.map(x => `${esc(x.role)} : ${esc(x.societe)}${x.contact ? ` (${esc(x.contact)})` : ''}`).join('<br>')}</td></tr>` : ''}
        ${r.exigences.length ? `<tr><td><input type="checkbox" data-pg="exigences" checked></td><td>Exigences du coordonnateur</td><td class="small" colspan="2">${r.exigences.length} exigence(s) à la charge des entreprises ou de votre lot, à reprendre une par une avec votre disposition</td></tr>` : ''}
        ${r.moyensCommuns ? `<tr><td><input type="checkbox" data-pg="moyens" checked></td><td>Moyens mis en commun</td><td class="small" colspan="2">${r.moyensCommuns.map(esc).join('<br>')}</td></tr>` : ''}
        ${r.risques.length ? `<tr><td></td><td>Risques évoqués</td><td colspan="2">${r.risques.map(k => `<label class="check small"><input type="checkbox" data-pgr="${k}" ${(s.risques || {})[k] ? 'checked disabled' : ''}> ${esc(Securite.risque(k)[1].split(/[:(]/)[0].trim())}</label>`).join(' ')}</td></tr>` : ''}
      </table></div>
      ${!champs.length && !r.exigences.length ? '<p class="warn-text small">Peu d\'informations reconnues : ce PGC est peut-être un scan de mauvaise qualité.</p>' : ''}
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="pg-x">Annuler</button><button id="pg-ok">Reprendre dans le PPSPS</button></div>`, true);
    const $ = q => box.querySelector(q);
    $('#pg-x').onclick = Modal.close;
    $('#pg-ok').onclick = () => {
      const sec = a.securite = a.securite || {}, coche = k => { const c = box.querySelector(`[data-pg="${k}"]`); return c && c.checked; };
      champs.forEach(([k, , cible]) => { if (coche(k)) sec[cible || k] = r[k]; });
      if (coche('intervenants')) sec.intervenants = r.intervenants;
      if (coche('exigences')) sec.exigencesPgc = r.exigences.map(x => { const ex = (sec.exigencesPgc || []).find(y => y.texte === x.texte); return ex || { ...x, reponse: '' }; });
      if (coche('moyens')) sec.contraintes = [sec.contraintes, ...r.moyensCommuns.map(m => `Moyen mis en commun : ${m}`)].filter(Boolean).join('\n');
      const rq = { ...(sec.risques || {}) };
      box.querySelectorAll('[data-pgr]:checked:not(:disabled)').forEach(c => { const x = Securite.risque(c.dataset.pgr); rq[c.dataset.pgr] = { mesures: x[2], epi: x[3] }; });
      sec.risques = rq;
      if (!(sec.modes || []).length) sec.modes = modesProposes(a);
      sec.pgcLu = { date: isoDate(new Date()), nom: f.name, reference: r.reference || '', categorie: r.categorie || '', delai: r.delaiPpsps || '' };
      Store.upsert('affaires', a); Modal.close(); App.render(); App.toast('PGC repris dans le PPSPS : vérifiez puis générez le PDF', 5000);
    };
  } catch (e) { notify('Lecture du PGC : ' + e.message); }
}
