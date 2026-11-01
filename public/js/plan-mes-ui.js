// Liste des mises en service d'un chantier (fiche chantier au bureau, fiche chantier des compagnons) : construite à partir
// des études reliées (module PlanMes), état suivi par les PV signés, PV ouverts préremplis (valeurs attendues, réseau,
// pression d'épreuve, débits théoriques), points sans PV cochés au bureau, liste imprimable.

const planMesCache = new Map(); // affaireId -> { points, debits }
const pvChantier = (col, affaireId) => Store.all(col).filter(r => r.affaireId === affaireId);
function tachesMes(a) {
  const c = planMesCache.get(a.id) || {};
  return PlanMes.plan({ affaireId: a.id, materiel: (typeof materielChantier !== 'undefined' && materielChantier.get(a.id)) || [], points: c.points || [], debits: c.debits || [],
    pv: { mises: pvChantier('misesEnService', a.id), epreuves: pvChantier('epreuves', a.id), equilibrages: pvChantier('equilibrages', a.id) }, suivi: a.planMes || {} });
}
const BADGE_MES = { aFaire: ['b-info', '○'], enCours: ['b-warn', '◔'], fait: ['b-ok', '✓'], reserves: ['b-warn', '✓'], ko: ['b-bad', '✕'], sansObjet: ['', '–'] };
const ROUTE_PV = { mes: 'mes', epreuve: 'epreuve', equilibrage: 'equilibrage' };
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
    const sup = bureau && t.manuelle ? `<button type="button" class="icon" data-pm-sup="${esc(t.cle)}" aria-label="Retirer la tâche">✕</button>` : '';
    return `<li class="pm-${t.etat}"><span class="badge ${cls}" title="${esc(PlanMes.ETATS[t.etat])}">${ic}</span>
      <span class="pm-txt"><strong>${esc(t.libelle)}</strong>${t.detail ? `<br><span class="small muted">${esc(t.detail)}</span>` : ''}
        ${(t.attendus || []).length ? `<br><span class="small">🎯 Attendu : ${esc(attendusTexte(t))}</span>` : ''}
        ${pv || t.note ? `<br><span class="small">${pv}${t.note ? `${pv ? ' · ' : ''}${esc(t.note)}` : ''}</span>` : ''}</span>
      <span class="pm-act">${action}${coche}${so}${sup}</span></li>`;
  };
  const groupes = PlanMes.GROUPES.map(g => [g, ts.filter(t => t.groupe === g)]).filter(([, l]) => l.length);
  return `<h${mobile ? 2 : 3}>✅ Mises en service à faire ${ts.length ? `<span class="muted small">${b.faits}/${b.utiles} fait(s)${b.ko ? ` · ${b.ko} non conforme(s)` : ''}</span>` : ''}</h${mobile ? 2 : 3}>
    ${ts.length ? `<div class="pm-barre" title="${b.pourcent} % fait"><i style="width:${b.pourcent}%"></i></div>` : ''}
    ${!mobile ? `<div class="toolbar" style="margin:4px 0 8px">${ts.length ? '<button class="small secondary" id="pm-pdf">🖨️ Liste à imprimer (PDF)</button>' : ''}${bureau ? '<button class="small secondary" id="pm-ajout">+ Ajouter une tâche</button>' : ''}</div>` : ''}
    ${groupes.map(([g, l]) => `<h4 class="pm-groupe">${esc(g)} <span class="muted small">${l.filter(t => ['fait', 'reserves'].includes(t.etat)).length}/${l.filter(t => t.etat !== 'sansObjet').length}</span></h4><ul class="plan-mes">${l.map(ligne).join('')}</ul>`).join('')
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
