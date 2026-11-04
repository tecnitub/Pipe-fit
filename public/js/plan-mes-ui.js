// Liste des mises en service d'un chantier (fiche chantier au bureau, fiche chantier des compagnons) : construite à partir
// des études reliées (module PlanMes), état suivi par les PV signés, PV ouverts préremplis (valeurs attendues, réseau,
// pression d'épreuve, débits théoriques), points sans PV cochés au bureau, liste imprimable.

const planMesCache = new Map(); // affaireId -> { points, debits }
const pvChantier = (col, affaireId) => Store.all(col).filter(r => r.affaireId === affaireId);
function tachesMes(a) {
  const c = planMesCache.get(a.id) || {};
  const ts = PlanMes.plan({ affaireId: a.id, materiel: (typeof materielChantier !== 'undefined' && materielChantier.get(a.id)) || [], points: c.points || [], debits: c.debits || [],
    pv: { mises: pvChantier('misesEnService', a.id), epreuves: pvChantier('epreuves', a.id), equilibrages: pvChantier('equilibrages', a.id) }, suivi: a.planMes || {} });
  // Listes de points à tester (GTB point à point) : reprises par le PV ouvert depuis la liste
  ts.filter(t => (t.controles || []).length).forEach(t => { try { sessionStorage.setItem(`pf-plan-controles:${t.cle}`, JSON.stringify(t.controles)); } catch (e) { /* stockage indisponible */ } });
  return ts;
}
const BADGE_MES = { aFaire: ['b-info', '○'], enCours: ['b-warn', '◔'], fait: ['b-ok', '✓'], reserves: ['b-warn', '✓'], ko: ['b-bad', '✕'], sansObjet: ['', '–'] };
const ROUTE_PV = { mes: 'mes', epreuve: 'epreuve', equilibrage: 'equilibrage' };
// Filtre de la liste (tout, reste à faire, fait) mémorisé pendant la session
let filtrePlanMes = 'tout';
const RESTE = ['aFaire', 'enCours', 'ko'], FAIT = ['fait', 'reserves'];
// PV signé : repris automatiquement dans le DOE du chantier (annexe F mise en service, annexe G essais)
const annexeDoe = t => (t.nature === 'mes' ? 'F' : t.nature === 'epreuve' ? 'G' : t.nature === 'equilibrage' ? (/hydraulique/i.test(t.libelle) ? 'F' : 'G') : '');
// Fiches vierges à imprimer (une par équipement) : contrôles, valeurs attendues, mesures à relever
function fichesPlanMes(a, taches) {
  const liste = taches.filter(t => t.nature === 'mes').map(t => FichesMes.depuisPoint(t));
  if (!liste.length) return notify('Aucun équipement à mettre en service dans la sélection.');
  const site = a.siteId ? siteOf(a.clientId, a.siteId) : null;
  const doc = FichesMes.html({ objet: `${a.code || ''} – ${a.nom || ''}`, client: clientName(a.clientId), adresse: [site && site.libelle, fullAddress(site || (entreprise(a.clientId).adresses || [])[0])].filter(Boolean).join(' — '), moe: a.moeId ? clientName(a.moeId) : '' }, liste, { societe: { nom: (Store.data.settings || {}).societe || 'TECNITUB' } });
  return PDF.telecharger(doc, `Fiches-mise-en-service-${a.code || a.id}.pdf`.replace(/[^\w.-]+/g, '_')).catch(e => notify(e.message));
}
const attendusTexte = t => (t.attendus || []).map(x => `${x.libelle} ${fmt(x.valeur, x.valeur % 1 ? 2 : 0)} ${x.unite}`).join(' · ');

function planMesHtml(a, mobile) {
  const ts = tachesMes(a), b = PlanMes.bilan(ts), bureau = !mobile && Store.can('write', 'affaires'), charge = planMesCache.has(a.id);
  const ligne = t => {
    const [cls, ic] = BADGE_MES[t.etat] || BADGE_MES.aFaire, route = ROUTE_PV[t.nature];
    const pv = t.pv && route ? `<a class="small" href="#/${route}/${esc(t.pv.id)}">${t.pv.statut === 'Signé' ? `PV ${esc(t.pv.numero)} du ${dateFr(t.pv.date)}` : 'brouillon du PV'}</a>` : '';
    const action = route && (!t.pv || t.pv.statut !== 'Signé') && t.etat !== 'sansObjet' ? `<a class="btn small${t.pv ? ' secondary' : ''}" href="${t.pv ? `#/${route}/${esc(t.pv.id)}` : esc(t.lien)}">${t.pv ? 'Reprendre le PV' : '📋 Faire le PV'}</a>`
      : route && t.etat === 'ko' ? `<a class="btn small secondary" href="${esc(t.lien)}">Refaire</a>` : '';
    const coche = bureau && !route ? `<button type="button" class="small ${t.etat === 'fait' ? 'secondary' : ''}" data-pm-fait="${esc(t.cle)}">${t.etat === 'fait' ? 'Annuler' : '✓ Fait'}</button>` : '';
    const so = bureau && t.etat !== 'fait' && t.etat !== 'reserves' && !t.manuelle ? `<button type="button" class="small secondary" data-pm-so="${esc(t.cle)}" title="Ce point ne concerne pas ce chantier">${t.etat === 'sansObjet' ? 'Rétablir' : 'Sans objet'}</button>` : '';
    const fiche = t.nature === 'mes' && t.etat !== 'sansObjet' && !FAIT.includes(t.etat) ? `<button type="button" class="small secondary" data-pm-fiche="${esc(t.cle)}" title="Fiche à remplir sur papier : contrôles, valeurs attendues, mesures">🖨️ Fiche</button>` : '';
    const doe = t.pv && t.pv.statut === 'Signé' && annexeDoe(t) ? ` · <span class="badge b-ok" title="Le PV signé est repris automatiquement dans le DOE du chantier">📘 DOE annexe ${annexeDoe(t)}</span>` : '';
    const sup = bureau && t.manuelle ? `<button type="button" class="icon" data-pm-sup="${esc(t.cle)}" aria-label="Retirer la tâche">✕</button>` : '';
    return `<li class="pm-${t.etat}"><span class="badge ${cls}" title="${esc(PlanMes.ETATS[t.etat])}">${ic}</span>
      <span class="pm-txt"><strong>${esc(t.libelle)}</strong>${t.detail ? `<br><span class="small muted">${esc(t.detail)}</span>` : ''}
        ${(t.attendus || []).length ? `<br><span class="small">🎯 Attendu : ${esc(attendusTexte(t))}</span>` : ''}
        ${pv || t.note ? `<br><span class="small">${pv}${doe}${t.note ? `${pv ? ' · ' : ''}${esc(t.note)}` : ''}</span>` : ''}</span>
      <span class="pm-act">${action}${fiche}${coche}${so}${sup}</span></li>`;
  };
  const garde = t => filtrePlanMes === 'reste' ? RESTE.includes(t.etat) : filtrePlanMes === 'fait' ? FAIT.includes(t.etat) : true;
  const groupes = PlanMes.GROUPES.map(g => [g, ts.filter(t => t.groupe === g)]).filter(([, l]) => l.length);
  const tuile = (k, v, l, cls) => `<button type="button" class="pm-tuile ${cls}${filtrePlanMes === k ? ' actif' : ''}" data-pm-filtre="${k}"><strong>${v}</strong><span>${l}</span></button>`;
  const reste = ts.filter(t => RESTE.includes(t.etat)).length, signes = ts.filter(t => t.pv && t.pv.statut === 'Signé' && annexeDoe(t)).length;
  const tuiles = ts.length ? `<div class="pm-tuiles">${tuile('reste', reste, `reste à faire${b.enCours ? ` (${b.enCours} en cours)` : ''}`, reste ? 'a-faire' : 'ok')}${tuile('fait', b.faits, `fait${b.reserves ? ` (${b.reserves} avec réserves)` : ''}`, 'ok')}${b.ko ? tuile('reste', b.ko, 'non conforme(s)', 'ko') : ''}${tuile('tout', `${b.pourcent} %`, `avancement · ${signes} PV dans le DOE`, 'neutre')}</div>` : '';
  return `<h${mobile ? 2 : 3}>✅ Mises en service à faire ${ts.length ? `<span class="muted small">${b.faits}/${b.utiles} fait(s)${b.ko ? ` · ${b.ko} non conforme(s)` : ''}</span>` : ''}</h${mobile ? 2 : 3}>
    ${ts.length ? `<div class="pm-barre" title="${b.pourcent} % fait"><i style="width:${b.pourcent}%"></i></div>` : ''}
    ${!mobile ? `<div class="toolbar" style="margin:4px 0 8px">${ts.length ? '<button class="small secondary" id="pm-pdf">🖨️ Liste à imprimer (PDF)</button>' : ''}${ts.some(t => t.nature === 'mes' && RESTE.includes(t.etat)) ? '<button class="small secondary" id="pm-fiches" title="Une fiche par équipement restant à mettre en service : contrôles, valeurs attendues, mesures à relever">📋 Fiches à remplir (PDF)</button>' : ''}${ts.length && bureau ? '<button class="small" id="pm-rapport">📘 Rapport de mise en service</button>' : ''}${bureau ? '<button class="small secondary" id="pm-ajout">+ Ajouter une tâche</button>' : ''}</div>` : ''}
    ${tuiles}
    ${groupes.map(([g, l]) => { const vis = l.filter(garde); return `<h4 class="pm-groupe">${esc(g)} <span class="muted small">${l.filter(t => FAIT.includes(t.etat)).length}/${l.filter(t => t.etat !== 'sansObjet').length}</span></h4>${vis.length ? `<ul class="plan-mes">${vis.map(ligne).join('')}</ul>` : `<p class="small muted">${filtrePlanMes === 'reste' ? '✓ Rien ne reste à faire dans ce groupe.' : 'Rien de fait pour l\'instant.'}</p>`}`; }).join('')
      || `<p class="muted small">${charge ? 'Aucun point de mise en service : reliez une étude à ce chantier (application Études) ; ses calculs, son matériel retenu et ses débits construisent la liste.' : 'Chargement de la liste…'}</p>`}
    ${ts.length && !mobile ? '<p class="small muted">Liste construite à partir des études reliées : réseaux à éprouver, équipements du matériel retenu avec les valeurs attendues des calculs, installations à équilibrer. Les PV s\'ouvrent préremplis ; un PV signé coche le point.</p>' : ''}`;
}

function afficherPlanMes(affaireId) {
  const n = document.querySelector(`#plan-mes[data-affaire="${CSS.escape(affaireId)}"]`), a = Store.get('affaires', affaireId);
  if (!n || !a) return;
  n.innerHTML = planMesHtml(a, n.dataset.mobile === '1');
  bindPlanMes(n, a);
}
async function chargerPlanMes(root, affaireId) {
  if (!root.querySelector('#plan-mes')) return;
  afficherPlanMes(affaireId);
  const q = encodeURIComponent(affaireId);
  try {
    const [points, debits] = await Promise.all([api('GET', `/api/liens/plan-mes?affaireId=${q}`), api('GET', `/api/liens/debits?affaireId=${q}`)]);
    planMesCache.set(affaireId, { points, debits }); HorsLigne.garder(`planmes/${affaireId}`, { points, debits });
  } catch (e) { const c = await HorsLigne.relire(`planmes/${affaireId}`); planMesCache.set(affaireId, c || planMesCache.get(affaireId) || { points: [], debits: [] }); }
  afficherPlanMes(affaireId);
}
function bindPlanMes(z, a) {
  const enreg = (planMes, msg) => { Store.upsert('affaires', { ...Store.get('affaires', a.id), planMes }); afficherPlanMes(a.id); if (msg) App.toast(msg); };
  const qui = () => userName(Store.me.userId) || Store.me.nom || '', auj = isoDate(new Date()), ts = () => tachesMes(Store.get('affaires', a.id));
  z.querySelectorAll('[data-pm-fait]').forEach(b => b.onclick = () => { const t = ts().find(x => x.cle === b.dataset.pmFait); if (t) enreg(PlanMes.marquer(Store.get('affaires', a.id).planMes, t.cle, 'fait', t.etat !== 'fait', qui(), auj)); });
  z.querySelectorAll('[data-pm-so]').forEach(b => b.onclick = () => { const t = ts().find(x => x.cle === b.dataset.pmSo); if (t) enreg(PlanMes.marquer(Store.get('affaires', a.id).planMes, t.cle, 'sansObjet', t.etat !== 'sansObjet', qui(), auj)); });
  z.querySelectorAll('[data-pm-sup]').forEach(b => b.onclick = () => {
    const s = Store.get('affaires', a.id).planMes || {}, id = b.dataset.pmSup.replace(/^man\|/, '');
    enreg({ ...s, manuelles: (s.manuelles || []).filter(m => m.id !== id) });
  });
  const aj = z.querySelector('#pm-ajout');
  if (aj) aj.onclick = async () => {
    const lib = await askValue('Tâche de mise en service (ex. Essai du groupe électrogène, mise en service du traitement d\'eau)', '');
    if (!lib || !lib.trim()) return;
    const s = Store.get('affaires', a.id).planMes || {};
    enreg({ ...s, manuelles: [...(s.manuelles || []), { id: uid(), libelle: lib.trim().slice(0, 200), groupe: PlanMes.GROUPES[3] }] }, 'Tâche ajoutée');
  };
  z.querySelectorAll('[data-pm-filtre]').forEach(b => b.onclick = () => { filtrePlanMes = filtrePlanMes === b.dataset.pmFiltre ? 'tout' : b.dataset.pmFiltre; afficherPlanMes(a.id); });
  z.querySelectorAll('[data-pm-fiche]').forEach(b => b.onclick = () => { const t = ts().find(x => x.cle === b.dataset.pmFiche); if (t) fichesPlanMes(Store.get('affaires', a.id), [t]); });
  const fi = z.querySelector('#pm-fiches');
  if (fi) fi.onclick = () => fichesPlanMes(Store.get('affaires', a.id), ts().filter(t => RESTE.includes(t.etat)));
  const rp = z.querySelector('#pm-rapport');
  if (rp) rp.onclick = () => dialogueRapportMes(Store.get('affaires', a.id));
  const pdf = z.querySelector('#pm-pdf');
  if (pdf) pdf.onclick = () => PDF.telecharger(documentPlanMes(Store.get('affaires', a.id)), `Mises-en-service-${a.code || a.id}.pdf`.replace(/[^\w.-]+/g, '_')).catch(e => notify(e.message));
}
// Liste imprimable : à cocher sur le chantier
function documentPlanMes(a) {
  const ts = tachesMes(a), b = PlanMes.bilan(ts), site = siteOf(a.clientId, a.siteId);
  return `${Doc.entete('pv', 'LISTE DES MISES EN SERVICE', `${esc(a.code || '')} · état au ${dateFr(isoDate(new Date()))}`)}
    <div class="doc-parties"><div>Maître d'ouvrage : <strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)}<br>${esc(fullAddress(site))}` : ''}</div>
      <div>Chantier : <strong>${esc(a.code || '')} – ${esc(a.nom || '')}</strong><br>${b.faits}/${b.utiles} point(s) fait(s)</div></div>
    ${PlanMes.GROUPES.map(g => { const l = ts.filter(t => t.groupe === g && t.etat !== 'sansObjet'); return l.length ? `<h3 class="doc-h">${esc(g)}</h3>
      <table class="doc-lines compact"><tr><th style="width:24px"></th><th>Point</th><th>Valeurs attendues / détail</th><th>PV / date</th><th>Visa</th></tr>
      ${l.map(t => `<tr><td>${['fait', 'reserves'].includes(t.etat) ? '☒' : '☐'}</td><td><strong>${esc(t.libelle)}</strong></td><td class="small">${esc([attendusTexte(t), t.detail].filter(Boolean).join(' — '))}</td>
        <td class="small">${t.pv ? `${esc(t.pv.numero || 'brouillon')} ${dateFr(t.pv.date)}${t.pv.resultat ? ` · ${esc(t.pv.resultat)}` : ''}` : esc(t.note || '')}</td><td></td></tr>`).join('')}</table>` : ''; }).join('')}
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}

/* ---------- Rapport de mise en service final ---------- */
// Synthèse de fin de chantier : avancement, épreuves, équipements (mesures face aux valeurs attendues de l'étude),
// équilibrages, contrôles réglementaires et réserves ; PV signés joints en annexe. Déposé dans les documents du
// chantier (catégorie « Rapport de mise en service »), il ouvre l'annexe F du DOE.
const nbFr = (v, d = 1) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(String(v).replace(',', '.'))) ? '—' : fmt(Number(String(v).replace(',', '.')), d));
function ecartsMes(mises) {
  return mises.flatMap(m => (m.mesures || []).filter(x => x.attendu !== undefined && x.valeur !== '' && x.valeur !== undefined).map(x => ({ m, x, e: PlanMes.ecart(x) })));
}
function documentRapportMes(a, { pv = true } = {}) {
  const ts = tachesMes(a), b = PlanMes.bilan(ts), site = siteOf(a.clientId, a.siteId), signe = r => r.statut === 'Signé';
  const mises = pvChantier('misesEnService', a.id).filter(signe), eps = pvChantier('epreuves', a.id).filter(signe), eqs = pvChantier('equilibrages', a.id).filter(signe);
  const ecarts = ecartsMes(mises), horsTol = ecarts.filter(x => x.e !== null && Math.abs(x.e) > 10);
  const reserves = [...ts.filter(t => ['ko', 'reserves'].includes(t.etat)).map(t => `${t.libelle} : ${PlanMes.ETATS[t.etat].toLowerCase()}${t.pv ? ` (PV ${t.pv.numero})` : ''}`),
    ...mises.flatMap(m => (m.controles || []).filter(c => c.etat === 'Non conforme').map(c => `${m.equipement} — ${c.libelle}${c.obs ? ` : ${c.obs}` : ''}`)),
    ...horsTol.map(x => `${x.m.equipement} — ${x.x.libelle} : ${nbFr(x.x.valeur, 2)} ${x.x.unite || ''} pour ${nbFr(x.x.attendu, 2)} attendus (${x.e > 0 ? '+' : ''}${fmt(x.e, 1)} %)`)];
  const ligneEtat = t => `<tr><td>${['fait', 'reserves'].includes(t.etat) ? '☒' : t.etat === 'sansObjet' ? '–' : '☐'}</td><td>${esc(t.libelle)}${t.detail ? `<br><span class="small">${esc(t.detail)}</span>` : ''}</td><td>${esc(PlanMes.ETATS[t.etat])}</td><td class="small">${t.pv ? `${esc(t.pv.numero || 'brouillon')} du ${dateFr(t.pv.date)}${t.pv.resultat ? ` — ${esc(t.pv.resultat)}` : ''}` : esc(t.note || '')}</td></tr>`;
  // PV signés en annexe : leur corps seulement (l'en-tête de la société est déjà en tête du rapport)
  const annexe = (titre, r, corps) => `<h3 class="doc-h">${titre} n° ${esc(r.numero || '')} du ${dateFr(r.date)}</h3>${corps(r, ctxEssai(r))}`;
  const docPv = pv ? [...eps.map(r => annexe('PV d\'épreuve hydraulique', r, EssaisDoc.epreuve)), ...mises.map(r => annexe('PV de mise en service', r, ESSAIS.mes.corps)), ...eqs.map(r => annexe('Relevé d\'équilibrage', r, ESSAIS.equilibrage.corps))] : [];
  return `${Doc.entete('pv', 'RAPPORT DE MISE EN SERVICE', `${esc(a.code || '')} · ${dateFr(isoDate(new Date()))}`)}
    <div class="doc-parties"><div>Maître d'ouvrage : <strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)}<br>${esc(fullAddress(site))}` : ''}</div>
      <div>Chantier : <strong>${esc(a.code || '')} – ${esc(a.nom || '')}</strong>${a.moeId ? `<br>Maîtrise d'œuvre : ${esc(clientName(a.moeId))}` : ''}</div></div>
    <h3 class="doc-h">Synthèse</h3>
    <table class="doc-lines compact"><tr><th>Points de mise en service</th><th>Faits</th><th>Avec réserves</th><th>Non conformes</th><th>Restant à faire</th><th>Sans objet</th></tr>
      <tr><td>${b.utiles}</td><td>${b.faits - b.reserves}</td><td>${b.reserves}</td><td>${b.ko}</td><td>${b.aFaire + b.enCours}</td><td>${b.sansObjet}</td></tr></table>
    <p>${b.aFaire + b.enCours + b.ko ? `<strong>Mise en service non achevée</strong> : ${b.aFaire + b.enCours} point(s) restant(s)${b.ko ? `, ${b.ko} non conforme(s)` : ''}.` : `<strong>Mise en service achevée</strong>${b.reserves || reserves.length ? ' avec réserves (voir ci-dessous)' : ' sans réserve'}.`}
      ${eps.length} épreuve(s), ${mises.length} PV de mise en service et ${eqs.length} relevé(s) d'équilibrage signés.</p>
    ${PlanMes.GROUPES.map(g => { const l = ts.filter(t => t.groupe === g); return l.length ? `<h3 class="doc-h">${esc(g)}</h3><table class="doc-lines compact"><tr><th style="width:22px"></th><th>Point</th><th>État</th><th>PV / suivi</th></tr>${l.map(ligneEtat).join('')}</table>` : ''; }).join('')}
    ${eps.length ? `<h3 class="doc-h">Épreuves des réseaux</h3><table class="doc-lines compact"><tr><th>PV</th><th>Réseau</th><th class="num">Épreuve (bar)</th><th class="num">Durée</th><th class="num">Chute (bar)</th><th>Résultat</th></tr>
      ${eps.map(r => `<tr><td>${esc(r.numero || '')}</td><td>${esc(r.reseau || '')}</td><td class="num">${nbFr(r.pressionEpreuve, 1)}</td><td class="num">${r.dureeReelle ? `${r.dureeReelle} min` : '—'}</td><td class="num">${nbFr(r.chute, 2)}</td><td>${esc(r.resultat || '')}</td></tr>`).join('')}</table>` : ''}
    ${ecarts.length ? `<h3 class="doc-h">Mesures face aux valeurs attendues de l'étude</h3><table class="doc-lines compact"><tr><th>Équipement</th><th>Mesure</th><th class="num">Attendu</th><th class="num">Mesuré</th><th class="num">Écart</th></tr>
      ${ecarts.map(({ m, x, e }) => `<tr><td>${esc(m.equipement)}</td><td>${esc(x.libelle)}</td><td class="num">${nbFr(x.attendu, 2)} ${esc(x.unite || '')}</td><td class="num">${nbFr(x.valeur, 2)} ${esc(x.unite || '')}</td><td class="num">${e === null ? '—' : `${Math.abs(e) > 10 ? '<strong>' : ''}${e > 0 ? '+' : ''}${fmt(e, 1)} %${Math.abs(e) > 10 ? '</strong>' : ''}`}</td></tr>`).join('')}</table>
      <p class="small">Écart au-delà de ± 10 % en gras : réglage à reprendre ou à justifier.</p>` : ''}
    ${eqs.length ? `<h3 class="doc-h">Équilibrages</h3><table class="doc-lines compact"><tr><th>Relevé</th><th>Installation</th><th class="num">Points</th><th class="num">Conformes</th><th class="num">Écart global</th><th>Résultat</th></tr>
      ${eqs.map(q => { const y = Essais.synthese(q); return `<tr><td>${esc(q.numero || '')}</td><td>${esc(q.installation || '')}</td><td class="num">${y.nb}</td><td class="num">${y.conformes}/${y.mesurees}</td><td class="num">${y.ecartGlobal === null ? '—' : `${fmt(y.ecartGlobal, 1)} %`}</td><td>${esc(q.resultat || y.resultat || '')}</td></tr>`; }).join('')}</table>` : ''}
    <h3 class="doc-h">Réserves et points à lever</h3>${reserves.length ? `<ul>${reserves.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>Aucune.</p>'}
    <div class="signatures"><div>Pour l'entreprise<br><strong>${esc((Store.me.userId && userName(Store.me.userId)) || Store.me.nom || '')}</strong></div><div>Pour le maître d'ouvrage / la maîtrise d'œuvre</div></div>
    ${docPv.length ? `<h3 class="doc-h">Annexes : procès-verbaux signés (${docPv.length})</h3>${docPv.map(d => `<div class="rapport-pv">${d}</div>`).join('')}` : ''}
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}
function dialogueRapportMes(a) {
  const box = Modal.open(`<h2 style="margin-top:0">📘 Rapport de mise en service</h2>
    <p class="small muted">Synthèse : avancement, épreuves, mesures face aux valeurs attendues de l'étude, équilibrages, contrôles réglementaires et réserves.</p>
    <label class="check"><input type="checkbox" id="rm-pv" checked> Joindre les PV signés complets en annexe</label>
    <div class="modal-actions"><button class="secondary" id="rm-dl">Télécharger</button><span style="flex:1"></span><button class="secondary" id="rm-x">Annuler</button><button id="rm-doc">Enregistrer dans les documents du chantier (DOE)</button></div>`);
  const nom = `Rapport-mise-en-service-${a.code || a.id}.pdf`.replace(/[^\w.-]+/g, '_'), opts = () => ({ pv: box.querySelector('#rm-pv').checked });
  box.querySelector('#rm-x').onclick = Modal.close;
  box.querySelector('#rm-dl').onclick = () => PDF.telecharger(documentRapportMes(a, opts()), nom).catch(e => notify(e.message));
  box.querySelector('#rm-doc').onclick = async ev => {
    ev.target.disabled = true;
    try {
      const octets = await PDF.depuisHTML(documentRapportMes(a, opts()), nom.replace(/\.pdf$/, ''));
      const f = await envoyerFichierDocument(new File([octets], nom, { type: 'application/pdf' }));
      const af = Store.get('affaires', a.id), docs = (af.documents || []).slice(), ex = docs.find(d => d.categorie === 'Rapport de mise en service'), date = isoDate(new Date());
      const indice = ex ? String.fromCharCode((ex.indice || 'A').charCodeAt(0) + 1) : 'A';
      if (ex) Object.assign(ex, { anciens: [...(ex.anciens || []), { fichierId: ex.fichierId, indice: ex.indice || 'A', date: ex.date }], fichierId: f.id, nom, mime: f.mime, taille: f.taille, indice, date, par: Store.me.nom });
      else docs.push({ id: uid(), fichierId: f.id, nom, categorie: 'Rapport de mise en service', indice, note: '', mime: f.mime, taille: f.taille, date, par: Store.me.nom, visible: false });
      Store.upsert('affaires', { ...af, documents: docs });
      Modal.close(); App.render(); App.toast(`Rapport de mise en service (indice ${indice}) déposé dans les documents du chantier : il ouvre l'annexe F du DOE`, 5000);
    } catch (e) { ev.target.disabled = false; notify(e.message); }
  };
}
