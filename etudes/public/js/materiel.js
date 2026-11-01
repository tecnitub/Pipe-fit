// Matériel retenu de l'étude : fabricant et référence exacte de chaque équipement dimensionné, statut de validation par
// le client / la maîtrise d'œuvre, liste à faire valider (PDF, CSV). Les références passent dans le métré et le devis,
// et dans le résumé envoyé à Pipe-Fit (fiche du chantier au bureau, appli des compagnons).
function lignesMateriel(et) {
  let postes = [];
  try { postes = Metre.metre(et).filter(Metre.estEquipement); } catch (e) { postes = []; }
  return MaterielRetenu.lignes(postes, et.materiel);
}
const BADGE_STATUT = { 'À choisir': '', 'À soumettre': '', 'Soumis au client': 'info', Validé: 'ok', 'Validé avec réserves': 'ok', Refusé: 'erreur' };
const badgeStatut = s => `<span class="badge ${BADGE_STATUT[s] || ''}">${esc(s)}</span>`;

function carteMateriel(et) {
  const ls = lignesMateriel(et);
  if (!ls.length) return '';
  const b = MaterielRetenu.bilan(ls), relance = ls.filter(l => MaterielRetenu.aRelancer(l, aujourdhui())).length;
  return `<div class="carte petit">🏷️ <strong>Matériel retenu</strong> : ${b.total - b.aChoisir}/${b.total} référence(s) choisie(s) · ${b.valides} validée(s) par le client${b.soumis ? ` · ${b.soumis} soumise(s)` : ''}${relance ? ` · <span class="manque">${relance} sans réponse depuis plus de 15 jours : relancer le client</span>` : ''}${b.aSoumettre ? ` · ${b.aSoumettre} à soumettre` : ''}${b.refuses ? ` · <span class="manque">${b.refuses} refusée(s)</span>` : ''}${b.orphelins ? ` · <span class="manque">${b.orphelins} à reprendre</span>` : ''}
    <button class="secondaire petit" id="materiel2">Choisir / faire valider</button></div>`;
}

// Suivi du chantier lu dans Pipe-Fit (soumission envoyée depuis le CRM, pose, mise en service, photos de la plaque)
const suiviChantier = new Map();
async function chargerSuivi(et) {
  if (!et.affaireId) return [];
  try { const s = await api('GET', `/api/pf/materiel-suivi?etudeId=${encodeURIComponent(et.id)}`); suiviChantier.set(et.id, s); return s; } catch (e) { return suiviChantier.get(et.id) || []; }
}
const chantierHtml = s => (s ? [s.mesLe ? `✅ en service le ${dateFr(s.mesLe)}` : s.poseLe ? `🔧 posé le ${dateFr(s.poseLe)}` : '', (s.photos || []).length ? `📷 ${s.photos.length}` : ''].filter(Boolean).join(' · ') : '');

// Fiches techniques de la bibliothèque Pipe-Fit retrouvées d'après le fabricant et la référence exacte
const fichesBiblio = new Map(); // étude → { sig, parCle: Map(cle → fiche) }
async function chargerFichesBiblio(et, ls) {
  const dem = ls.filter(l => l.reference && !l.orphelin).map(l => ({ cle: l.cle, fabricant: l.fabricant, reference: l.reference })), sig = JSON.stringify(dem);
  const ex = fichesBiblio.get(et.id);
  if (ex && ex.sig === sig) return false;
  fichesBiblio.set(et.id, { sig, parCle: (ex || {}).parCle || new Map() });
  if (!dem.length) return false;
  try { const r = await api('POST', '/api/pf/fiches/trouver', { demandes: dem }); fichesBiblio.set(et.id, { sig, parCle: new Map(r.filter(x => x.fiche).map(x => [x.cle, x.fiche])) }); return true; } catch (e) { return false; }
}
const ficheDe = (et, l) => ((fichesBiblio.get(et.id) || {}).parCle || new Map()).get(l.cle) || null;
const urlFicheBiblio = f => `/api/pf/fichier/${encodeURIComponent(f.fichierId)}`;

function dialogueMateriel(et) {
  et.materiel = et.materiel || {};
  const box = Modal.open('');
  box.classList.add('large');
  // Suivi du chantier : les lignes envoyées au client depuis Pipe-Fit passent « soumis au client »
  chargerSuivi(et).then(s => { const n = MaterielRetenu.reprendreSuivi(et.materiel, lignesMateriel(et), s, aujourdhui()); if (n) { enregistrer(et); toast(`${n} ligne(s) envoyée(s) au client depuis Pipe-Fit : passées « soumis au client »`, 5000); } if (box.isConnected) rendu(); });
  const fermer = () => { box.classList.remove('large'); Modal.close(); App.render(); };
  const rendu = () => {
    const ls = lignesMateriel(et), b = MaterielRetenu.bilan(ls), chapitres = [...new Set(ls.map(l => l.chapitre))], suivi = new Map((suiviChantier.get(et.id) || []).map(s => [s.cle, s]));
    const relance = ls.filter(l => MaterielRetenu.aRelancer(l, aujourdhui())), catalogue = ((S.config || {}).catalogues || {}).materiel || [];
    // Contrôle face au CCTP (inventaire du dossier de consultation) : marque prescrite, débit, puissance, volume, acoustique
    const controleHtml = l => {
      if (!(et.inventaire || []).length || l.libre) return '';
      const r = CatalogueMateriel.controleCctp(l, et.inventaire, catalogue);
      if (!r.equipement) return '';
      const cr = InventaireCVC.caracTexte(r.equipement.carac || {});
      return `<div class="petit muted" title="${esc(r.equipement.prescrit || '')}">CCTP : ${esc(r.equipement.designation.slice(0, 50))}${r.equipement.prescrit ? ` — ${esc(r.equipement.prescrit.slice(0, 80))}` : ''}${cr ? `<br>${esc(cr)}` : ''}</div>${r.alertes.map(a => `<div class="petit ${a.niveau === 'erreur' ? 'manque' : a.niveau === 'alerte' ? 'avert' : 'muted'}">${a.niveau === 'erreur' ? '⛔' : a.niveau === 'alerte' ? '⚠️' : 'ℹ️'} ${esc(a.texte)}</div>`).join('')}`;
    };
    const nonConformes = ls.filter(l => !l.libre && (et.inventaire || []).length && CatalogueMateriel.controleCctp(l, et.inventaire, catalogue).alertes.some(a => a.niveau === 'erreur')).length;
    box.innerHTML = `<h2>🏷️ Matériel retenu</h2>
      <p class="muted petit">Pour chaque équipement dimensionné par l'étude : le fabricant et la <strong>référence exacte</strong> choisis. La liste se fait valider par le client ou la maîtrise d'œuvre (PDF), le statut est suivi ligne par ligne. Les références passent dans le métré et le devis, et sur la fiche du chantier dans Pipe-Fit (bureau et appli des compagnons : les gars voient ce qu'ils doivent poser et si c'est validé).</p>
      <p class="petit">${b.total - b.aChoisir}/${b.total} référence(s) choisie(s) · ${b.valides} validée(s) · ${b.soumis} soumise(s) · ${b.aSoumettre} à soumettre${b.refuses ? ` · <span class="manque">${b.refuses} refusée(s) : choisir une autre référence</span>` : ''}${nonConformes ? ` · <span class="manque">⛔ ${nonConformes} non conforme(s) au CCTP</span>` : ''}${(() => { const avec = ls.filter(l => l.reference && !l.orphelin), sans = avec.filter(l => !ficheDe(et, l) && !l.fiche).length; return avec.length ? ` · 📄 ${avec.length - sans}/${avec.length} fiche(s) technique(s)${sans ? ` <span class="avert">(${sans} à ajouter à la bibliothèque Pipe-Fit)</span>` : ''}` : ''; })()}${relance.length ? ` · <span class="manque">${relance.length} sans réponse depuis plus de 15 jours : relancer (depuis la fiche du chantier dans Pipe-Fit, « ✉️ Envoyer au client »)</span>` : ''}</p>
      <div class="defile metre"><table class="liste compact"><thead><tr><th>Équipement</th><th>Qté</th>${catalogue.length ? '<th>Catalogue</th>' : ''}<th>Fabricant</th><th>Référence exacte</th><th>Statut</th><th>Soumis le</th><th>Validé le</th><th>Observations du client</th><th>Fiche technique (lien)</th><th>Chantier</th><th></th></tr></thead><tbody>
      ${chapitres.map(ch => `<tr class="total"><td colspan="${catalogue.length ? 12 : 11}">${esc(ch || 'Équipements')}</td></tr>${ls.map((l, i) => [l, i]).filter(([l]) => l.chapitre === ch).map(([l, i]) => `<tr data-ligne="${i}">
        <td>${l.libre ? `<input data-m="designation" value="${esc(l.designation)}" placeholder="Désignation">` : `${esc(l.designation)}${l.orphelin ? '<div class="manque petit">plus dans l\'étude (dimension changée) : reprendre la référence sur la nouvelle ligne puis supprimer</div>' : `<div class="muted petit">${esc(l.sources.join(', '))}</div>`}`}${controleHtml(l)}</td>
        <td>${l.libre ? `<input class="nombre qte" data-m="qte" value="${esc(String(l.qte).replace('.', ','))}">` : Notes.nf(l.qte, 0)}</td>
        ${catalogue.length ? `<td>${(() => { const cs = l.libre ? catalogue.slice(0, 0) : CatalogueMateriel.candidats(l, catalogue); return cs.length ? `<select data-cat="${i}" style="max-width:220px"><option value="">${cs.length} modèle(s) adapté(s)…</option>${cs.map((p, k) => `<option value="${k}" ${p.fabricant === l.fabricant && p.reference === l.reference ? 'selected' : ''}>${esc(CatalogueMateriel.libelle(p))}</option>`).join('')}</select>` : '<span class="muted petit">aucun modèle</span>'; })()}${l.pElec != null ? `<div class="muted petit">${Notes.nf(l.pElec, 2)} kW élec.</div>` : ''}</td>` : ''}
        <td><input style="min-width:110px" data-m="fabricant" value="${esc(l.fabricant)}" placeholder="Fabricant" list="ml-fab"></td>
        <td><input style="min-width:170px;font-weight:600" data-m="reference" value="${esc(l.reference)}" placeholder="Réf. catalogue exacte"></td>
        <td><select style="min-width:150px" data-m="statut" ${l.reference ? '' : 'disabled'}>${MaterielRetenu.STATUTS.filter(s => s !== 'À choisir' || !l.reference).map(s => `<option ${s === l.statut ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
        <td><input type="date" style="width:132px" data-m="dateSoumission" value="${esc(l.dateSoumission)}"></td><td><input type="date" style="width:132px" data-m="dateValidation" value="${esc(l.dateValidation)}"></td>
        <td><input data-m="obs" value="${esc(l.obs)}" placeholder="Réserves, remarques"></td>
        <td>${(f => (f ? `<a href="${urlFicheBiblio(f)}" target="_blank" rel="noopener" title="${esc(`${f.nom || ''}${f.date ? ` — version du ${dateFr(f.date)}` : ''}`)}">📄 bibliothèque${f.exacte ? '' : ' (gamme)'}</a>${f.remplacee ? ' <span class="petit avert">ancienne version</span>' : ''}`
          : `<input style="width:110px" data-m="fiche" value="${esc(l.fiche)}" placeholder="https://…">${l.reference && !l.fiche ? '<div class="petit avert">pas de fiche dans la bibliothèque</div>' : ''}`))(ficheDe(et, l))}</td>
        <td class="petit">${MaterielRetenu.aRelancer(l, aujourdhui()) ? '<span class="badge erreur">à relancer</span> ' : ''}${esc(chantierHtml(suivi.get(l.cle)))}</td>
        <td>${l.libre || l.orphelin ? `<button class="icone" data-suppr="${i}" title="Supprimer">✕</button>` : ''}</td></tr>`).join('')}`).join('')}
      </tbody></table></div>
      <datalist id="ml-fab">${[...new Set(ls.map(l => l.fabricant).filter(Boolean))].map(f => `<option value="${esc(f)}">`).join('')}</datalist>
      <div class="actions"><button class="secondaire" id="ml-ajout">+ Ajouter un matériel</button><button class="secondaire" id="ml-soumis" ${b.aSoumettre ? '' : 'disabled'}>Marquer « soumis au client » (${b.aSoumettre})</button>
        <span class="espace"></span><button class="secondaire" id="ml-fermer">Fermer</button><button class="secondaire" id="ml-csv">CSV</button><button id="ml-pdf">📄 Liste à faire valider (PDF)</button></div>`;
    lier(ls);
    chargerFichesBiblio(et, ls).then(ch => { if (ch && box.isConnected) rendu(); });
  };
  const lier = ls => {
    box.querySelector('#ml-fermer').onclick = fermer;
    box.querySelectorAll('tr[data-ligne]').forEach(tr => {
      const l = ls[+tr.dataset.ligne];
      tr.querySelectorAll('[data-m]').forEach(el => {
        el.onchange = () => {
          const k = el.dataset.m, v = k === 'qte' ? Notes.num(el.value) : el.value;
          MaterielRetenu.saisir(et.materiel, l, k, v, aujourdhui());
          if (k === 'reference' || k === 'fabricant') et.materiel[l.cle].pElec = null; // saisie libre : puissance du catalogue plus valable
          enregistrer(et);
          if (['reference', 'fabricant', 'statut', 'qte'].includes(k)) rendu();
        };
      });
    });
    // Modèle choisi dans le catalogue : fabricant, référence, fiche technique et puissance électrique
    const catalogue = ((S.config || {}).catalogues || {}).materiel || [];
    box.querySelectorAll('[data-cat]').forEach(sel => sel.onchange = () => {
      const l = ls[+sel.dataset.cat], p = CatalogueMateriel.candidats(l, catalogue)[+sel.value];
      if (!p) return;
      MaterielRetenu.saisir(et.materiel, l, 'fabricant', p.fabricant, aujourdhui());
      MaterielRetenu.saisir(et.materiel, l, 'reference', p.reference, aujourdhui());
      const x = et.materiel[l.cle];
      if (p.fiche && !x.fiche) x.fiche = p.fiche;
      x.pElec = Number.isFinite(p.Pelec) ? p.Pelec : null;
      enregistrer(et); rendu();
    });
    box.querySelectorAll('[data-suppr]').forEach(x => x.onclick = () => { delete et.materiel[ls[+x.dataset.suppr].cle]; enregistrer(et); rendu(); });
    box.querySelector('#ml-ajout').onclick = () => { et.materiel[`libre|${uidE()}`] = { libre: true, designation: '', qte: 1, chapitre: 'Autres équipements' }; enregistrer(et); rendu(); };
    box.querySelector('#ml-soumis').onclick = () => { ls.filter(l => l.statut === 'À soumettre').forEach(l => MaterielRetenu.saisir(et.materiel, l, 'statut', 'Soumis au client', aujourdhui())); enregistrer(et); rendu(); };
    box.querySelector('#ml-csv').onclick = () => enregistrerFichier(box, `Materiel_${sansAccents(et.objet).slice(0, 40)}.csv`, new TextEncoder().encode(`﻿${MaterielRetenu.csv(ls)}`), 'text/csv');
    box.querySelector('#ml-pdf').onclick = () => pdfMateriel(et, ls.filter(l => l.reference && !l.orphelin));
  };
  rendu();
}

// Liste du matériel proposé, à faire viser par le client / la maîtrise d'œuvre (une case d'avis par ligne)
function htmlMateriel(et, ls) {
  const a = affaireDe(et.affaireId), c = S.config.societe, chapitres = [...new Set(ls.map(l => l.chapitre))];
  return `<div class="doe-doc ndc"><img src="logo-tecnitub.png" class="garde-logo" alt="" style="max-height:48px">
    <h2>LISTE DU MATÉRIEL PROPOSÉ — SOUMISE À VALIDATION</h2>
    <table class="tn"><tbody><tr><th>Affaire</th><td>${esc(libelleAffaire(a)) || '—'}</td><th>Client / maître d'ouvrage</th><td>${esc(et.client || clientDe(a)) || '—'}</td></tr>
      <tr><th>Étude</th><td>${esc(et.objet)} — indice ${esc(et.indice)}</td><th>Émise le</th><td>${dateFr(aujourdhui())} par ${esc(et.auteur || '')}</td></tr>
      <tr><th>Entreprise</th><td colspan="3">${esc(c.raison)} — ${esc(c.adresse)} — Tél. ${esc(c.tel)}</td></tr></tbody></table>
    <p class="petit">Les équipements ci-dessous ont été dimensionnés par notre bureau d'études ; nous proposons les modèles indiqués (fiches techniques jointes à la suite de cette liste, ou en lien). Merci de porter votre avis sur chaque ligne et de nous retourner la liste visée avant commande.</p>
    <table class="tn"><thead><tr><th>N°</th><th>Équipement</th><th>Qté</th><th>Fabricant</th><th>Référence</th><th>Statut</th><th style="width:16%">Avis du client (V / VO / R) et observations</th></tr></thead><tbody>
    ${chapitres.map(ch => `<tr><td colspan="7"><strong>${esc(ch || 'Équipements')}</strong></td></tr>${ls.filter(l => l.chapitre === ch).map(l => `<tr><td>${ls.indexOf(l) + 1}</td><td>${esc(l.designation)}</td><td class="num">${Notes.nf(l.qte, 0)}</td><td>${esc(l.fabricant)}</td><td><strong>${esc(l.reference)}</strong>${l.fiche ? `<br><span class="petit">${esc(l.fiche)}</span>` : ''}</td><td>${esc(l.statut)}${l.dateValidation ? ` le ${dateFr(l.dateValidation)}` : ''}</td><td>${esc(l.obs)}</td></tr>`).join('')}`).join('')}
    </tbody></table>
    <p class="petit">V : validé · VO : validé avec observations · R : refusé (merci de préciser le motif).</p>
    <table class="tn visa"><thead><tr><th>Visa du client / de la maîtrise d'œuvre</th><th>Nom et qualité</th><th>Date</th><th>Signature</th></tr></thead><tbody><tr><td style="height:70px">Bon pour accord</td><td></td><td></td><td></td></tr></tbody></table></div>`;
}
async function pdfMateriel(et, ls) {
  if (!ls.length) return toast('Saisir au moins une référence de fabricant.', 5000);
  const box = Modal.open('<h2>Liste du matériel</h2><p>Mise en page…</p>');
  try {
    await chargerFichesBiblio(et, ls);
    let bytes = await PDF.depuisHTML(pourPdf(htmlMateriel(et, ls)), 'Liste du matériel proposé', null, { margeHaut: 42, margeBas: 42 });
    // Fiches techniques de la bibliothèque jointes à la suite de la liste (une fois chacune)
    const fiches = [...new Map(ls.map(l => ficheDe(et, l)).filter(Boolean).map(f => [f.fichierId, f])).values()];
    let jointes = 0;
    if (fiches.length && typeof PDFLib !== 'undefined') {
      const doc = await PDFLib.PDFDocument.load(bytes);
      for (const f of fiches) {
        try { const src = await PDFLib.PDFDocument.load(await (await fetch(urlFicheBiblio(f), { credentials: 'same-origin' })).arrayBuffer(), { ignoreEncryption: true }); (await doc.copyPages(src, src.getPageIndices())).forEach(pg => doc.addPage(pg)); jointes++; } catch (e) { /* fiche illisible : non jointe */ }
      }
      bytes = await doc.save();
    }
    const a = affaireDe(et.affaireId), nom = `Materiel_a_valider_${sansAccents(a && a.code) || 'ETUDE'}_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}.pdf`;
    box.innerHTML = `<h2>Liste du matériel générée</h2><p><strong>${esc(nom)}</strong> · ${ls.length} équipement(s)${jointes ? ` · ${jointes} fiche(s) technique(s) jointe(s)` : ''}${fiches.length > jointes ? ` · <span class="avert">${fiches.length - jointes} fiche(s) illisible(s) non jointe(s)</span>` : ''}</p>
      <p class="petit" id="ml-depot">${a ? 'Dépôt dans les documents du chantier…' : '<span class="muted">Étude sans chantier : la liste n\'est pas déposée (téléchargez-la).</span>'}</p>
      <p class="petit muted">Envoi au client et relances : depuis la fiche du chantier dans Pipe-Fit (« ✉️ Envoyer au client »), les lignes passent alors « soumis au client » ici. Reporter son avis ligne par ligne au retour.</p>
      <div class="actions"><button class="secondaire" id="f">Fermer</button><button id="gen-dl">Télécharger le PDF</button></div>`;
    // Dépôt automatique dans les documents du chantier (catégorie « Matériel à valider », nouvel indice à chaque dépôt)
    if (a) api('POST', '/api/pf/document', { affaireId: et.affaireId, etudeId: et.id, categorie: 'Matériel à valider', nom, indice: et.indice, note: `${et.objet} — ${ls.length} équipement(s) à valider`, base64: base64(bytes) })
      .then(r => { const z = box.querySelector('#ml-depot'); if (z) z.innerHTML = `✓ Déposée dans les documents du chantier ${esc(libelleAffaire(a))} (catégorie « Matériel à valider », indice ${esc(r.indice || '')}).`; })
      .catch(er => { const z = box.querySelector('#ml-depot'); if (z) z.innerHTML = `<span class="erreur">Dépôt impossible : ${esc(er.message)}</span>`; });
    window.DERNIERE_NOTE = { nom, bytes };
    box.querySelector('#f').onclick = () => dialogueMateriel(et);
    box.querySelector('#gen-dl').onclick = () => enregistrerFichier(box, nom, bytes, 'application/pdf');
  } catch (e) { box.innerHTML = `<h2>Génération impossible</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="f">Fermer</button></div>`; box.querySelector('#f').onclick = Modal.close; }
}
