// Retour du chantier dans l'étude (carte « ↩️ Retour du chantier » de la page de l'étude) :
// - mesures de mise en service / calcul et réglages proposés (MesuresRetour), tableau imprimable ;
// - plaques signalétiques : modèle lu comparé au modèle retenu, n° de série et pose reportés au registre (PlaqueRegistre) ;
// - réserves de conformité levées sur le chantier par les compagnons : cochées dans l'étude (ReservesTerrain) ;
// - fiabilité des modèles retenus d'après les interventions d'entretien de toutes les affaires (RexEquipements, seuil réglable) ;
// - comptages de la GTC importés (CSV, Excel) : bilan réel face au calcul « Énergie annuelle », dérives, fuites (Comptages).
const retourCache = new Map();
let rexCache = null;
const reglagesRetour = et => ({ tolerance: 10, toleranceComptage: 15, seuilPannes: 30, minInstalles: 2, djuReel: '', ...(et.retourChantier || {}) });
// Lignes du matériel retenu (métré de l'étude) : gardées tant que les calculs, le matériel, le registre et les réglages
// sont les mêmes (le métré complet est long à refaire à chaque affichage de la page)
const lignesRetenuesCache = new Map();
const lignesRetenues = et => {
  let cle = '';
  try { cle = JSON.stringify([et.notes, et.materiel, et.equipements]); } catch (e) { cle = ''; }
  const c = lignesRetenuesCache.get(et.id), conf = typeof S !== 'undefined' && S ? S.config : null;
  if (cle && c && c.cle === cle && c.conf === conf) return c.l;
  let l; try { l = MaterielRetenu.lignes(Metre.metre(et).filter(Metre.estEquipement), et.materiel); } catch (e) { l = []; }
  if (cle) lignesRetenuesCache.set(et.id, { cle, conf, l });
  return l;
};
async function chargerRetour(et, forcer) {
  if (!et.affaireId) return null;
  if (!forcer && retourCache.has(et.id)) return retourCache.get(et.id);
  const r = await api('GET', `/api/pf/retour?affaireId=${encodeURIComponent(et.affaireId)}&etudeId=${encodeURIComponent(et.id)}`);
  retourCache.set(et.id, r); return r;
}
async function chargerRex() {
  if (rexCache && Date.now() - rexCache.t < 5 * 60e3) return rexCache.h;
  let h = [];
  try { h = await api('GET', '/api/pf/rex-modeles'); } catch (e) { h = []; }
  rexCache = { t: Date.now(), h: Array.isArray(h) ? h : [] }; return rexCache.h;
}
const alertesRex = (et, h) => { const g = reglagesRetour(et); return typeof RexEquipements === 'undefined' ? [] : RexEquipements.alertes(lignesRetenues(et), h, { seuil: (Number(g.seuilPannes) || 30) / 100, minInstalles: Number(g.minInstalles) || 1 }); };

function carteRetourChantier(et) {
  if (et.modele || typeof MesuresRetour === 'undefined') return '';
  const c = (et.comptages || {}).releves || [];
  return `<div class="outil-ligne retour-chantier" id="carte-retour"><div class="outil-txt">↩️ <strong>Retour du chantier</strong> ${et.affaireId ? '<span class="muted">: mesures, plaques, réserves et consommations relevées sur le chantier</span>' : '<span class="muted">— étude non reliée à un chantier de Pipe-Fit (fiche de l\'étude, « Affaire Pipe-Fit »)</span>'}</div>
    <div class="outil-actions"><button class="secondaire petit" id="rc-mesures" ${et.affaireId ? '' : 'disabled'}>📏 Mesures et réglages</button> <button class="secondaire petit" id="rc-plaques" ${et.affaireId ? '' : 'disabled'}>🏷️ Plaques et registre</button>
    <button class="secondaire petit" id="rc-reserves" ${et.affaireId ? '' : 'disabled'}>🛡️ Réserves levées</button> <button class="secondaire petit" id="rc-fiabilite">⚠️ Fiabilité des modèles</button> <button class="secondaire petit" id="rc-comptages">📈 Comptages${c.length ? ` (${c.length})` : ''}</button></div>
    <div id="rex-alertes"></div></div>`;
}
function lierRetourChantier(root, et) {
  const on = (s, f) => { const b = root.querySelector(s); if (b) b.onclick = f; };
  on('#rc-mesures', () => dialogueMesures(et)); on('#rc-plaques', () => dialoguePlaques(et)); on('#rc-reserves', () => dialogueReservesLevees(et));
  on('#rc-fiabilite', () => dialogueFiabilite(et)); on('#rc-comptages', () => dialogueComptages(et));
  // Alerte à l'ouverture de l'étude : modèle retenu au taux de pannes élevé sur les autres affaires
  // (après l'affichage : le métré n'est pas refait avant que la page soit visible)
  chargerRex().then(h => {
    const z = document.querySelector('#rex-alertes');
    if (!z || !(h || []).length || !lignesRetenues(et).some(l => l.reference)) return;
    const a = alertesRex(et, h);
    if (z && a.length) z.innerHTML = `<p class="alerte attention petit">⚠️ ${a.length} modèle(s) retenu(s) avec un taux de pannes élevé sur les affaires précédentes : ${a.map(x => `<strong>${esc(x.designation)}</strong> — ${esc(x.texte)}`).join(' ; ')}</p>`;
  }).catch(() => {});
}
const chargement = async (et, titre, rendre) => {
  const b = Modal.open(`<h2>${titre}</h2><p class="muted">Lecture du chantier dans Pipe-Fit…</p>`); b.classList.add('large');
  let r;
  try { r = await chargerRetour(et, true); } catch (e) { b.innerHTML = `<h2>${titre}</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="x">Fermer</button></div>`; b.querySelector('#x').onclick = Modal.close; return; }
  rendre(b, r || {});
};
const nfR = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pct = v => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${nfR(v, 1)} %`);
const nomFichier = (p, et) => `${p}_${String(et.objet).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 40)}.pdf`;

/* ---------- 6. Mesures / calcul et réglages proposés ---------- */
function dialogueMesures(et) {
  chargement(et, '📏 Mesures de mise en service et réglages', (b, d) => {
    const dessiner = () => {
      const g = reglagesRetour(et);
      let res;
      try { contexteEtude = et; res = MesuresRetour.comparer({ et, L: Liens, equilibrages: d.equilibrages || [], mises: d.mises || [], tolerance: g.tolerance }); } catch (e) { res = { lignes: [], reglages: [], bilan: { comparees: 0, conformes: 0, horsTolerance: 0 }, tolerance: g.tolerance }; }
      b.innerHTML = `<h2>📏 Mesures de mise en service et réglages</h2>
        <p class="petit">${(d.equilibrages || []).length} relevé(s) d'équilibrage et ${(d.mises || []).length} PV de mise en service du chantier : ${res.bilan.comparees} mesure(s) comparée(s) aux valeurs calculées, <strong>${res.bilan.horsTolerance} hors tolérance</strong>.
          <label class="ligne-case">Tolérance ± <input type="number" id="mr-tol" min="1" max="50" step="1" value="${esc(g.tolerance)}" style="width:4.5em"> %</label></p>
        <div style="max-height:52vh;overflow:auto">
          <h3>Réglages proposés <span class="compte">${res.reglages.length}</span></h3>
          ${res.reglages.length ? `<table class="liste compact petit"><tr><th>Niveau</th><th>Organe</th><th>Écart</th><th>Actuel</th><th>Proposé</th><th>Méthode</th></tr>${res.reglages.map(x => `<tr><td>${esc(MesuresRetour.NIVEAUX[x.niveau] || x.niveau)}</td><td>${esc(x.organe)}</td><td>${pct(x.ecart)}</td><td>${esc(x.actuel)}</td><td><strong>${esc(x.propose)}</strong></td><td class="muted">${esc(x.detail)}</td></tr>`).join('')}</table>` : '<p class="muted">Aucun réglage à reprendre.</p>'}
          <h3>Mesuré / calculé <span class="compte">${res.lignes.length}</span></h3>
          ${res.lignes.length ? `<table class="liste compact petit"><tr><th>Niveau</th><th>Repère</th><th>Désignation</th><th>Calculé</th><th>Mesuré</th><th>Écart</th><th>Source</th></tr>${res.lignes.map(l => `<tr${l.conforme === false ? ' class="hors-tolerance"' : ''}><td>${esc(MesuresRetour.NIVEAUX[l.niveau] || l.niveau)}</td><td>${esc(l.repere)}</td><td>${esc(l.libelle)}</td><td>${nfR(l.calcule, l.calcule >= 100 ? 0 : 2)} ${esc(l.unite)}</td><td>${nfR(l.mesure, l.mesure >= 100 ? 0 : 2)} ${esc(l.unite)}</td><td>${l.conforme === false ? `<span class="badge erreur">${pct(l.ecart)}</span>` : pct(l.ecart)}</td><td class="muted">${esc(l.source)}</td></tr>`).join('')}</table>`
            : '<p class="muted">Aucune mesure de débit ou de pression avec une valeur calculée : les relevés d\'équilibrage et les PV de mise en service se remplissent dans Pipe-Fit (appli des compagnons).</p>'}
        </div>
        <div class="actions"><button class="secondaire" id="mr-x">Fermer</button><button id="mr-pdf" ${res.lignes.length ? '' : 'disabled'}>🖨️ Tableau « Réglages proposés » (PDF)</button></div>`;
      b.querySelector('#mr-x').onclick = () => { b.classList.remove('large'); Modal.close(); };
      b.querySelector('#mr-tol').onchange = e => { const v = Number(e.target.value); if (v > 0 && v <= 50) { et.retourChantier = { ...reglagesRetour(et), tolerance: v }; enregistrer(et); } dessiner(); };
      b.querySelector('#mr-pdf').onclick = async () => {
        try { const bytes = await PDF.depuisHTML(pourPdf(MesuresRetour.html(et, res, { societe: (S.config || {}).societe, date: dateFr(aujourdhui()) })), 'Réglages proposés', null, { margeHaut: 36, margeBas: 36 }); enregistrerFichier(b, nomFichier('Reglages_proposes', et), bytes, 'application/pdf'); }
        catch (e) { toast(`PDF impossible : ${e.message}`, 6000); }
      };
    };
    dessiner();
  });
}

/* ---------- 7. Plaques signalétiques → registre ---------- */
function dialoguePlaques(et) {
  chargement(et, '🏷️ Plaques signalétiques et registre', (b, d) => {
    const lignes = lignesRetenues(et), suivis = d.suivis || [];
    const vues = suivis.map(s => ({ s, l: lignes.find(x => x.cle === s.cle) })).filter(x => x.l && (x.s.plaque || x.s.serie || x.s.poseLe));
    const etat = x => (x.s.plaque ? PlaqueRegistre.comparer(x.l, x.s.plaque) : null);
    const subs = vues.filter(x => (etat(x) || {}).etat === 'substitution').length;
    b.innerHTML = `<h2>🏷️ Plaques signalétiques et registre</h2>
      <p class="petit">${vues.length} équipement(s) posé(s) ou photographié(s) sur le chantier${subs ? ` — <strong class="erreur">${subs} substitution(s)</strong> : modèle de la plaque différent du modèle retenu, à faire valider par le client (fiche du chantier de Pipe-Fit)` : ''}.</p>
      <div style="max-height:50vh;overflow:auto">${vues.length ? `<table class="liste compact petit"><tr><th>Équipement</th><th>Modèle retenu</th><th>Plaque</th><th>N° de série</th><th>Posé le</th><th>En service le</th></tr>
        ${vues.map(x => { const c = etat(x); return `<tr><td>${esc(x.l.designation)}</td><td>${esc([x.l.fabricant, x.l.reference].filter(Boolean).join(' '))}</td><td>${c ? `<span class="badge ${c.etat === 'substitution' ? 'erreur' : c.etat === 'conforme' ? 'ok' : ''}">${esc({ substitution: '⚠️ substitution', conforme: '✓ conforme', partiel: 'à vérifier', nonLu: 'non lue' }[c.etat])}</span><br>${esc(c.lu)}` : '<span class="muted">pas de photo lue</span>'}</td>
          <td>${esc(x.s.serie || '')}</td><td>${dateFr(x.s.poseLe)}</td><td>${dateFr(x.s.mesLe)}</td></tr>`; }).join('')}</table>` : '<p class="muted">Aucune pose ni photo de plaque enregistrée sur le chantier pour cette étude.</p>'}</div>
      <p class="petit muted">« Compléter le registre » ajoute à chaque modèle du registre ses unités posées (n° de série, dates de pose et de mise en service, plaque lue) ; le DOE reprend les mêmes informations dans la fiche de chaque équipement.</p>
      <div class="actions"><button class="secondaire" id="pl-x">Fermer</button><button id="pl-ok" ${vues.length ? '' : 'disabled'}>Compléter le registre</button></div>`;
    b.querySelector('#pl-x').onclick = () => { b.classList.remove('large'); Modal.close(); };
    b.querySelector('#pl-ok').onclick = () => {
      const r = PlaqueRegistre.versRegistre(et, lignes, suivis);
      if (r.maj) enregistrer(et);
      toast(`${r.maj} unité(s) reportée(s) au registre${r.alertes.length ? ` · ${r.alertes.length} substitution(s) signalée(s)` : ''}${r.confirmations.length ? ` · ${r.confirmations.length} plaque(s) conforme(s)` : ''}${r.sansModele.length ? ` · ${r.sansModele.length} équipement(s) sans modèle au registre` : ''}`, 7000);
      b.classList.remove('large'); Modal.close(); App.render();
    };
  });
}

/* ---------- 8. Réserves levées sur le chantier ---------- */
function dialogueReservesLevees(et) {
  chargement(et, '🛡️ Réserves levées sur le chantier', (b, d) => {
    const lv = ((d.reserves || {}).levees) || [], af = ((d.reserves || {}).affectees) || [], s = et.reservesConformite || {};
    let liste = []; try { contexteEtude = et; liste = AnnexesExploitation.reserves(et, Liens); } catch (e) { liste = []; }
    const texte = cle => (liste.find(x => x.cle === cle) || {}).texte || cle, nouvelles = lv.filter(l => !(s[l.cle] && s[l.cle].le));
    b.innerHTML = `<h2>🛡️ Réserves levées sur le chantier</h2>
      <p class="petit">Réserves de conformité de l'étude reprises dans Pipe-Fit et affectées aux compagnons : ${af.length} en cours, ${lv.length} levée(s) dont <strong>${nouvelles.length} à cocher</strong> dans l'étude.</p>
      <div style="max-height:50vh;overflow:auto"><table class="liste compact petit"><tr><th>Réserve</th><th>État sur le chantier</th><th>Photo</th></tr>
        ${lv.map(l => `<tr><td>${esc(texte(l.cle))}</td><td>levée le ${dateFr(l.le)}${l.par ? ` par ${esc(l.par)}` : ''}<br><span class="muted">${esc(l.obs)}</span>${s[l.cle] && s[l.cle].le ? ' <span class="badge ok">cochée</span>' : ''}</td><td>${l.photo ? `<a href="/api/pf/fichier/${encodeURIComponent(l.photo)}" target="_blank" rel="noopener">📷</a>` : ''}</td></tr>`).join('')}
        ${af.map(l => `<tr><td>${esc(texte(l.cle))}</td><td>réserve n° ${esc(l.numero)} à lever${l.echeance ? ` avant le ${dateFr(l.echeance)}` : ''}</td><td></td></tr>`).join('')}
        ${lv.length || af.length ? '' : '<tr><td colspan="3" class="muted">Aucune réserve de l\'étude reprise sur le chantier (Pipe-Fit → Réserves et réception → « Réserves à lever par les compagnons »).</td></tr>'}</table></div>
      <div class="actions"><button class="secondaire" id="rl-x">Fermer</button><button id="rl-ok" ${nouvelles.length ? '' : 'disabled'}>Cocher les ${nouvelles.length} réserve(s) levée(s)</button></div>`;
    b.querySelector('#rl-x').onclick = () => { b.classList.remove('large'); Modal.close(); };
    b.querySelector('#rl-ok').onclick = () => {
      const n = ReservesTerrain.appliquerEtude(et, lv, AnnexesExploitation.cocher);
      if (n) enregistrer(et);
      toast(`${n} réserve(s) de conformité cochée(s) (levées sur le chantier) ; le DOE reprend la levée.`, 6000); b.classList.remove('large'); Modal.close(); App.render();
    };
  });
}

/* ---------- 9. Fiabilité des modèles retenus ---------- */
async function dialogueFiabilite(et) {
  const b = Modal.open('<h2>⚠️ Fiabilité des modèles</h2><p class="muted">Lecture des contrats d\'entretien dans Pipe-Fit…</p>'); b.classList.add('large');
  rexCache = null;
  const h = await chargerRex(), lignes = lignesRetenues(et);
  const dessiner = () => {
    const g = reglagesRetour(et), a = alertesRex(et, h), retenus = new Set(lignes.map(l => RexEquipements.modele(l.fabricant, l.reference)));
    b.innerHTML = `<h2>⚠️ Fiabilité des modèles</h2>
      <p class="petit">Interventions des contrats d'entretien (pannes, pièces changées) de toutes les affaires, rattachées aux équipements par n° de série ou repère. Alerte quand un modèle retenu dans cette étude atteint le seuil.
        <label class="ligne-case">Seuil <input type="number" id="fb-seuil" min="5" max="300" step="5" value="${esc(g.seuilPannes)}" style="width:4.5em"> % de pannes par équipement installé</label>
        <label class="ligne-case">sur au moins <input type="number" id="fb-min" min="1" max="50" step="1" value="${esc(g.minInstalles)}" style="width:3.5em"> équipement(s) en service</label></p>
      ${a.length ? `<p class="alerte attention">${a.map(x => `<strong>${esc(x.designation)}</strong> — ${esc(x.texte)}`).join('<br>')}</p>` : '<p class="alerte ok petit">Aucun modèle retenu au-dessus du seuil.</p>'}
      <div style="max-height:42vh;overflow:auto"><table class="liste compact petit"><tr><th>Modèle</th><th>En service</th><th>Affaires</th><th>Pannes</th><th>Taux</th><th>Par an</th><th>Pièces changées</th></tr>
        ${h.filter(x => x.installes || x.pannes).slice(0, 80).map(x => `<tr${retenus.has(x.modele) ? ' class="surligne"' : ''}><td>${esc([x.fabricant, x.reference].filter(Boolean).join(' '))}${retenus.has(x.modele) ? ' <span class="badge">retenu ici</span>' : ''}</td><td>${x.installes}</td><td>${x.affaires}</td><td>${x.pannes}</td><td>${x.taux === null ? '—' : `${Math.round(x.taux * 100)} %`}</td><td>${x.tauxAnnuel === null ? '—' : nfR(x.tauxAnnuel, 2)}</td><td class="muted">${esc(x.pieces.map(p => `${p.designation} × ${p.qte}`).join(', '))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucun historique : les interventions se saisissent dans le contrat d\'entretien du chantier (Pipe-Fit).</td></tr>'}</table></div>
      <div class="actions"><button id="fb-x">Fermer</button></div>`;
    b.querySelector('#fb-x').onclick = () => { b.classList.remove('large'); Modal.close(); App.render(); };
    const maj = (k, el, min, max) => { const v = Number(el.value); if (v >= min && v <= max) { et.retourChantier = { ...reglagesRetour(et), [k]: v }; enregistrer(et); } dessiner(); };
    b.querySelector('#fb-seuil').onchange = e => maj('seuilPannes', e.target, 5, 300);
    b.querySelector('#fb-min').onchange = e => maj('minInstalles', e.target, 1, 50);
  };
  dessiner();
}

/* ---------- 10. Comptages de la GTC → bilan réel ---------- */
function dialogueComptages(et) {
  const b = Modal.open('<div id="cp-c"></div>'); b.classList.add('large');
  const dessiner = () => {
    const g = reglagesRetour(et), rel = (et.comptages || {}).releves || [];
    let prev = [], ctx = {}, bl = null;
    try { contexteEtude = et; prev = Comptages.prevus(et, Liens); ctx = Comptages.contexte(et, Liens); bl = rel.length ? Comptages.bilan({ releves: rel, prevus: prev, ctx, tolerance: g.toleranceComptage, djuReel: g.djuReel }) : null; } catch (e) { bl = null; }
    b.querySelector('#cp-c').innerHTML = `<h2>📈 Comptages de la GTC — bilan réel</h2>
      <p class="petit">Relevés des compteurs (CSV ou Excel : date, compteur ou repère, index ou consommation) comparés aux compteurs prévus par la GTC (${prev.length ? esc(prev.map(p => p.rep).join(', ')) : 'aucun : cochez « comptage par usage » dans l\'armoire de régulation'}) et au calcul « Énergie annuelle »${ctx.energie ? ` (solution « ${esc(ctx.energie.solution)} »)` : ' (absent de l\'étude : pas de prévu)'}.</p>
      <p class="petit"><label class="btn secondaire petit">📥 Importer des relevés<input type="file" id="cp-f" accept=".csv,.txt,.xlsx" hidden></label> ${rel.length ? `${rel.length} relevé(s) du ${dateFr(rel.map(x => x.date).sort()[0])} au ${dateFr(rel.map(x => x.date).sort().slice(-1)[0])} <button class="secondaire petit" id="cp-vider">Effacer</button>` : ''}
        <label class="ligne-case">Tolérance ± <input type="number" id="cp-tol" min="1" max="80" value="${esc(g.toleranceComptage)}" style="width:4em"> %</label>
        <label class="ligne-case">DJU réels de la période <input type="number" id="cp-dju" min="0" step="1" value="${esc(g.djuReel)}" placeholder="prorata" style="width:6em"></label></p>
      ${bl ? `${bl.alertes.length ? `<div class="petit">${bl.alertes.map(a => `<p class="alerte ${a.niveau === 'erreur' ? 'erreur' : a.niveau === 'attention' ? 'attention' : ''}">${esc(a.texte)}</p>`).join('')}</div>` : '<p class="alerte ok petit">Consommations dans la tolérance, pas de dérive ni de fuite détectée.</p>'}
        <div style="max-height:36vh;overflow:auto"><table class="liste compact petit"><tr><th>Compteur</th><th>Usage</th><th>Période</th><th>Réel</th><th>Prévu</th><th>Écart</th><th>Base du prévu</th></tr>
          ${bl.parUsage.map(x => `<tr${x.hors ? ' class="hors-tolerance"' : ''}><td>${esc(x.compteur)}${x.prevuGtc ? '' : ' <span class="badge">hors GTC</span>'}</td><td>${esc(x.libelle)}</td><td>${dateFr(x.du)} → ${dateFr(x.au)} (${x.jours} j)</td><td>${nfR(x.reel, x.unite === 'm³' ? 2 : 0)} ${esc(x.unite)}</td><td>${x.prevu === null ? '—' : `${nfR(x.prevu, x.unite === 'm³' ? 2 : 0)} ${esc(x.unite)}`}</td><td>${x.hors ? `<span class="badge erreur">${pct(x.ecart)}</span>` : pct(x.ecart)}</td><td class="muted">${esc(x.base)}</td></tr>`).join('')}</table></div>
        ${bl.anomalies.length ? `<p class="petit muted">${bl.anomalies.map(esc).join('<br>')}</p>` : ''}` : '<p class="muted">Aucun relevé importé.</p>'}
      <p class="petit muted">Prévu ramené à la période (prorata des jours ; chauffage corrigé des DJU réels s'ils sont saisis). Compteurs thermiques comparés aux besoins utiles, gaz et électricité aux consommations de la solution ; gaz en m³ converti à 11,2 kWh/m³ (PCS indicatif). Fuite : appoint journalier au-dessus de 1 % du volume du réseau, ou cumul annualisé au-dessus du seuil du traitement d'eau.</p>
      <div class="actions"><button id="cp-x">Fermer</button></div>`;
    const z = b.querySelector('#cp-c');
    z.querySelector('#cp-x').onclick = () => { b.classList.remove('large'); Modal.close(); App.render(); };
    const reg = (k, v) => { et.retourChantier = { ...reglagesRetour(et), [k]: v }; enregistrer(et); dessiner(); };
    z.querySelector('#cp-tol').onchange = e => { const v = Number(e.target.value); if (v > 0 && v <= 80) reg('toleranceComptage', v); };
    z.querySelector('#cp-dju').onchange = e => reg('djuReel', e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0));
    const vd = z.querySelector('#cp-vider'); if (vd) vd.onclick = () => { et.comptages = { releves: [] }; enregistrer(et); dessiner(); };
    z.querySelector('#cp-f').onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const rows = /\.xlsx$/i.test(f.name) ? (await XLSX.read(await f.arrayBuffer())).sort((a, c) => c.rows.length - a.rows.length)[0].rows : Comptages.lireCsv(await f.text());
        const l = Comptages.lire(rows);
        if (!l.releves.length) return toast(`Aucun relevé lu dans ${f.name}${l.erreurs.length ? ` : ${l.erreurs[0]}` : ''}`, 7000);
        const vus = new Set(l.releves.map(x => `${x.compteur}|${x.date}`)), avant = ((et.comptages || {}).releves || []).filter(x => !vus.has(`${x.compteur}|${x.date}`));
        et.comptages = { releves: [...avant, ...l.releves].sort((a, c) => a.compteur.localeCompare(c.compteur) || a.date.localeCompare(c.date)).slice(-3000), importe: { nom: f.name, le: aujourdhui() } };
        enregistrer(et); toast(`${l.releves.length} relevé(s) importé(s)${l.erreurs.length ? ` · ${l.erreurs.length} ligne(s) ignorée(s)` : ''}`, 5000); dessiner();
      } catch (er) { toast(`Import impossible : ${er.message}`, 6000); }
    };
  };
  dessiner();
}
