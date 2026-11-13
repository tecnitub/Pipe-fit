// Pipe-Fit Études : études du bureau d'études fluides (une étude = un objet, une affaire Pipe-Fit, un indice et ses notes
// de calcul), calculateurs (saisie à gauche, résultats recalculés à chaque frappe), calculs rapides sans enregistrement,
// tableaux de référence et note de calcul en PDF.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = iso => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : '');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const uidE = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
const copie = o => JSON.parse(JSON.stringify(o));
// Copie d'une étude (duplication, modèle) : les calculs repartent sans émission
const sansEmissions = et => ({ ...et, notes: (et.notes || []).map(n => ({ ...n, emissions: [], indice: '' })) });
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { status: r.status, data: j });
  return j;
}
const toast = (msg, ms = 3000) => {
  let z = document.getElementById('toasts');
  if (!z) { z = document.createElement('div'); z.id = 'toasts'; document.body.appendChild(z); }
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; z.appendChild(t); setTimeout(() => t.remove(), ms);
};
const Modal = {
  open(html) { const m = document.getElementById('modal'), b = m.querySelector('.modal-box'); b.className = 'modal-box'; b.innerHTML = html; m.hidden = false; return b; },
  close() { document.getElementById('modal').hidden = true; },
};
const confirmer = (msg, ok = 'Confirmer') => new Promise(res => {
  const b = Modal.open(`<p>${esc(msg)}</p><div class="actions"><button class="secondaire" data-r="0">Annuler</button><button data-r="1">${esc(ok)}</button></div>`);
  b.querySelectorAll('[data-r]').forEach(x => x.onclick = () => { Modal.close(); res(x.dataset.r === '1'); });
});

/* ---------- Données ---------- */
const S = { me: null, config: null, etudes: [], pf: { affaires: [], entreprises: [], devis: [] }, enCours: new Map() };
const etudeDe = id => S.etudes.find(e => e.id === id);
const affaireDe = id => S.pf.affaires.find(a => a.id === id);
const clientDe = a => (a ? (S.pf.entreprises.find(e => e.id === a.clientId) || {}).nom || '' : '');
const libelleAffaire = a => (a ? [a.code, a.nom].filter(Boolean).join(' — ') : '');
const nouvelleEtude = (affaireId = '') => {
  const a = affaireDe(affaireId);
  return { id: uidE(), objet: '', affaireId, client: clientDe(a), indice: 'A', date: aujourdhui(), auteur: S.me.nom || S.me.login, verificateur: '', description: '', historique: [], notes: [] };
};
// Entrées complétées par les valeurs par défaut (calcul créé vide, champ ajouté depuis)
const completer = (type, e) => { Object.entries(Notes.defauts(type)).forEach(([k, v]) => { if (e[k] === undefined) e[k] = v; }); return e; };
const nouvelleNote = (type, entrees) => ({ id: uidE(), type, titre: Notes.TYPES[type].titre, entrees: entrees ? copie(entrees) : Notes.defauts(type), commentaire: '' });
// Résumé de l'étude pour la fiche chantier de Pipe-Fit : calculs et contrôles, équipements dimensionnés (métré), devis créés
// Résumé limité à ~280 Ko (le serveur refuse au-delà de 300 Ko) : on retire d'abord l'unifilaire, puis on raccourcit la table d'échange
function allegerResume(r) {
  const taille = () => JSON.stringify(r).length, g = r.regulation;
  if (g && taille() > 280000) delete g.unifilaire;
  if (g && g.echange && taille() > 280000) g.echange.lignes = g.echange.lignes.slice(0, 150);
  if (g && taille() > 280000) { delete g.echange; delete g.points; }
  return r;
}
function resumePF(et) {
  const notes = (et.notes || []).map(n => {
    let al = [];
    try { al = Liens.calculer(et, n).alertes || []; } catch (e) { al = [{ niveau: 'erreur' }]; }
    return { titre: n.titre || (Notes.TYPES[n.type] || {}).titre || n.type, type: n.type, erreurs: al.filter(a => a.niveau === 'erreur').length, attention: al.filter(a => a.niveau === 'attention').length };
  });
  let equipements = [];
  let materiel = [];
  try {
    const postes = Metre.metre(et).filter(Metre.estEquipement);
    equipements = postes.slice(0, 150).map(p => ({ cle: p.cle, chapitre: p.chapitre, designation: p.designation, qte: p.qte, sources: p.sources, ...(p.reference ? { fabricant: p.fabricant, reference: p.reference } : {}) }));
    // Matériel retenu : fabricant, référence exacte et validation du client (fiche du chantier, appli des compagnons)
    if (typeof MaterielRetenu !== 'undefined') materiel = MaterielRetenu.pourCrm(MaterielRetenu.lignes(postes, et.materiel));
  } catch (e) { equipements = []; }
  // Débits théoriques pour les relevés d'équilibrage : schémas aérauliques (bouche par bouche), réseaux arborescents (par vanne)
  const debits = PointsMes.debits(et, Liens);
  // Points de mise en service (valeurs attendues, réseaux à éprouver, contrôles) : liste des mises en service du chantier
  let mes = [];
  try { if (typeof PointsMes !== 'undefined') mes = PointsMes.extraire(et, n => Liens.calculer(et, n)); } catch (e) { mes = []; }
  return allegerResume({ objet: et.objet, client: et.client || '', clientId: et.clientId || '', devisId: et.devisId || '', indice: et.indice, date: et.date, auteur: et.auteur || '', verificateur: et.verificateur || '', description: String(et.description || '').slice(0, 500),
    notes, erreurs: notes.reduce((s, n) => s + n.erreurs, 0), attention: notes.reduce((s, n) => s + n.attention, 0), equipements, materiel, debits, mes, regulation: (() => { try { return Regulation.pourDoe(et, Liens); } catch (e) { return null; } })(), renumerotations: (et.renumerotations || []).slice(-20), devis: (et.devisPF || []).slice(-10) });
}
const corpsEtude = et => { let resume; try { resume = et.modele ? undefined : resumePF(et); } catch (e) { resume = undefined; } return { data: et, version: et._v, resume }; };
// Enregistrement différé (une requête à la fois par étude, contrôle de version)
function enregistrer(etude) {
  if (!S.etudes.includes(etude)) S.etudes.unshift(etude);
  // Registre des équipements : fiches des calculs inscrites, valeurs du registre reportées sur tous les emplacements
  if (!etude.modele && typeof Registre !== 'undefined') {
    try {
      // Bouches : rattachées à la CTA / l'extracteur choisi, numérotées si elles n'ont pas de repère
      const b = Registre.completerBouches(etude);
      if (b.deplacees.length) toast(`${b.deplacees.map(x => x.rep || 'Bouche').join(', ')} : déplacée(s) dans « ${b.deplacees[0].vers} » (CTA / extracteur choisi) ; choisissez le tronçon.`, 6000);
      Registre.synchroniser(etude);
    } catch (e) { /* étude incomplète */ }
  }
  // Valeurs estimées : retirées dès qu'une valeur réelle existe (saisie, bilan, fiche, calcul relié), rafraîchies sinon
  if (!etude.modele && typeof Estimations !== 'undefined') { try { if (Estimations.enPlace(etude).length || JSON.stringify(etude.notes || []).includes('"_estimes"')) Estimations.appliquer(etude, { rafraichir: true }); } catch (e) { /* étude incomplète */ } }
  const st = S.enCours.get(etude.id) || {};
  clearTimeout(st.t);
  st.t = setTimeout(async () => {
    if (st.vol) { st.encore = true; return; }
    st.vol = true;
    try {
      const r = await api('PUT', `/api/etudes/${etude.id}`, corpsEtude(etude));
      Object.assign(etude, { _v: r._v, _at: r._at, _by: r._by });
      // Chantier relié depuis Pipe-Fit (commande reçue) : repris dans l'étude
      if (r.affaireId && r.affaireId !== etude.affaireId) { etude.affaireId = r.affaireId; etude.client = etude.client || clientDe(affaireDe(r.affaireId)); toast(`Étude reliée au chantier ${libelleAffaire(affaireDe(r.affaireId))} dans Pipe-Fit`, 5000); App.render(); }
      majEtatEnregistrement('Enregistré');
    } catch (e) {
      if (e.status === 409 && e.data.record) { Object.assign(etude, e.data.record); toast(`${e.message} : version la plus récente rechargée.`, 5000); App.render(); }
      else { majEtatEnregistrement('Non enregistré'); toast(e.message, 5000); }
    }
    st.vol = false;
    if (st.encore) { st.encore = false; enregistrer(etude); }
  }, 400);
  S.enCours.set(etude.id, st);
  majEtatEnregistrement('Enregistrement…');
}
const majEtatEnregistrement = t => { const e = document.getElementById('etat-enreg'); if (e) e.textContent = t; };

/* ---------- Calculateur générique ---------- */
// Étude affichée : contexte des listes qui proposent les autres notes (puissance reprise d'un bilan…)
let contexteEtude = null;
// Options d'une liste ; pour une colonne, la ligne est passée (colonne « amont » : les autres repères de la liste)
const optionsDe = (c, e, ligne) => (typeof c.o === 'function' ? c.o(e, contexteEtude, ligne) : c.o);
// Propositions d'une colonne texte (« lst » : pièces, étages, zones de l'étude) : datalist commune à la colonne
const idListe = (c, col) => `dl-${c.k}-${col.k}`;
const datalistsHtml = (c, cols, e) => cols.filter(col => col.lst && col.t === 't').map(col => {
  let v = []; try { v = col.lst(e, contexteEtude) || []; } catch (err) { v = []; }
  return `<datalist id="${idListe(c, col)}">${[...new Set(v.map(String))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
}).join('');
const optionsHtml = (opts, v) => opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
const valeurChamp = v => (typeof v === 'number' ? String(v).replace('.', ',') : v ?? '');
// Champs groupés par rubrique (« g »), sans ceux masqués par leur condition
function rubriques(type, e) {
  const out = [];
  Notes.TYPES[type].champs.forEach(c => {
    if (c.g) return out.push({ titre: c.g, champs: [] });
    if (!out.length) out.push({ titre: '', champs: [] });
    if (!c.si || c.si(e)) out[out.length - 1].champs.push(c);
  });
  return out.filter(r => r.champs.length);
}
// Colonnes d'une liste de lignes, sans celles masquées par leur condition (puissance froid hors change-over…)
const colonnesDe = (c, e) => c.colonnes.filter(col => !col.si || col.si(e));
// verrous : champs repris d'une autre note (« champ » ou « liste.ligne.colonne » → libellé de la source), affichés non modifiables
const verrou = (v, cle) => (v[cle] ? ` disabled data-verrou title="Repris de ${esc(v[cle])}"` : '');
// Valeur estimée (estimations.js : ratios, surfaces) encore en place : badge « estimée — à confirmer », origine en infobulle
const badgeEstime = (o, k, v, cle) => {
  const m = !v[cle] && typeof Estimations !== 'undefined' ? Estimations.marque(o, k) : null;
  return m ? `<span class="badge estime" title="${esc(`Estimée : ${m.origine}. Remplacée dès qu'une valeur réelle existe (saisie, bilan, fiche).`)}">estimée — à confirmer</span>` : '';
};
// Colonne « cases à cocher » d'une ligne (options d'une armoire…) : liste repliable
const casesLigne = (c, col, l, i, e) => {
  if (col.sauf0 && i === 0) return `<span class="petit muted">${esc(col.sauf0)}</span>`;
  const val = Array.isArray(l[col.k]) ? l[col.k] : (col.d || []), opts = optionsDe(col, e);
  return `<details class="cases-ligne"><summary>${val.length} coché(s)</summary>${opts.map(([k, lib, aide]) => `<label class="case" title="${esc(aide || '')}"><input type="checkbox" data-lcase="${c.k}.${i}.${col.k}" value="${esc(k)}" ${val.includes(k) ? 'checked' : ''}> ${esc(lib)}</label>`).join('')}</details>`;
};
// Libellé court (le texte complet en aide : infobulle, et affiché sous le champ quand il a le focus)
const courtDe = l => (typeof Ergonomie !== 'undefined' ? Ergonomie.libelleCourt(l) : { court: String(l ?? ''), aide: '' });
const libelleChamp = (l, u) => { const { court, aide } = courtDe(l);
  return `<span class="lib"${aide ? ` title="${esc(aide)}"` : ''}>${esc(court)}${u ? ` <span class="unite">(${esc(u)})</span>` : ''}${aide ? '<span class="aide-i" aria-hidden="true">ⓘ</span>' : ''}</span>${aide ? `<span class="aide-texte">${esc(aide)}</span>` : ''}`; };
const enteteColonne = l => { const { court, aide } = courtDe(l); return `<th${aide ? ` title="${esc(aide)}"` : ''} data-court="${esc(court)}">${esc(court)}${aide ? ' <span class="aide-i" aria-hidden="true">ⓘ</span>' : ''}</th>`; };
const estReplie = (type, titre) => typeof Ergonomie !== 'undefined' && !!titre && Ergonomie.estReplie(type, titre);
function formulaireHtml(type, e, v = {}) {
  return rubriques(type, e).map(r => `<fieldset${estReplie(type, r.titre) ? ' class="replie"' : ''}>${r.titre ? `<legend><button type="button" class="replier" data-replier="${esc(r.titre)}" data-type="${esc(type)}" aria-expanded="${!estReplie(type, r.titre)}">${esc(r.titre)}</button></legend>` : ''}<div class="grille-champs">${r.champs.map(c => {
    if (c.t === 'lignes') {
      const lignes = e[c.k] || [], cols = colonnesDe(c, e);
      return `<div class="large"><div class="petit muted titre-lignes">${esc(c.l)}${lignes.length ? ` <span class="compte">${lignes.length}</span>` : ''}</div><div class="defile-x"><table class="edit lignes${lignes.length ? '' : ' vide'}"><thead><tr>${cols.map(col => enteteColonne(col.l)).join('')}<th><span class="visuel-cache">Actions</span></th></tr></thead>
        <tbody>${lignes.map((l, i) => `<tr${l && l._auto ? ` class="ligne-auto" title="Ligne reprise de ${esc(l._auto)}"` : ''}>${cols.map(col => `<td>${col.t === 'cases' ? casesLigne(c, col, l, i, e) : col.t === 's' ? `<select data-l="${c.k}.${i}.${col.k}"${verrou(v, `${c.k}.${i}.${col.k}`)}>${optionsHtml(optionsDe(col, e, l), l[col.k])}</select>`
          : `<input data-l="${c.k}.${i}.${col.k}" value="${esc(valeurChamp(l[col.k]))}" ${col.t === 't' ? (col.lst ? `list="${idListe(c, col)}" autocomplete="off"` : '') : 'inputmode="decimal" class="nombre"'}${verrou(v, `${c.k}.${i}.${col.k}`)}>${badgeEstime(l, col.k, v, `${c.k}.${i}.${col.k}`)}`}</td>`).join('')}
          <td class="actions-l" style="white-space:nowrap">${l && l._auto ? '<span class="petit muted" title="Ligne reprise d\'un autre calcul">🔗</span>' : `${c.colonnes[0].k === 'rep' ? `<button class="icone" data-dup-ligne="${c.k}.${i}" title="Dupliquer : même équipement, repère suivant ; il reste à changer la pièce">⧉</button>` : ''}<button class="icone" data-suppr-ligne="${c.k}.${i}" title="Supprimer la ligne">✕</button>`}</td></tr>`).join('')}</tbody></table></div>${datalistsHtml(c, cols, e)}
        <button class="secondaire petit" data-ajout-ligne="${c.k}">+ Ajouter une ligne</button> <span class="petit muted">ou collez un tableau Excel dans une cellule</span></div>`;
    }
    const lib = libelleChamp(c.l, c.u);
    if (c.t === 'cases') { const val = Array.isArray(e[c.k]) ? e[c.k] : (c.d || []), opts = optionsDe(c, e);
      return `<div class="large"><div class="petit muted">${esc(c.l)}</div><div class="cases-choix">${opts.map(([k, l, aide]) => `<label class="case" title="${esc(aide || '')}"><input type="checkbox" data-case="${c.k}" value="${esc(k)}" ${val.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>`; }
    if (c.t === 's') return `<label>${lib}<select data-k="${c.k}"${verrou(v, c.k)}>${optionsHtml(optionsDe(c, e), e[c.k])}</select></label>`;
    return `<label>${lib}<input data-k="${c.k}" value="${esc(valeurChamp(e[c.k]))}" ${c.t === 't' ? '' : 'inputmode="decimal" class="nombre"'}${verrou(v, c.k)}>${badgeEstime(e, c.k, v, c.k)}</label>`;
  }).join('')}</div></fieldset>`).join('');
}
// Onglets complémentaires d'un calcul (réglementation, régulation…) : blocs d'exigences, listes, tableaux, textes
let ongletActif = 'Résultats';
const NIVEAUX = { obligatoire: 'Obligatoire', conseil: 'Conseillé', info: 'Information' };
const blocsHtml = blocs => blocs.map(b => `${b.titre ? `<h3>${esc(b.titre)}</h3>` : ''}
  ${b.items ? `<ul class="exigences">${b.items.map(i => `<li class="${i.niveau}"><span class="badge ${i.niveau}">${NIVEAUX[i.niveau] || i.niveau}</span> ${esc(i.texte)}${i.ref ? ` <span class="ref">${esc(i.ref)}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${b.liste ? `<ul class="af">${b.liste.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  ${b.tableau ? `<div class="defile-x"><table class="liste compact"><thead><tr>${b.tableau.entetes.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.tableau.lignes.map((l, i) => `<tr class="${b.tableau.total && i === b.tableau.lignes.length - 1 ? 'total' : ''}">${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
  ${b.svg ? `<div class="schema">${b.svg}</div>` : ''}
  ${(b.texte || []).map(t => `<p class="muted petit">${esc(t)}</p>`).join('')}`).join('');
function resultatsHtml(r) {
  const onglets = r.onglets || [], actif = onglets.some(o => o.titre === ongletActif) ? ongletActif : 'Résultats';
  const barre = onglets.length ? `<div class="onglets" role="tablist">${['Résultats', ...onglets.map(o => o.titre)].map(t => `<button role="tab" class="onglet${t === actif ? ' actif' : ''}" aria-selected="${t === actif}" data-onglet="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';
  if (actif !== 'Résultats') return barre + blocsHtml(onglets.find(o => o.titre === actif).blocs);
  return barre + resultatsPrincipaux(r);
}
function resultatsPrincipaux(r) {
  return `${r.alertes.map(a => `<div class="alerte ${a.niveau}">${esc(a.texte)}</div>`).join('')}
    <table class="resume">${r.resume.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    ${r.tableaux.map(t => `<h3>${esc(t.titre)}</h3><div class="defile-x"><table class="liste compact"><thead><tr>${t.entetes.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${t.lignes.map((l, i) => `<tr class="${i === t.surligne ? 'retenu' : ''}${t.total && i === t.lignes.length - 1 ? ' total' : ''}">${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}
    <details class="hypotheses"><summary>Hypothèses et méthode</summary><ul>${r.hypotheses.map(h => `<li>${esc(h)}</li>`).join('')}</ul></details>`;
}
// Calculateur : formulaire et résultats ; changer() est appelé après chaque modification des entrées
// Schéma dessiné par le calcul (P&ID), sur toute la largeur sous la saisie
// Schémas d'un calcul : le principal, puis les folios complémentaires (commande, cartes de l'automate…)
const tousSchemas = r => [...(r.schema ? [{ titre: r.titreSchema || 'Schéma de principe', svg: r.schema }] : []), ...(r.schemas || []).filter(s => s && s.svg)];
const schemaHtml = r => tousSchemas(r).map((s, i) => `<div class="barre"><h2>${esc(s.titre)}</h2><span class="espace"></span><button class="secondaire petit" data-dl-schema="${i}">Télécharger (SVG)</button><button class="secondaire petit" data-dl-dxf="${i}">Télécharger pour AutoCAD (DXF)</button><button class="secondaire petit" data-dl-pdf="${i}">PDF A3</button></div><div class="schema">${s.svg}</div>`).join('');
// ctx : entrées effectives (avec les valeurs reprises d'autres notes) et calcul ; par défaut, la saisie seule
const ctxSimple = (type, e) => ({ effectives: () => ({ entrees: e, verrous: {} }), calcul: () => Notes.calculer(type, e) });
// Rendu d'un écran qui calcule plusieurs fois les mêmes notes (tableau de bord, guide, parcours, mises en service,
// installation) : un même calcul (type et entrées identiques) n'est fait qu'une fois pendant ce rendu
function avecCalculsMemorises(fn) {
  if (Notes._memo) return fn();
  const orig = Notes.calculer, memo = new Map();
  Notes._memo = true;
  Notes.calculer = (type, e, ...r) => {
    if (r.length) return orig(type, e, ...r);
    let k; try { k = `${type}\u0000${JSON.stringify(e)}`; } catch (er) { return orig(type, e); }
    if (!memo.has(k)) memo.set(k, orig(type, e));
    return memo.get(k);
  };
  try { return fn(); } finally { Notes.calculer = orig; delete Notes._memo; }
}
const ctxEtude = (et, n) => ({ effectives: () => Liens.resoudre(et, n), calcul: () => Liens.calculer(et, n) });
function calculateurHtml(type, e, ctx = ctxSimple(type, e)) {
  const r = ctx.calcul(), eff = ctx.effectives();
  const nbGroupes = rubriques(type, eff.entrees).filter(x => x.titre).length;
  return `<div class="calc"><div class="calc-saisie">${nbGroupes > 2 ? '<div class="saisie-outils"><button type="button" class="secondaire petit" data-replier-tout="1">Replier les groupes</button><button type="button" class="secondaire petit" data-replier-tout="0">Tout déplier</button></div>' : ''}${formulaireHtml(type, eff.entrees, eff.verrous)}</div><div class="calc-resultats carte" id="resultats">${resultatsHtml(r)}</div></div>
    <div class="carte schema-carte" id="schema" ${tousSchemas(r).length ? '' : 'hidden'}>${schemaHtml(r)}</div>`;
}
// Collage d'un tableau (Excel, CSV à tabulations) dans une liste de lignes : colonnes visibles à partir de la cellule
// choisie ; les listes déroulantes acceptent la valeur ou le libellé. Renvoie le nombre de cellules remplies.
const normTxt = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function collerTableau(type, e, cle, texte) {
  const [k, i0, col0] = String(cle).split('.'), c = (Notes.TYPES[type].champs || []).find(x => x.k === k && x.t === 'lignes');
  if (!c) return 0;
  const cols = colonnesDe(c, e), j0 = cols.findIndex(x => x.k === col0);
  if (j0 < 0) return 0;
  const rangs = String(texte).replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(r => r.split('\t'));
  const l = e[k] || (e[k] = []);
  let n = 0;
  rangs.forEach((r, di) => {
    const ligne = l[+i0 + di] || (l[+i0 + di] = {});
    r.forEach((v, dj) => {
      const col = cols[j0 + dj]; if (!col) return;
      let val = String(v).trim();
      // Liste « libre » (amont d'une arborescence) : un repère pas encore saisi est gardé tel quel
      if (col.t === 's') { const o = optionsDe(col, e, ligne), m = o.find(([kk, lib]) => normTxt(kk) === normTxt(val) || normTxt(lib) === normTxt(val)) || o.find(([, lib]) => normTxt(val) && normTxt(lib).startsWith(normTxt(val))); if (!m && !(col.libre && val)) return; if (m) val = m[0]; }
      else if (col.t !== 't') val = val.replace(/\s/g, '').replace(',', '.');
      ligne[col.k] = val; n++;
    });
  });
  return n;
}
function lierCalculateur(root, type, e, changer, ctx = ctxSimple(type, e)) {
  const recalculer = () => {
    const r = ctx.calcul(), z = root.querySelector('#schema');
    root.querySelector('#resultats').innerHTML = resultatsHtml(r);
    z.innerHTML = schemaHtml(r); z.hidden = !tousSchemas(r).length;
    changer(false);
  };
  root.querySelector('#resultats').onclick = ev => {
    const o = ev.target.closest('[data-onglet]');
    if (o) { ongletActif = o.dataset.onglet; root.querySelector('#resultats').innerHTML = resultatsHtml(ctx.calcul()); }
  };
  root.querySelector('#schema').onclick = ev => {
    const svg = ev.target.closest('[data-dl-schema]'), dxf = ev.target.closest('[data-dl-dxf]'), pdf = ev.target.closest('[data-dl-pdf]');
    if (!svg && !dxf && !pdf) return;
    const s = tousSchemas(ctx.calcul())[+(svg ? svg.dataset.dlSchema : dxf ? dxf.dataset.dlDxf : pdf.dataset.dlPdf) || 0];
    if (!s) return;
    const nom = `${String(s.titre === 'Schéma de principe' ? `Schema_${e.titreInstallation || 'principe'}` : s.titre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_')}`;
    if (pdf) {
      if (typeof PDFLib === 'undefined') return toast('Module PDF indisponible', 5000);
      return schemaPdfA3(s.svg).then(o => telecharger(`${nom}_A3.pdf`, o, 'application/pdf')).then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Folio A3 enregistré')).catch(er => toast(er.message, 6000));
    }
    const [fichier, data, mime] = dxf ? [`${nom}.dxf`, Dxf.depuisSvg(s.svg).octets, 'application/dxf'] : [`${nom}.svg`, new TextEncoder().encode(s.svg), 'image/svg+xml'];
    Promise.resolve(telecharger(fichier, data, mime)).then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Schéma enregistré')).catch(er => toast(er.message, 6000));
  };
  const redessiner = () => { changer(true); };
  root.querySelectorAll('[data-case]').forEach(el => el.onchange = () => {
    const k = el.dataset.case;
    e[k] = [...root.querySelectorAll(`[data-case="${k}"]`)].filter(x => x.checked).map(x => x.value);
    redessiner();
  });
  root.querySelectorAll('[data-k]').forEach(el => {
    // Choix repris du type de bâtiment de l'étude : une fois choisi dans le calcul, il n'est plus remplacé
    if (el.tagName === 'SELECT') el.onchange = () => { e[el.dataset.k] = el.value; if (Liens.champEtude(type, el.dataset.k)) e._saisis = { ...(e._saisis || {}), [el.dataset.k]: true }; redessiner(); };
    else el.oninput = () => { e[el.dataset.k] = el.value; recalculer(); };
  });
  // Tableau collé depuis Excel (cellules séparées par des tabulations) : rempli à partir de la cellule, lignes ajoutées
  root.querySelector('.calc-saisie').addEventListener('paste', ev => {
    const el = ev.target.closest('[data-l]'), txt = ev.clipboardData && ev.clipboardData.getData('text/plain');
    if (!el || !txt || !/[\t\n]/.test(txt.replace(/\r?\n$/, ''))) return;
    const n = collerTableau(type, e, el.dataset.l, txt);
    if (!n) return;
    ev.preventDefault(); toast(`${n} cellule(s) collée(s) depuis le tableau`, 3500); redessiner();
  });
  root.querySelectorAll('[data-lcase]').forEach(el => el.onchange = () => {
    const [k, i, col] = el.dataset.lcase.split('.'), l = e[k] || (e[k] = []);
    (l[+i] || (l[+i] = {}))[col] = [...root.querySelectorAll(`[data-lcase="${el.dataset.lcase}"]`)].filter(x => x.checked).map(x => x.value);
    const det = el.closest('details'); if (det) det.querySelector('summary').textContent = `${l[+i][col].length} coché(s)`;
    recalculer();
  });
  root.querySelectorAll('[data-l]').forEach(el => {
    const [k, i, col] = el.dataset.l.split('.');
    const ecrire = () => { const l = e[k] || (e[k] = []); (l[+i] || (l[+i] = {}))[col] = el.value; };
    // Une liste peut changer les champs verrouillés (puissance reprise d'un bilan) : formulaire redessiné
    if (el.tagName === 'SELECT') el.onchange = () => { ecrire(); redessiner(); }; else el.oninput = () => { ecrire(); recalculer(); };    // Pièce, local, étage… : liste des valeurs de l'étude ouverte au clic, et une valeur nouvelle proposée tout de suite
    // aux autres lignes (sans attendre que le formulaire soit redessiné)
    if (el.list) {
      el.addEventListener('mousedown', () => { if (!el.value && el.showPicker) setTimeout(() => { try { el.showPicker(); } catch (er) { /* navigateur sans showPicker */ } }, 0); });
      el.addEventListener('change', () => { const v = el.value.trim(); if (v && ![...el.list.options].some(o => o.value === v)) { const o = document.createElement('option'); o.value = v; el.list.appendChild(o); } });
    }
  });
  root.querySelectorAll('[data-ajout-ligne]').forEach(b => b.onclick = () => {
    const k = b.dataset.ajoutLigne, c = Notes.TYPES[type].champs.find(x => x.k === k), l = e[k] || (e[k] = []);
    // Nouvelle ligne : copie de la précédente ; un repère numéroté (« CA-03 ») passe au suivant (« CA-04 »), sinon vidé
    const k0 = c.colonnes[0].k, der = l[l.length - 1], m = der && c.colonnes[0].t === 't' && /^(.*?)(\d+)$/.exec(String(der[k0] || ''));
    l.push(l.length ? { ...der, ...(c.colonnes[0].t === 't' ? { [k0]: m ? Registre.repSuivant(der[k0], prisDe(k, l, k0)) : '' } : {}) } : Object.fromEntries(c.colonnes.map(col => [col.k, ''])));
    redessiner();
  });
  // Dupliquer une ligne (même bouche, même terminal) : repère suivant libre, insérée dessous ; curseur sur la pièce
  const prisDe = (k, l, k0) => new Set([...l.map(x => String(x[k0] || '').trim()), ...(k === 'bouchesL' && contexteEtude ? Registre.repsBouches(contexteEtude) : [])]);
  root.querySelectorAll('[data-dup-ligne]').forEach(b => b.onclick = () => {
    const [k, i] = b.dataset.dupLigne.split('.'), l = e[k], x = l[+i]; if (!x) return;
    const copie = JSON.parse(JSON.stringify(x));
    copie.rep = Registre.repSuivant(x.rep || (k === 'bouchesL' ? 'B' : 'T'), prisDe(k, l, 'rep'));
    l.splice(+i + 1, 0, copie);
    redessiner();
    setTimeout(() => { const z = document.querySelector(`[data-l="${k}.${+i + 1}.salle"], [data-l="${k}.${+i + 1}.local"]`); if (z) { z.focus(); z.select(); } }, 30);
    toast(`${x.rep || 'Ligne'} dupliquée en ${copie.rep} : changez la pièce.`, 3500);
  });
  root.querySelectorAll('[data-suppr-ligne]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.supprLigne.split('.'); e[k].splice(+i, 1); redessiner(); });
}
// Rendu en conservant la position du curseur (redessin complet après un choix dans une liste)
function avecFocus(fn) {
  const a = document.activeElement, cle = a && (a.dataset.k || a.dataset.l), y = window.scrollY;
  fn();
  window.scrollTo(0, y);
  if (cle) { const n = document.querySelector(`[data-k="${cle}"], [data-l="${cle}"]`); if (n) n.focus(); }
}

/* ---------- Écrans ---------- */
const Vues = {};
const App = {
  render() {
    const root = document.getElementById('app');
    if (!S.me) return;
    const [chemin] = (location.hash.replace(/^#\/?/, '') || '').split('?');
    const [nom, ...p] = chemin.split('/').map(decodeURIComponent);
    const vue = Vues[nom] || Vues.accueil;
    root.innerHTML = vue.html(p);
    if (vue.bind) vue.bind(root, p);
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('actif', (a.getAttribute('href') || '').slice(2) === (Vues[nom] ? nom : 'accueil') || (nom === 'etude' && a.getAttribute('href') === '#/')));
  },
};

Vues.connexion = {
  html: err => `<form class="carte connexion" id="f-login"><img src="logo-tecnitub.png" alt="TECNITUB" class="logo-connexion"><h1>Bureau d'études fluides</h1>
    <p class="muted">Connectez-vous avec votre compte Pipe-Fit (bureau).</p>
    <label>Identifiant<input name="login" autocomplete="username" required autofocus></label>
    <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
    ${err ? `<p class="erreur">${esc(err)}</p>` : ''}<button>Se connecter</button></form>`,
};
function ecranConnexion(err) {
  document.body.classList.add('deconnecte');
  const root = document.getElementById('app');
  root.innerHTML = Vues.connexion.html(err);
  root.querySelector('#f-login').onsubmit = async e => {
    e.preventDefault();
    try { await api('POST', '/api/login', { login: e.target.login.value, password: e.target.password.value }); location.reload(); }
    catch (er) { ecranConnexion(er.message); }
  };
}

const typesParFamille = () => Notes.familles().map(f => [f, Object.entries(Notes.TYPES).filter(([, t]) => t.famille === f)]);
const listeEtudes = etudes => (etudes.length ? `<table class="liste"><thead><tr><th>Objet</th><th>Affaire</th><th>Indice</th><th>Calculs</th><th>Modifiée</th></tr></thead><tbody>
  ${etudes.map(x => { const a = affaireDe(x.affaireId); return `<tr class="cliquable" data-href="#/etude/${x.id}"><td><a href="#/etude/${x.id}"><strong>${esc(x.objet)}</strong></a>${x.client ? `<div class="muted petit">${esc(x.client)}</div>` : ''}</td>
    <td>${a ? esc(libelleAffaire(a)) : '<span class="muted">—</span>'}</td><td>${esc(x.indice)}</td><td>${x.notes.length}</td>
    <td class="petit">${x._at ? `${new Date(x._at).toLocaleDateString('fr-FR')} · ${esc(x._by || '')}` : ''}</td></tr>`; }).join('')}</tbody></table>`
  : '<p class="muted">Aucune étude pour l\'instant.</p>');
const lierListe = root => root.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = ev => { if (!ev.target.closest('a')) location.hash = tr.dataset.href; });

// Accueil : études enregistrées et accès aux calculs rapides
Vues.accueil = {
  html: () => {
    const q = (sessionStorage.getItem('etudes-q') || '').toLowerCase();
    const etudes = S.etudes.filter(x => !x.modele && (!q || `${x.objet} ${x.client} ${libelleAffaire(affaireDe(x.affaireId))}`.toLowerCase().includes(q)));
    const modeles = S.etudes.filter(x => x.modele);
    return `<div class="barre"><h1>Études</h1><button id="nouvelle">+ Nouvelle étude</button><input type="search" id="q" placeholder="Rechercher une étude, une affaire…" value="${esc(q)}"></div>
      <section>${listeEtudes(etudes)}</section>
      <section><h2>Modèles d'études <span class="compte">${Modeles.INTEGRES.length + modeles.length}</span></h2><p class="muted petit">« Nouvelle étude » permet de partir d'un modèle ; une étude s'enregistre comme modèle depuis sa page.</p>
        <div class="types">${Modeles.INTEGRES.map(m => `<button class="carte type" data-modele="${m.id}"><span class="ico">📐</span><span><strong>${esc(m.nom)}</strong><span class="muted petit">${esc(m.description)}</span></span></button>`).join('')}
        ${modeles.map(m => `<a class="carte type" href="#/etude/${m.id}"><span class="ico">⭐</span><span><strong>${esc(m.objet)}</strong><span class="muted petit">Modèle enregistré · ${m.notes.length} calcul(s)${m._by ? ` · ${esc(m._by)}` : ''}</span></span></a>`).join('')}</div></section>
      <section><h2>Calcul rapide <span class="muted petit">— sans enregistrement, à verser ensuite dans une étude</span></h2>
      ${typesParFamille().map(([f, ts]) => `<h3>${esc(f)}</h3><div class="types">${ts.map(([k, t]) => `<a class="carte type" href="#/rapide/${k}"><span class="ico">${t.icone}</span><span><strong>${esc(t.titre)}</strong><span class="muted petit">${esc(t.description)}</span></span></a>`).join('')}</div>`).join('')}</section>`;
  },
  bind: root => {
    const q = root.querySelector('#q');
    q.oninput = () => { sessionStorage.setItem('etudes-q', q.value); const pos = q.selectionStart; App.render(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); };
    root.querySelector('#nouvelle').onclick = () => dialogueNouvelleEtude();
    root.querySelectorAll('[data-modele]').forEach(b => b.onclick = () => dialogueNouvelleEtude('', null, b.dataset.modele));
    lierListe(root);
  },
};

// Lien « Études » d'un chantier dans Pipe-Fit : études de l'affaire, création pré-remplie
Vues.chantier = {
  html: ([id]) => {
    const a = affaireDe(id), etudes = S.etudes.filter(x => x.affaireId === id && !x.modele);
    return `<div class="barre"><h1>${a ? esc(libelleAffaire(a)) : 'Affaire inconnue'}</h1><button id="nouvelle">+ Nouvelle étude pour cette affaire</button></div>
      ${a ? `<p class="muted">${esc(clientDe(a))}${a.statut ? ` · ${esc(a.statut)}` : ''}</p>` : '<p class="erreur">Cette affaire n\'existe pas dans Pipe-Fit ou vous n\'y avez pas accès.</p>'}
      ${listeEtudes(etudes)}`;
  },
  bind: (root, [id]) => { root.querySelector('#nouvelle').onclick = () => dialogueNouvelleEtude(affaireDe(id) ? id : ''); lierListe(root); },
};

const optionsAffaires = sel => `<option value="">— Sans affaire —</option>${S.pf.affaires.filter(a => a.type !== 'horsDevis').slice().sort((x, y) => String(y.code || '').localeCompare(String(x.code || '')))
  .map(a => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(libelleAffaire(a))}</option>`).join('')}`;
const modeleDe = id => Modeles.INTEGRES.find(m => m.id === id) || S.etudes.find(x => x.modele && x.id === id);
// Climat, type de bâtiment, neuf / existant de l'étude : ce qui change dans chaque calcul est montré avant d'appliquer
function appliquerDonneesEtude(et, modifs) {
  const ch = Liens.changementsEtude(et, modifs), emis = new Set((et.notes || []).filter(n => (n.emissions || []).length).map(n => n.id));
  const valider = () => { Object.assign(et, modifs); enregistrer(et); Modal.close(); App.render(); toast(ch.length ? `${ch.length} valeur(s) mise(s) à jour dans ${new Set(ch.map(x => x.noteId)).size} calcul(s).` : 'Données de l\'étude enregistrées.', 6000); };
  if (!ch.length) { Object.assign(et, modifs); enregistrer(et); return App.render(); }
  const b = Modal.open(`<h2>Appliquer à toute l'étude</h2><p class="petit">${ch.length} valeur(s) changent dans ${new Set(ch.map(x => x.noteId)).size} calcul(s). Les calculs déjà émis devront être réémis.</p>
    <div class="defile-x" style="max-height:50vh;overflow:auto"><table class="liste compact"><thead><tr><th>Calcul</th><th>Donnée</th><th>Avant</th><th>Après</th></tr></thead><tbody>
    ${ch.map(x => `<tr><td>${esc(x.note)}${emis.has(x.noteId) ? ' <span class="badge">émis</span>' : ''}</td><td>${esc(x.libelle)}</td><td>${esc(x.avant)}</td><td><strong>${esc(x.apres)}</strong></td></tr>`).join('')}</tbody></table></div>
    <div class="actions"><button class="secondaire" id="ad-x">Annuler</button><button id="ad-ok">Appliquer</button></div>`);
  b.querySelector('#ad-x').onclick = () => { Modal.close(); App.render(); };
  b.querySelector('#ad-ok').onclick = valider;
}
// Données de l'étude reprises du chantier choisi : objet (si vide), climat d'après la ville du site (si non défini)
function reprendreChantier(et, a) {
  if (!a) return;
  if (!String(et.objet || '').trim() && a.nom) et.objet = a.nom;
  if (!et.climat) { const c = Liens.climatDeVille(a.siteVille, a.siteCp); if (c) et.climat = c; }
}
// Références des documents du chantier (CCTP, plans… avec indice et date) pour l'objet détaillé de l'étude
function referencesDocuments(et, a) {
  const docs = ((a && (a.tousDocuments || a.documents)) || []).filter(d => d && d.nom && (!d.etudeId || d.etudeId !== et.id) && d.categorie !== 'Note de calcul');
  return docs.map(d => {
    const nom = String(d.nom).replace(/\.[a-z0-9]{2,4}$/i, ''), cat = String(d.categorie || '').trim();
    return `${cat && !normTxt(nom).includes(normTxt(cat)) ? `${cat === 'CCTP' ? cat : cat.toLowerCase()} ` : ''}${nom}${d.indice ? ` ind. ${d.indice}` : ''}${d.date ? ` du ${dateFr(d.date)}` : ''}`;
  });
}
const optionsClimat = (et, a) => {
  const sug = a ? Liens.climatDeVille(a.siteVille, a.siteCp) : '';
  return `<option value="">Non défini (saisi dans chaque calcul)${sug ? ` — suggestion : ${esc(Donnees.CLIMATS[sug][0])}` : ''}</option>${Object.entries(Donnees.CLIMATS).map(([k, c]) => `<option value="${k}" ${k === et.climat ? 'selected' : ''}>${esc(c[0])} (${c[1]} °C / ${c[2]} °C)</option>`).join('')}<option value="perso" ${et.climat === 'perso' ? 'selected' : ''}>Autre (températures saisies)</option>`;
};
const optionsTypeBatiment = et => {
  const d = ConsignesProjet.detecterProfil(et.objet);
  return `<option value="">Non défini (choisi dans chaque calcul)${d && Liens.TYPES_BATIMENT[d] ? ` — suggestion : ${esc(Liens.TYPES_BATIMENT[d][0])}` : ''}</option>${Object.entries(Liens.TYPES_BATIMENT).map(([k, t]) => `<option value="${k}" ${k === et.typeBatiment ? 'selected' : ''}>${esc(t[0])}</option>`).join('')}`;
};
function dialogueNouvelleEtude(affaireId = '', apres, modeleId = '', opts = {}) {
  const perso = S.etudes.filter(x => x.modele), m0 = modeleDe(modeleId);
  const b = Modal.open(`<h2>Nouvelle étude</h2><form id="f-etude" class="grille-champs">
    ${apres ? '' : `<label class="large">Partir de<select name="modele"><option value="">Étude vide</option><optgroup label="Modèles intégrés">${Modeles.INTEGRES.map(m => `<option value="${m.id}" ${m.id === modeleId ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</optgroup>
      ${perso.length ? `<optgroup label="Modèles enregistrés">${perso.map(m => `<option value="${m.id}" ${m.id === modeleId ? 'selected' : ''}>${esc(m.objet)}</option>`).join('')}</optgroup>` : ''}</select></label>`}
    <label class="large">Objet de l'étude<input name="objet" required placeholder="Ex. : réseau eau glacée CTA bâtiment B" value="${esc(m0 ? m0.objet : opts.objet || (affaireDe(affaireId) || {}).nom || '')}"></label>
    <label class="large">Affaire Pipe-Fit<select name="affaireId">${optionsAffaires(affaireId)}</select><span class="muted petit">Pas encore de commande : « Sans affaire » ; l'étude se relie au chantier plus tard (ici ou dans Pipe-Fit).</span></label>
    <div class="actions large"><button type="button" class="secondaire" id="annuler">Annuler</button><button>Créer</button></div></form>`);
  b.querySelector('#annuler').onclick = Modal.close;
  const sel = b.querySelector('[name="modele"]');
  if (sel) sel.onchange = () => { const m = modeleDe(sel.value), o = b.querySelector('[name="objet"]'); if (m && (!o.value || o.dataset.auto)) { o.value = m.objet; o.dataset.auto = '1'; } };
  // Chantier choisi : son nom devient l'objet de l'étude s'il est vide
  b.querySelector('[name="affaireId"]').onchange = ev => { const a = affaireDe(ev.target.value), o = b.querySelector('[name="objet"]'); if (a && a.nom && (!o.value.trim() || o.dataset.auto)) { o.value = a.nom; o.dataset.auto = '1'; } };
  b.querySelector('#f-etude').onsubmit = ev => {
    ev.preventDefault();
    const et = nouvelleEtude(ev.target.affaireId.value), m = sel && modeleDe(sel.value);
    et.objet = ev.target.objet.value.trim();
    reprendreChantier(et, affaireDe(et.affaireId));
    { const d = ConsignesProjet.detecterProfil(et.objet); if (d && Liens.TYPES_BATIMENT[d]) et.typeBatiment = d; }
    if (m) { et.notes = Modeles.instancier(m, uidE); if (m.description && !m.modele) et.description = m.description; }
    if (apres) apres(et);
    if (opts.preparer) opts.preparer(et);
    enregistrer(et); Modal.close();
    location.hash = `#/etude/${et.id}${et.notes.length ? `/${et.notes[et.notes.length - 1].id}` : ''}`;
  };
}
function dialogueAjoutCalcul(et) {
  const b = Modal.open(`<h2>Ajouter un calcul</h2>${typesParFamille().map(([f, ts]) => `<h3>${esc(f)}</h3><div class="types">${ts.map(([k, t]) => `<button class="carte type" data-type="${k}"><span class="ico">${t.icone}</span><span><strong>${esc(t.titre)}</strong><span class="muted petit">${esc(t.description)}</span></span></button>`).join('')}</div>`).join('')}
    <div class="actions"><button class="secondaire" id="annuler">Annuler</button></div>`);
  b.querySelector('#annuler').onclick = Modal.close;
  b.querySelectorAll('[data-type]').forEach(x => x.onclick = () => { const n = nouvelleNote(x.dataset.type); et.notes.push(n); enregistrer(et); Modal.close(); location.hash = `#/etude/${et.id}/${n.id}`; });
}

// Depuis Pipe-Fit : #/nouvelle?client=<id>&devis=<id>&objet=… ouvre « Nouvelle étude » sans chantier, client et devis repris
Vues.nouvelle = {
  html: () => '<p class="muted">Nouvelle étude…</p>',
  bind: () => {
    const q = new URLSearchParams((location.hash.split('?')[1] || '')), clientId = q.get('client') || '', devisId = q.get('devis') || '', affaireId = q.get('chantier') || '';
    history.replaceState(null, '', '#/');
    App.render();
    dialogueNouvelleEtude(affaireDe(affaireId) ? affaireId : '', null, '', {
      objet: q.get('objet') || '',
      preparer: et => { if (!et.affaireId) { et.clientId = clientId; et.devisId = devisId; et.client = (S.pf.entreprises.find(e => e.id === clientId) || {}).nom || et.client; } } });
  },
};

// Étude : en-tête, indices, liste des notes de calcul
Vues.etude = {
  html: p => (p[1] && !['comparer', 'installation'].includes(p[1]) ? Vues.etude.html0(p) : avecCalculsMemorises(() => Vues.etude.html0(p))),
  html0: ([id, noteId, ids]) => {
    const et = etudeDe(id);
    if (!et) return '<p class="erreur">Étude introuvable.</p><p><a href="#/">Retour aux études</a></p>';
    if (noteId === 'comparer') return Vues.comparer.html(et, ids);
    if (noteId === 'installation') return installationHtml(et);
    if (noteId) return Vues.note.html(et, noteId);
    // Études faites avant le registre : fiches déjà chargées inscrites au registre des équipements
    if (!et.modele && typeof Registre !== 'undefined' && !et.equipements) { try { if (Registre.collecter(et)) enregistrer(et); else et.equipements = []; } catch (e) { /* étude incomplète */ } }
    const a = affaireDe(et.affaireId);
    return `<div class="barre"><a href="#/" class="secondaire btn petit">← Études</a><h1 class="titre-etude">${esc(et.objet)}</h1><span class="badge pf">${et.modele ? 'Modèle' : `Indice ${esc(et.indice)}`}</span>
        <span class="espace"></span><span class="muted petit" id="etat-enreg"></span><button class="secondaire" id="inventaire">📑 CCTP / DPGF</button><button class="secondaire" id="materiel">🏷️ Matériel retenu</button><button class="secondaire" id="chiffrer">💶 Métré et chiffrage</button><button id="pdf">📄 Note de calcul PDF</button></div>
      <div class="carte"><div class="grille-champs">
        <label class="large">Objet<input data-e="objet" value="${esc(et.objet)}"></label>
        <label>Affaire Pipe-Fit<select data-e="affaireId">${optionsAffaires(et.affaireId)}</select></label>
        ${et.modele || et.affaireId ? '' : `<label>Client Pipe-Fit (étude sans chantier)<select data-e="clientId"><option value="">—</option>${S.pf.entreprises.filter(e => e.categorie !== 'Fournisseur').slice().sort((x, y) => x.nom.localeCompare(y.nom)).map(e => `<option value="${esc(e.id)}" ${e.id === et.clientId ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></label>
          <label>Devis Pipe-Fit (relie le chantier à son acceptation)<select data-e="devisId"><option value="">—</option>${S.pf.devis.filter(d => !et.clientId || d.clientId === et.clientId).map(d => `<option value="${esc(d.id)}" ${d.id === et.devisId ? 'selected' : ''}>${esc(d.numero || 'brouillon')} — ${esc(d.objet || '')} (${esc(d.statut || '')})</option>`).join('')}</select></label>`}
        <label>Client / maître d'ouvrage<input data-e="client" value="${esc(et.client)}" placeholder="${esc(clientDe(a))}"></label>
        <label>Date<input type="date" data-e="date" value="${esc(et.date)}"></label>
        <label>Rédacteur<input data-e="auteur" value="${esc(et.auteur)}"></label><label>Vérificateur<input data-e="verificateur" value="${esc(et.verificateur)}"></label>
        <label>Approbateur<input data-e="approbateur" value="${esc(et.approbateur || '')}"></label>
        <label>Statut de l'indice ${esc(et.indice)}<select data-e="statut">${Revisions.STATUTS.map(x => `<option ${x === (et.statut || 'Pour avis') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label title="Températures extérieures de base reprises (verrouillées) dans les bilans, les CTA et les lois d'eau des schémas de principe">Climat du site<select data-e="climat">${optionsClimat(et, a)}</select></label>
        ${et.climat === 'perso' ? `<label>Température extérieure de base (hiver) (°C)<input data-e="Tbase" inputmode="decimal" value="${esc(et.Tbase ?? -7)}"></label><label>Température extérieure (été) (°C)<input data-e="Tete" inputmode="decimal" value="${esc(et.Tete ?? 32)}"></label><label>Humidité relative extérieure (été) (%)<input data-e="HRete" inputmode="decimal" value="${esc(et.HRete ?? 40)}"></label>` : ''}
        <label title="Valeur par défaut de l'usage des schémas de principe, du sanitaire, de l'évacuation, de l'objectif acoustique et du profil de régulation ; un choix fait dans un calcul reste">Type de bâtiment<select data-e="typeBatiment">${optionsTypeBatiment(et)}</select></label>
        ${(() => { const sc = !et.climat && a ? Liens.climatDeVille(a.siteVille, a.siteCp) : '', st = !et.typeBatiment ? ConsignesProjet.detecterProfil(et.objet) : ''; return (sc || (st && Liens.TYPES_BATIMENT[st])) && (et.notes || []).length ? `<span><button type="button" class="secondaire petit" id="appliquer-sugg" title="Montre ce qui change dans chaque calcul avant d'appliquer">Appliquer ${[sc ? 'le climat' : '', st && Liens.TYPES_BATIMENT[st] ? 'le type de bâtiment' : ''].filter(Boolean).join(' et ')} proposés à toute l'étude</button></span>` : ''; })()}
        <label>Bâtiment neuf ou existant<select data-e="neuf"><option value="">Non précisé</option><option value="non" ${et.neuf === 'non' ? 'selected' : ''}>Existant</option><option value="oui" ${et.neuf === 'oui' ? 'selected' : ''}>Neuf (permis après le 21 juillet 2021)</option></select></label>
        <label class="large">Objet détaillé, documents de référence (CCTP, plans, indices)<textarea data-e="description" rows="3">${esc(et.description)}</textarea>
          ${a && referencesDocuments(et, a).length ? '<span><button type="button" class="secondaire petit" id="docs-chantier" title="Ajoute les références des documents du chantier dans Pipe-Fit (CCTP, plans… avec indice et date)">📎 Insérer les documents du chantier</button></span>' : ''}</label></div>
        <div class="actions-ligne"><button class="secondaire petit" id="indice">Nouvel indice (${esc(suivantIndice(et.indice))})</button>
          ${et.historique.length ? `<span class="petit muted">Historique : ${et.historique.map(h => `${esc(h.indice)} du ${dateFr(h.date)}${h.motif ? ` (${esc(h.motif)})` : ''}`).join(' · ')}</span>` : ''}
          <span class="espace"></span><button class="secondaire petit" id="dupliquer">Dupliquer l'étude</button>${et.modele ? '' : '<button class="secondaire petit" id="modele">⭐ Enregistrer comme modèle</button>'}<button class="secondaire petit" id="supprimer">Supprimer</button></div></div>
      ${(et.inventaire || []).length ? (() => { const inc = et.inventaire.filter(x => x.inclus !== false), nb = c => inc.filter(x => x.categorie === c).reduce((t, x) => t + (Notes.num(x.qte) || 1), 0), lignes = c => inc.filter(x => x.categorie === c).length;
        return `<div class="carte petit">📑 <strong>Inventaire du dossier de consultation</strong> : ${nb('producteur')} producteur(s), ${lignes('emetteur')} type(s) d'émetteurs, ${lignes('auxiliaire')} type(s) d'auxiliaires — ${esc([...new Set(inc.map(x => InventaireCVC.GENRES[x.genre] && InventaireCVC.GENRES[x.genre].libelle).filter(Boolean))].join(', '))} <button class="secondaire petit" id="inventaire2">Voir / préremplir</button></div>`; })() : ''}
      ${typeof GuideEtude !== 'undefined' ? GuideEtude.html(et) : ''}
      ${typeof parcoursHtml === 'function' ? parcoursHtml(et) : ''}
      ${typeof carteRegistre === 'function' ? carteRegistre(et) : ''}
      ${typeof carteMateriel === 'function' ? carteMateriel(et) : ''}
      ${carteDocuments(et)}
      ${tableauBordHtml(et)}
      <div class="barre"><h2>Calculs <span class="compte">${et.notes.length}</span></h2><button id="ajout">+ Ajouter un calcul</button>${et.notes.some(n => ['pid', 'arbo', 'terminaux', 'cta', 'ecs'].includes(n.type)) ? `<a class="secondaire btn" id="installation" href="#/etude/${et.id}/installation" title="Schémas de principe, circuits, réseaux arborescents, branches et consommateurs d'eau : raccordements et contrôles de cohérence">💧 Installation hydraulique</a>` : ''}<button class="secondaire" id="vrac" title="Charger toutes les fiches techniques du chantier d'un coup, puis les répartir dans les calculs (terminaux, CTA, production, pompes, vase, ballon, bouches, robinetterie…) sans ressaisie">📥 Matériel en vrac</button><span class="espace"></span>
        ${et.notes.length ? '<button class="secondaire" id="fiches-mes" title="Une fiche par équipement (générateurs, pompes, terminaux, CTA…) : points de contrôle, valeurs attendues de l\'étude, mesures à relever">📋 Fiches de mise en service</button>' : ''}
        ${et.notes.length > 1 ? '<button class="secondaire" id="comparer" disabled title="Cocher au moins deux calculs">⚖️ Comparer la sélection</button>' : ''}</div>
      ${et.notes.length ? `<div class="notes">${et.notes.map((n, i) => { const t = Notes.TYPES[n.type], r = Liens.calculer(et, n), err = r.alertes.filter(x => x.niveau === 'erreur').length, att = r.alertes.filter(x => x.niveau === 'attention').length;
        return `<div class="carte note"><a href="#/etude/${et.id}/${n.id}" class="note-lien"><span class="ico">${t.icone}</span><span><span class="muted petit">N${i + 1} · ${esc(t.famille)}${n.lien || n.entrees.cta || (n.type === 'cta' && Liens.reseauxDeCta(et.notes, n).length) || Liens.circuitDeAnnexe(et.notes, n) || (n.entrees.circuits || []).some(c => c.bilan || c.annexe) ? ' · 🔗 lié' : ''}</span><strong>${esc(n.titre)}</strong>
          <span class="petit">${esc(r.synthese)}</span></span></a><span class="note-etat">${err ? `<span class="badge erreur">${err} erreur(s)</span>` : att ? `<span class="badge">${att} point(s) d'attention</span>` : '<span class="badge ok">Conforme</span>'}${etatEmission(et, n)}</span>
          <span class="note-actions"><label class="case petit" title="Sélectionner pour comparer"><input type="checkbox" data-comparer="${n.id}"> comparer</label><button class="icone" data-monter="${i}" title="Monter" ${i ? '' : 'disabled'}>▲</button><button class="icone" data-descendre="${i}" title="Descendre" ${i < et.notes.length - 1 ? '' : 'disabled'}>▼</button></span></div>`; }).join('')}</div>`
        : '<p class="muted">Aucun calcul : ajoutez-en un ou versez un calcul rapide dans cette étude.</p>'}`;
  },
  bind: (root, [id, noteId, ids]) => {
    const et = etudeDe(id);
    if (!et) return;
    if (noteId === 'comparer') return Vues.comparer.bind(root, et, ids);
    if (noteId === 'installation') return lierInstallation(root, et);
    if (noteId) return Vues.note.bind(root, et, noteId);
    const fm = root.querySelector('#fiches-mes');
    if (fm) fm.onclick = () => dialogueFichesMes(et);
    root.querySelectorAll('#vrac, #vrac2').forEach(b => { b.onclick = () => dialogueVrac(et); });
    if (typeof lierParcours === 'function') lierParcours(root, et);
    if (typeof GuideEtude !== 'undefined') GuideEtude.lier(root, et);
    const rg = root.querySelector('#registre');
    if (rg) rg.onclick = () => dialogueRegistre(et);
    const ancienEtude = { climat: et.climat, typeBatiment: et.typeBatiment, neuf: et.neuf };
    const sg = root.querySelector('#appliquer-sugg');
    if (sg) sg.onclick = () => { const a = affaireDe(et.affaireId), m = {}; const sc = !et.climat && a ? Liens.climatDeVille(a.siteVille, a.siteCp) : '', st = !et.typeBatiment ? ConsignesProjet.detecterProfil(et.objet) : '';
      if (sc) m.climat = sc; if (st && Liens.TYPES_BATIMENT[st]) m.typeBatiment = st; appliquerDonneesEtude(et, m); };
    root.querySelectorAll('[data-e]').forEach(el => {
      el.onchange = el.oninput = () => {
        et[el.dataset.e] = el.value;
        if (el.dataset.e === 'affaireId') { et.client = clientDe(affaireDe(el.value)) || et.client; reprendreChantier(et, affaireDe(el.value)); enregistrer(et); return App.render(); }
        if (['climat', 'typeBatiment', 'neuf'].includes(el.dataset.e)) { const v = el.value; et[el.dataset.e] = ancienEtude[el.dataset.e] ?? ''; return appliquerDonneesEtude(et, { [el.dataset.e]: v }); }
        if (el.dataset.e === 'clientId') { et.client = (S.pf.entreprises.find(e => e.id === el.value) || {}).nom || et.client; if (et.devisId && (S.pf.devis.find(d => d.id === et.devisId) || {}).clientId !== el.value) et.devisId = ''; enregistrer(et); return App.render(); }
        if (el.dataset.e === 'devisId') { enregistrer(et); return; }
        if (el.dataset.e === 'objet') root.querySelector('.titre-etude').textContent = el.value;
        if (String(et.objet).trim()) enregistrer(et);
      };
    });
    root.querySelector('#pdf').onclick = () => genererNoteCalcul(et);
    const dc = root.querySelector('#docs-chantier');
    if (dc) dc.onclick = () => {
      const d = String(et.description || ''), refs = referencesDocuments(et, affaireDe(et.affaireId)).filter(r => !d.includes(r));
      if (!refs.length) return toast('Les documents du chantier sont déjà cités.', 4000);
      et.description = `${d.trim()}${d.trim() ? '\n' : ''}Documents de référence : ${refs.join(' ; ')}.`;
      enregistrer(et); App.render(); toast(`${refs.length} document(s) du chantier cité(s).`);
    };
    bindDocuments(root, et);
    root.querySelector('#chiffrer').onclick = () => dialogueChiffrage(et);
    root.querySelectorAll('#materiel, #materiel2').forEach(b => { b.onclick = () => dialogueMateriel(et); });
    root.querySelector('#inventaire').onclick = () => dialogueInventaire(et);
    const inv2 = root.querySelector('#inventaire2');
    if (inv2) inv2.onclick = () => tableauInventaire(et, et.inventaire.map(x => ({ ...x })), []);
    root.querySelector('#ajout').onclick = () => dialogueAjoutCalcul(et);
    root.querySelector('#indice').onclick = () => {
      const b = Modal.open(`<h2>Nouvel indice ${esc(suivantIndice(et.indice))}</h2><label>Motif de la révision<input id="motif" placeholder="Ex. : prise en compte des remarques du BET"></label>
        <div class="actions"><button class="secondaire" id="annuler">Annuler</button><button id="ok">Créer l'indice</button></div>`);
      b.querySelector('#annuler').onclick = Modal.close;
      b.querySelector('#ok').onclick = () => { et.historique.push({ indice: et.indice, date: et.date, motif: et.motifIndice || '', statut: et.statut || '', redige: et.auteur || '', verifie: et.verificateur || '', approuve: et.approbateur || '' }); et.indice = suivantIndice(et.indice); et.motifIndice = b.querySelector('#motif').value; et.date = aujourdhui(); enregistrer(et); Modal.close(); App.render(); };
    };
    root.querySelector('#dupliquer').onclick = () => {
      const c = { ...sansEmissions(copie(et)), id: uidE(), objet: `${et.objet} (copie)`, indice: 'A', historique: [], date: aujourdhui(), auteur: S.me.nom || S.me.login };
      ['_v', '_at', '_by'].forEach(k => delete c[k]);
      // Nouveaux identifiants, liens entre notes reportés sur les copies
      const ids = new Map(c.notes.map(n => [n.id, uidE()]));
      c.notes.forEach(n => { n.id = ids.get(n.id); if (n.lien) n.lien.note = ids.get(n.lien.note) || n.lien.note; if (n.entrees.cta) n.entrees.cta = ids.get(n.entrees.cta) || ''; (n.entrees.circuits || []).forEach(x => { if (x.bilan) x.bilan = ids.get(x.bilan) || x.bilan; if (x.annexe) x.annexe = ids.get(x.annexe) || ''; }); });
      enregistrer(c); location.hash = `#/etude/${c.id}`;
    };
    const bm = root.querySelector('#modele');
    if (bm) bm.onclick = () => {
      const b = Modal.open(`<h2>Enregistrer comme modèle</h2><p class="muted petit">Le modèle reprend les calculs et leurs liens, sans l'affaire ni l'historique ; il apparaît dans « Nouvelle étude ».</p>
        <label>Nom du modèle<input id="nom-modele" value="${esc(et.objet)}"></label><div class="actions"><button class="secondaire" id="annuler">Annuler</button><button id="ok">Enregistrer</button></div>`);
      b.querySelector('#annuler').onclick = Modal.close;
      b.querySelector('#ok').onclick = () => {
        const nom = b.querySelector('#nom-modele').value.trim();
        if (!nom) return;
        const m = { ...sansEmissions(copie(et)), id: uidE(), modele: true, objet: nom, affaireId: '', client: '', indice: 'A', historique: [], motifIndice: '', verificateur: '' };
        ['_v', '_at', '_by'].forEach(k => delete m[k]);
        enregistrer(m); Modal.close(); toast('Modèle enregistré : disponible dans « Nouvelle étude »');
      };
    };
    root.querySelector('#supprimer').onclick = async () => {
      if (!(await confirmer(`Supprimer l'étude « ${et.objet} » et ses ${et.notes.length} calcul(s) ?`, 'Supprimer'))) return;
      await api('DELETE', `/api/etudes/${et.id}`).catch(e => toast(e.message));
      S.etudes = S.etudes.filter(x => x !== et); location.hash = '#/';
    };
    const bc = root.querySelector('#comparer');
    if (bc) {
      const coches = () => [...root.querySelectorAll('[data-comparer]:checked')].map(x => x.dataset.comparer);
      root.querySelectorAll('[data-comparer]').forEach(x => x.onchange = () => { bc.disabled = coches().length < 2; });
      bc.onclick = () => { location.hash = `#/etude/${et.id}/comparer/${coches().join(',')}`; };
    }
    const deplacer = (i, j) => { const [n] = et.notes.splice(i, 1); et.notes.splice(j, 0, n); enregistrer(et); App.render(); };
    root.querySelectorAll('[data-monter]').forEach(b => b.onclick = () => deplacer(+b.dataset.monter, +b.dataset.monter - 1));
    root.querySelectorAll('[data-descendre]').forEach(b => b.onclick = () => deplacer(+b.dataset.descendre, +b.dataset.descendre + 1));
  },
};
const suivantIndice = i => (/^[A-Y]$/.test(i) ? String.fromCharCode(i.charCodeAt(0) + 1) : /^\d+$/.test(i) ? String(+i + 1) : `${i}'`);

// Métré de l'étude, rapprochement avec la bibliothèque de prix Pipe-Fit et création d'un devis brouillon
function dialogueChiffrage(et) {
  const arts = S.pf.articles || [], mos = S.pf.mainoeuvre || [], a = affaireDe(et.affaireId);
  const postes = Metre.rapprocher(Metre.metre(et), arts, mos);
  if (!postes.length) return toast('Aucune quantité à chiffrer : ajouter des calculs de réseau, de schéma ou d\'isolation.', 5000);
  const ligneArt = (p, i) => `<select data-art="${i}"><option value="">Hors bibliothèque (prix à saisir)</option>${[...p.candidats, ...(p.articleId && !p.candidats.some(c => c.id === p.articleId) ? [arts.find(x => x.id === p.articleId)] : [])].filter(Boolean)
    .map(c => `<option value="${esc(c.id)}" ${c.id === p.articleId ? 'selected' : ''}>${esc(c.ref ? `${c.ref} — ` : '')}${esc(c.designation)} (${Notes.nf(Number(c.prixVente) || 0, 2)} €)</option>`).join('')}</select>`;
  const total = () => postes.filter(p => p.inclus !== false).reduce((s, p) => { const x = Metre.prixPoste(p, arts, mos); return { ht: s.ht + x.total, h: s.h + x.heures }; }, { ht: 0, h: 0 });
  const rendu = () => {
    const t = total(), hors = postes.filter(p => p.inclus !== false && !p.articleId && p.recherche.type !== 'aucune').length;
    return `<h2>Métré et chiffrage</h2>
      <p class="muted petit">Quantités tirées des calculs de l'étude (les notes créées depuis le schéma ne sont pas comptées deux fois), rapprochées de la bibliothèque de prix de Pipe-Fit. Les postes sans article deviennent des ouvrages « hors bibliothèque » à prix nul, à compléter dans le devis.</p>
      <div class="defile metre"><table class="liste compact"><thead><tr><th></th><th>Poste</th><th>Qté</th><th>Unité</th><th>Article de la bibliothèque</th><th>h / unité</th><th>Total estimé (€ HT)</th></tr></thead><tbody>
      ${Metre.CHAPITRES.map(ch => { const ps = postes.map((p, i) => [p, i]).filter(([p]) => p.chapitre === ch); return ps.length ? `<tr class="total"><td colspan="7">${esc(ch)}</td></tr>${ps.map(([p, i]) => `<tr>
        <td><input type="checkbox" data-inc="${i}" ${p.inclus === false ? '' : 'checked'} aria-label="Inclure"></td><td>${esc(p.designation)}<div class="muted petit">${esc(p.sources.join(', '))}</div></td>
        <td><input class="nombre qte" data-qte="${i}" value="${esc(String(p.qte).replace('.', ','))}"></td><td>${esc(p.unite)}</td><td>${p.recherche.type === 'aucune' ? '<span class="muted petit">main-d\'œuvre seule</span>' : ligneArt(p, i)}</td>
        <td><input class="nombre qte" data-h="${i}" value="${esc(String(Math.round(p.heures * 100) / 100).replace('.', ','))}"></td><td>${Notes.nf(Metre.prixPoste(p, arts, mos).total, 0)}</td></tr>`).join('')}` : ''; }).join('')}
      </tbody></table></div>
      <p><strong>Total estimé : ${Notes.nf(t.ht, 0)} € HT</strong> · ${Notes.nf(t.h, 1)} h de main-d'œuvre${hors ? ` · <span class="manque">${hors} poste(s) hors bibliothèque à chiffrer</span>` : ''}${arts.length ? '' : ' · <span class="manque">bibliothèque de prix Pipe-Fit indisponible</span>'}</p>
      ${a ? `<p class="petit">Le devis brouillon sera créé dans Pipe-Fit pour <strong>${esc(libelleAffaire(a))}</strong> (${esc(clientDe(a))}).</p>` : '<p class="petit manque">Rattacher l\'étude à une affaire Pipe-Fit pour créer le devis.</p>'}
      <div class="actions"><button class="secondaire" id="ch-fermer">Fermer</button><button class="secondaire" id="ch-csv">Télécharger le métré (CSV)</button>${a || et.clientId ? `<button id="ch-devis">Créer le devis brouillon dans Pipe-Fit${a ? '' : ' (pour le client)'}</button>` : ''}</div>`;
  };
  const box = Modal.open(rendu());
  box.classList.add('large');
  const lier = () => {
    box.querySelector('#ch-fermer').onclick = () => { box.classList.remove('large'); Modal.close(); };
    const maj = () => { box.innerHTML = rendu(); lier(); };
    box.querySelectorAll('[data-inc]').forEach(x => x.onchange = () => { postes[+x.dataset.inc].inclus = x.checked; maj(); });
    box.querySelectorAll('[data-art]').forEach(x => x.onchange = () => { postes[+x.dataset.art].articleId = x.value; maj(); });
    box.querySelectorAll('[data-qte]').forEach(x => x.onchange = () => { postes[+x.dataset.qte].qte = Notes.num(x.value); maj(); });
    box.querySelectorAll('[data-h]').forEach(x => x.onchange = () => { postes[+x.dataset.h].heures = Notes.num(x.value); maj(); });
    box.querySelector('#ch-csv').onclick = () => enregistrerFichier(box, `Metre_${String(et.objet).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 40)}.csv`, new TextEncoder().encode(`\uFEFF${Metre.csv(postes)}`), 'text/csv');
    const bd = box.querySelector('#ch-devis');
    if (bd) bd.onclick = async () => {
      bd.disabled = true; bd.textContent = 'Création…';
      try {
        const r = await api('POST', '/api/pf/devis', { affaireId: et.affaireId, clientId: et.clientId || '', etudeId: et.id, objet: `${et.objet} — chiffrage bureau d'études`, lignes: Metre.lignesDevis(postes, arts, mos) });
        const pf = S.me.pipefit || (/^https?:$/.test(location.protocol) ? `${location.protocol}//${location.hostname}:3000` : '');
        bd.outerHTML = `<span class="badge ok">Devis ${esc(r.numero || '')} créé en brouillon</span>${pf ? `<a class="btn" href="${esc(pf)}/#/devis/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Ouvrir dans Pipe-Fit ↗</a>` : ''}`;
        et.devisPF = [...(et.devisPF || []), { id: r.id, numero: r.numero, date: aujourdhui() }];
        // Sans chantier : l'étude suit ce devis (le chantier créé à son acceptation y sera relié)
        if (!et.affaireId) { et.devisId = r.id; S.pf.devis.push({ id: r.id, numero: r.numero, objet: '', clientId: et.clientId, statut: 'Brouillon' }); }
        enregistrer(et);
      } catch (e) { bd.disabled = false; bd.textContent = 'Créer le devis brouillon dans Pipe-Fit'; toast(e.message, 6000); }
    };
  };
  lier();
}

// Comparaison de variantes : résultats et données d'entrée côte à côte
function comparaisonHtml(et, notes) {
  const res = notes.map(n => Liens.calculer(et, n)), ents = notes.map(n => Liens.resoudre(et, n).entrees);
  const libelles = [...new Set(res.flatMap(r => r.resume.map(([k]) => k)))];
  const ligne = (lib, vals, cls = '') => { const diff = new Set(vals.map(String)).size > 1; return `<tr class="${diff ? 'diff' : ''} ${cls}"><th>${esc(lib)}</th>${vals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`; };
  const memeType = notes.every(n => n.type === notes[0].type);
  const entrees = memeType ? Notes.TYPES[notes[0].type].champs.filter(c => c.k).map(c => {
    const val = e => (c.t === 'lignes' ? `${(e[c.k] || []).length} ligne(s)` : c.t === 's' ? ((optionsDe(c, e).find(([k]) => String(k) === String(e[c.k] ?? '')) || [])[1] || '—') : `${valeurChamp(e[c.k]) || '—'}${c.u && e[c.k] !== '' ? ` ${c.u}` : ''}`);
    const brut = ents.map(e => JSON.stringify(e[c.k] ?? ''));
    return new Set(brut).size > 1 ? [c.l, ents.map(val)] : null;
  }).filter(Boolean) : [];
  const tete = `<thead><tr><th></th>${notes.map(n => `<th>N${et.notes.indexOf(n) + 1} — ${esc(n.titre)}</th>`).join('')}</tr></thead>`;
  return `<table class="comparaison">${tete}<tbody>
    ${ligne('Synthèse', res.map(r => r.synthese), 'synthese')}
    ${ligne('Contrôles', res.map(r => { const e = r.alertes.filter(a => a.niveau === 'erreur').length, a = r.alertes.filter(x => x.niveau === 'attention').length; return e ? `${e} non-conformité(s)` : a ? `${a} point(s) d'attention` : 'Conforme'; }))}
    ${libelles.map(k => ligne(k, res.map(r => (r.resume.find(([x]) => x === k) || [, '—'])[1]))).join('')}</tbody></table>
    ${memeType ? `<h2>Données d'entrée qui diffèrent</h2>${entrees.length ? `<table class="comparaison">${tete}<tbody>${entrees.map(([l, v]) => ligne(l, v)).join('')}</tbody></table>` : '<p class="muted">Aucune différence de saisie.</p>'}` : '<p class="muted petit">Calculs de types différents : seuls les résultats sont comparés.</p>'}`;
}
Vues.comparer = {
  html: (et, ids) => {
    const notes = String(ids || '').split(',').map(id => et.notes.find(n => n.id === id)).filter(Boolean);
    contexteEtude = et;
    if (notes.length < 2) return `<p class="erreur">Sélectionner au moins deux calculs.</p><p><a href="#/etude/${et.id}">Retour à l'étude</a></p>`;
    return `<div class="barre"><a href="#/etude/${et.id}" class="secondaire btn petit">← ${esc(et.objet)}</a><h1>Comparaison de variantes</h1><span class="espace"></span><button id="pdf-comp">📄 PDF de la comparaison</button></div>
      <p class="muted petit">Les lignes surlignées diffèrent d'une variante à l'autre. Dupliquer un calcul permet de créer une variante.</p>
      <div class="carte defile-x">${comparaisonHtml(et, notes)}</div>`;
  },
  bind: (root, et, ids) => {
    const b = root.querySelector('#pdf-comp');
    if (!b) return;
    b.onclick = async () => {
      const notes = String(ids).split(',').map(id => et.notes.find(n => n.id === id)).filter(Boolean);
      const box = Modal.open('<h2>Comparaison</h2><p>Mise en page…</p>');
      try {
        const html = pourPdf(`<div class="doe-doc ndc"><h2>COMPARAISON DE VARIANTES</h2><p class="petit">${esc(et.objet)} — ${dateFr(aujourdhui())}</p>${comparaisonHtml(et, notes).replace(/class="comparaison"/g, 'class="tn comparaison"')}</div>`);
        const bytes = await PDF.depuisHTML(html, 'Comparaison de variantes', null, { margeHaut: 42, margeBas: 42 }), nom = `Comparaison_${String(et.objet).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 40)}.pdf`;
        box.innerHTML = `<h2>Comparaison générée</h2><p><strong>${esc(nom)}</strong></p><div class="actions"><button class="secondaire" id="f">Fermer</button><button id="dl">Télécharger le PDF</button></div>`;
        box.querySelector('#f').onclick = Modal.close; box.querySelector('#dl').onclick = () => enregistrerFichier(box, nom, bytes, 'application/pdf');
      } catch (e) { box.innerHTML = `<h2>Génération impossible</h2><p class="erreur">${esc(e.message)}</p>`; }
    };
  },
};

// Fiche technique de la CTA (PDF du fabricant) : valeurs lues proposées champ par champ, puis reportées dans le calcul de
// CTA (ou, pour un schéma aéraulique relié à un calcul de CTA, dans ce calcul) ; pression disponible et puissances
// gardées pour le contrôle du calcul
// Fiche technique d'un équipement : choisie sur l'ordinateur ou dans la bibliothèque de Pipe-Fit (matériel retenu proposé)
const TYPES_FICHE = ['cta', 'aero', 'reseau', 'arbo', 'vase', 'ecs', 'pid', 'terminaux'];
const PREFIXE_MATERIEL = { cta: ['cta|'], aero: ['aero|', 'cta|'], reseau: ['pompe|'], arbo: ['pompe|'], vase: ['vase|'], pid: ['gen|'], ecs: ['echangeur|'] };
function dialogueFiche(et, n) {
  const ret = Object.entries(et.materiel || {}).find(([cle, x]) => x && x.reference && (PREFIXE_MATERIEL[n.type] || []).some(pf => cle.startsWith(pf)));
  const q0 = ret ? [ret[1].fabricant, ret[1].reference].filter(Boolean).join(' ') : '';
  const b = Modal.open(`<h2>📄 Fiche technique</h2><p class="muted petit">Les caractéristiques lues remplissent le calcul et contrôlent le matériel choisi.</p>
    <p><label class="btn">💻 Choisir le PDF (ou la fiche texte) sur l'ordinateur<input type="file" id="ft-fichier" accept=".pdf,application/pdf,image/*,.txt,.md,text/plain" hidden></label></p>
    <details><summary>📋 Coller une fiche au format Pipe-Fit (texte « clé : valeur »)</summary>
      <textarea id="ft-texte" rows="8" style="width:100%" placeholder="Fabricant : …&#10;Référence : …&#10;Puissance chaud : 3,2 kW&#10;…"></textarea>
      <p class="petit muted">Texte préparé avec le modèle de fiche Pipe-Fit (une valeur par ligne, unité écrite) : il est lu comme une fiche PDF.</p>
      <button class="secondaire petit" id="ft-lire">Lire le texte collé</button></details>
    <h3>📚 Bibliothèque des fiches techniques de Pipe-Fit</h3>
    <input type="search" id="ft-q" value="${esc(q0)}" placeholder="Fabricant, référence, désignation…" style="width:100%">${ret ? `<p class="petit muted">Matériel retenu pour ce calcul : ${esc(q0)}</p>` : ''}
    <div id="ft-liste" class="ft-liste"><p class="muted petit">Recherche…</p></div>
    <div class="actions"><button class="secondaire" id="ft-x">Annuler</button></div>`);
  b.querySelector('#ft-x').onclick = Modal.close;
  b.querySelector('#ft-fichier').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) { Modal.close(); chargerFiche(et, n, f); } };
  b.querySelector('#ft-lire').onclick = () => { const t = b.querySelector('#ft-texte').value; if (!t.trim()) return toast('Collez d\'abord le texte de la fiche.', 3000); Modal.close(); appliquerFiche(et, n, t.split(/\r?\n/), 'Fiche au format Pipe-Fit'); };
  let minuterie = 0;
  const chercher = async () => {
    const z = b.querySelector('#ft-liste');
    let l = [];
    try { l = await api('GET', `/api/pf/fiches/liste?q=${encodeURIComponent(b.querySelector('#ft-q').value)}`); } catch (e) { z.innerHTML = `<p class="petit erreur">Bibliothèque indisponible : ${esc(e.message)}</p>`; return; }
    z.innerHTML = l.length ? l.map((f, i) => `<button class="secondaire ft-item" data-ft="${i}"><strong>${esc([f.fabricant, (f.references || []).slice(0, 3).join(', ')].filter(Boolean).join(' — '))}</strong><br><span class="petit muted">${esc(f.designation || f.nom || '')}${f.date ? ` · ${esc(f.date.slice(0, 7))}` : ''}</span></button>`).join('') : '<p class="muted petit">Aucune fiche trouvée.</p>';
    z.querySelectorAll('[data-ft]').forEach(x => x.onclick = async () => {
      const f = l[+x.dataset.ft]; Modal.close(); toast('Lecture de la fiche de la bibliothèque…', 2500);
      try {
        let pages = (await api('GET', `/api/pf/fiches/pages?id=${encodeURIComponent(f.id)}`)).pages || [];
        // Texte non encore lu par Pipe-Fit (fiche scannée) : PDF lu ici
        if (!pages.join('').trim() && f.fichierId) { const r = await fetch(`/api/pf/fichier/${encodeURIComponent(f.fichierId)}`); if (r.ok) { const bl = await r.blob(); pages = (await PdfLecture.lire(new File([bl], f.nom || 'fiche.pdf', { type: bl.type || 'application/pdf' }), () => {}, { pagesMax: 12, ocr: typeof OCR !== 'undefined' })).lignes; } }
        appliquerFiche(et, n, pages.join('\n').split(/\r?\n/), f.nom || [f.fabricant, (f.references || [])[0]].filter(Boolean).join(' '));
      } catch (e) { toast(`Fiche illisible : ${e.message}`, 5000); }
    });
  };
  b.querySelector('#ft-q').oninput = () => { clearTimeout(minuterie); minuterie = setTimeout(chercher, 250); };
  chercher();
}
async function chargerFiche(et, n, fichier) {
  toast('Lecture de la fiche technique…', 2500);
  try {
    // Fiche texte (format Pipe-Fit) : lue telle quelle
    if (/^text\//.test(fichier.type || '') || /\.(txt|md)$/i.test(fichier.name || '')) return appliquerFiche(et, n, (await fichier.text()).split(/\r?\n/), fichier.name);
    const { lignes } = await PdfLecture.lire(fichier, () => {}, { pagesMax: 12, ocr: typeof OCR !== 'undefined' }); appliquerFiche(et, n, lignes, fichier.name);
  }
  catch (e) { toast(`Fiche illisible : ${e.message}`, 5000); }
}
function appliquerFiche(et, n, lignesTexte, nomFichier) {
  if (n.type === 'terminaux') return appliquerFicheTerminal(et, n, lignesTexte, nomFichier);
  if (n.type === 'aero' && cibleBouche !== '') return appliquerFicheBouche(et, n, lignesTexte, nomFichier);
  if (n.type === 'sanitaire') return appliquerFichePoint(et, n, lignesTexte, nomFichier);
  if (['pid', 'arbo'].includes(n.type) && cibleRobinet !== '') return appliquerFicheRobinet(et, n, lignesTexte, nomFichier);
  if (['pid', 'arbo'].includes(n.type) && ciblePompe !== '') return appliquerFichePompe(et, n, lignesTexte, nomFichier);
  // CTA et schéma aéraulique : lecture détaillée d'une centrale ; autres équipements : pompe, vase, ballon, générateur
  const Mod = ['cta', 'aero'].includes(n.type) ? FicheCta : FicheEquip, r = Mod.lire(lignesTexte), fichier = { name: nomFichier };
  if (!r.nb) return confirmer('Aucune caractéristique reconnue dans ce document (PDF scanné ou mise en page inhabituelle). Saisissez les valeurs à la main.', 'OK');
  // Schéma aéraulique relié à un calcul de CTA : la centrale (débits, batteries, récupérateur…) est remplie dans ce calcul
  const cible = n.type === 'aero' && n.entrees.cta ? et.notes.find(x => x.id === n.entrees.cta && x.type === 'cta') : null;
  const lignes = Mod === FicheEquip ? FicheEquip.champs(n.type, r.valeurs).map(c => ({ ...c, note: n })) : [...FicheCta.champs(cible ? 'cta' : n.type, r.valeurs).map(c => ({ ...c, note: cible || n })), ...(cible ? FicheCta.champs('aero', r.valeurs).filter(c => /^LwFab/.test(c.k)).map(c => ({ ...c, note: n })) : [])];
  const libVal = (note, k, v) => { const ch = (Notes.TYPES[note.type].champs || []).find(c => c.k === k); if (ch && ch.t === 's') { const o = (typeof ch.o === 'function' ? ch.o(note.entrees, ctxEtude(et, note)) : ch.o).find(([x]) => String(x) === String(v)); return o ? o[1] : String(v ?? ''); } return v === '' || v === undefined ? '—' : String(v).replace('.', ','); };
  const controles = Mod === FicheEquip ? Object.keys(r.valeurs).filter(k => FicheEquip.LIBELLES[k] && !lignes.some(c => c.cle === k)) : Object.keys(FicheCta.fiche(r, '')).filter(k => FicheCta.LIBELLES[k] && !['Qs', 'Qr'].includes(k));
  const nom = [r.fabricant, r.reference].filter(Boolean).join(' ');
  const b = Modal.open(`<h2>Fiche technique${nom ? ` : ${esc(nom)}` : ''}</h2><p class="muted petit">${esc(fichier.name)} · ${r.nb} caractéristique(s) reconnue(s). Décochez ce qui ne doit pas être repris${cible ? ` ; la centrale est remplie dans le calcul relié « ${esc(cible.titre)} »` : ''}.</p>
    ${lignes.length ? `<div class="defile-x"><table><thead><tr><th></th><th>Donnée</th><th>Lu sur la fiche</th><th>Valeur actuelle</th></tr></thead><tbody>${lignes.map((c, i) => {
      const actuel = c.note.entrees[c.k], same = String(actuel) === String(c.val);
      return `<tr title="${esc(r.sources[c.cle] || '')}"><td><input type="checkbox" data-fc="${i}" ${same ? '' : 'checked'}></td><td>${esc(c.libelle)}${c.unite ? ` <span class="muted petit">(${esc(c.unite)})</span>` : ''}</td><td><strong>${esc(libVal(c.note, c.k, c.val))}</strong></td><td class="${same ? 'ok-texte' : 'muted'}">${esc(libVal(c.note, c.k, actuel))}${same ? ' ✓' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p>Aucune donnée à reporter dans ce calcul.</p>'}
    ${controles.length ? `<p class="petit"><strong>Gardé pour le contrôle du calcul</strong> : ${controles.map(k => `${esc(Mod.LIBELLES[k][0])} ${esc(String(r.valeurs[k]).replace('.', ','))} ${esc(Mod.LIBELLES[k][1])}`).join(' · ')}.</p>` : ''}
    <div class="actions"><button class="secondaire" id="fc-annuler">Annuler</button><button id="fc-ok">Reprendre les valeurs cochées</button></div>`);
  b.querySelector('#fc-annuler').onclick = Modal.close;
  b.querySelector('#fc-ok').onclick = () => {
    let k = 0;
    lignes.forEach((c, i) => { if (b.querySelector(`[data-fc="${i}"]`).checked) { c.note.entrees[c.k] = c.val; k++; } });
    // Fiche gardée avec le calcul de la centrale (et avec le schéma, pour la pression disponible face au réseau calculé)
    const f = Mod.fiche(r, fichier.name);
    (cible ? [cible, n] : [n]).forEach(x => { x.entrees.fiche = f; });
    const exclus = new Set(lignes.filter((c, i) => !b.querySelector(`[data-fc="${i}"]`).checked).map(c => c.cle)), lue = Object.fromEntries(Object.entries(r.valeurs).filter(([c]) => !exclus.has(c)));
    (cible ? [cible, n] : [n]).forEach(x => { if (typeof Registre !== 'undefined') Registre.lier(et, x, x.entrees, lue); });
    enregistrer(et); Modal.close(); App.render();
    toast(`${k} valeur(s) reprise(s) de la fiche${controles.length ? ' ; pression disponible et puissances contrôlées dans les résultats' : ''}`, 5000);
  };
}

// Fiches techniques de tous les éléments de l'installation (production, terminaux, pompes, CTA) vues depuis le schéma
// de principe ou le réseau arborescent : chargées ici, elles vont dans le calcul de l'élément et reviennent partout
// Réseau arborescent, réseau et pompe ou CTA pas encore dans un schéma de principe : le placer sur un circuit (existant
// ou nouveau, nommé comme le réseau) ; une fois relié, renommer le réseau renomme son circuit dans le schéma
function placerSchemaHtml(et, n) {
  if (n.type === 'cta') return batteriesCtaHtml(et, n);
  if (n.type === 'pid') return placerSousStationHtml(et, n);
  if (!['arbo', 'reseau'].includes(n.type) || n.lien || Liens.circuitDeAnnexe(et.notes, n)) return '';
  const pids = et.notes.map((x, i) => [x, i]).filter(([x]) => x.type === 'pid');
  const opts = pids.map(([p, i]) => `<optgroup label="Schéma de principe N${i + 1} — ${esc(p.titre)}"><option value="${p.id}|-1">➕ Nouveau circuit « ${esc(n.titre)} »</option>${((p.entrees || {}).circuits || []).map((c, k) => [c, k]).filter(([c]) => !c.annexe).map(([c, k]) => `<option value="${p.id}|${k}">Circuit existant : ${esc(c.rep || `C${k + 1}`)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="bandeau-lien">🧭 Ce réseau n'apparaît pas encore dans le schéma de principe. ${opts ? `<select id="schema-circuit" aria-label="Circuit du schéma de principe">${opts}</select> <button class="secondaire petit" id="schema-relier">Placer dans le schéma</button>` : '<button class="secondaire petit" id="schema-creer">Créer le schéma de principe avec ce circuit</button>'}
    <span class="muted petit">Le circuit porte le nom du réseau (renommer le réseau le renomme dans le schéma) ; puissance et pertes de charge remontent au circuit.</span></div>`;
}
// Schéma de principe à échangeur (sous-station) ou sur boucle d'eau tempérée, pas encore alimenté : le relier au circuit
// d'un autre schéma (existant ou nouveau) — puissance et pertes de charge côté primaire remontent, régime et pression
// disponible redescendent
function placerSousStationHtml(et, n) {
  if (Liens.circuitDeAnnexe(et.notes, n)) return '';
  let e; try { e = Liens.resoudre(et, n).entrees; } catch (err) { e = n.entrees || {}; }
  if (!Schema.sousStation(e) && !Schema.sourceBoucle(e)) return '';
  const aval = Liens.schemasAval(et.notes, n), pids = et.notes.map((x, i) => [x, i]).filter(([x]) => x.type === 'pid' && x.id !== n.id && !aval.has(x.id));
  const opts = pids.map(([p, i]) => `<optgroup label="Schéma de principe N${i + 1} — ${esc(p.titre)}"><option value="${p.id}|-1">➕ Nouveau circuit « ${esc(n.titre)} »</option>${((p.entrees || {}).circuits || []).map((c, k) => [c, k]).filter(([c]) => !c.annexe).map(([c, k]) => `<option value="${p.id}|${k}">Circuit existant : ${esc(c.rep || `C${k + 1}`)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="bandeau-lien">🧭 ${Schema.sousStation(e) ? 'Sous-station' : 'Boucle d\'eau tempérée'} non reliée : quel circuit l'alimente ? ${opts ? `<select id="schema-circuit" aria-label="Circuit amont">${opts}</select> <button class="secondaire petit" id="schema-relier">Relier au circuit amont</button>` : '<button class="secondaire petit" id="schema-creer">Créer le schéma amont (chaufferie, réseau primaire) avec ce circuit</button>'}
    <span class="muted petit">Le circuit amont reprend la puissance appelée (simultanéité comprise) et les pertes de charge côté primaire ; ce schéma reprend le régime primaire, le fluide et la pression disponible.</span></div>`;
}
// CTA : chaque batterie à eau raccordée à son réseau — branche du réseau arborescent chaud (batterie chaude) ou froid
// (batterie froide), ou circuit du schéma de principe dont le régime la dessert
function batteriesCtaHtml(et, n) {
  const bats = Liens.batteriesCta(et, n);
  if (!bats.length) return '';
  const pids = et.notes.map((x, i) => [x, i]).filter(([x]) => x.type === 'pid');
  const ligne = x => {
    if (x.lien) return `<li>✅ ${esc(x.libelle)} : ${x.lien.type === 'arbo' ? `branche ${esc(x.lien.rep)} de <a href="#/etude/${et.id}/${x.lien.note.id}">${esc(x.lien.note.titre)}</a>${Liens.circuitDeAnnexe(et.notes, x.lien.note) ? '' : ' <span class="avert">(réseau pas encore en départ du schéma de principe)</span>'}` : `circuit « ${esc(x.lien.pid.entrees.circuits[x.lien.i].rep)} » de <a href="#/etude/${et.id}/${x.lien.pid.id}">${esc(x.lien.pid.titre)}</a>`}</li>`;
    const arbos = et.notes.map((a, i) => [a, i]).filter(([a]) => a.type === 'arbo' && ((a.entrees || {}).saison || 'chaud') === x.saison && Liens.batteriesLibres(et, n, a).some(y => y.cle === `${n.id}:${x.b}`));
    const opts = [...arbos.map(([a, i]) => `<option value="arbo|${a.id}">🌳 Branche du réseau ${x.saison} N${i + 1} — ${esc(a.titre)}</option>`),
      ...(pids.filter(([p]) => Liens.couvertParCircuit(et, p).has(x.b)).map(([p, i]) => `<optgroup label="Schéma de principe N${i + 1} — ${esc(p.titre)}"><option value="${p.id}|-1">➕ Nouveau circuit « ${esc(n.titre)} »</option>${((p.entrees || {}).circuits || []).map((c, k) => [c, k]).filter(([c]) => !c.annexe).map(([c, k]) => `<option value="${p.id}|${k}">Circuit existant : ${esc(c.rep || `C${k + 1}`)}</option>`).join('')}</optgroup>`))].join('');
    return `<li>⚠️ ${esc(x.libelle)} : ${opts ? `<select data-bat-sel="${x.b}" aria-label="Raccordement de la ${esc(x.libelle.toLowerCase())}">${opts}</select> <button class="secondaire petit" data-bat-relier="${x.b}">Raccorder</button>` : `<span class="muted">aucun réseau arborescent ${x.saison === 'froid' ? 'froid (eau glacée)' : 'chaud'} ni circuit du schéma disponible — créez le réseau (calcul « Réseau arborescent », batteries ${x.saison === 'froid' ? 'froides' : 'chaudes'})</span>`}</li>`;
  };
  const ok = bats.every(x => x.lien);
  return `<div class="bandeau-lien">🧭 Raccordement des batteries à eau de la CTA${ok ? ' : complet' : ''}<ul style="margin:.3em 0">${bats.map(ligne).join('')}</ul>
    <span class="muted petit">Branche d'un réseau arborescent : puissance, débit et pertes de charge de la batterie remplissent la branche, puis remontent avec le réseau (départ du schéma de principe). Circuit du schéma : la CTA est seule sur son circuit.</span></div>`;
}
// Installation hydraulique de l'étude : contrôles de cohérence, consommateurs à raccorder, puis l'arbre complet
// schémas de principe (production) → circuits → réseaux arborescents → branches → consommateurs
function installationHtml(et) {
  const A = Installation.arbre(et), nf = Notes.nf, parCle = new Map(A.consommateurs.map(c => [c.cle, c]));
  const lien = (id, txt) => `<a href="#/etude/${et.id}/${id}">${esc(txt)}</a>`;
  const val = (x, u, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '' : `${nf(x, d)} ${u}`);
  const mesures = c => [val(c.P, 'kW'), val(c.Q, 'm³/h', 2), val(c.dp, 'kPa'), c.regime].filter(Boolean).map(esc).join(' · ');
  const conso = c => `<span class="inst-conso">${({ circuit: '🔥', cta: '🌀', ecs: '🚿', arbo: '🌳', reseau: '🔁', schema: '🏭' })[c.type] || (c.saison === 'froid' ? '❄️' : '🌡️')} <strong>${esc(c.libelle)}</strong>
    <span class="muted petit">${lien(c.source.id, c.source.libelle)}${mesures(c) ? ` · ${mesures(c)}` : ''}</span>${c.raccordements.length > 1 ? ' <span class="badge erreur">raccordé deux fois</span>' : ''}${c.raccordements.some(r => r.incompatible) ? ' <span class="badge erreur">régime incompatible</span>' : ''}</span>`;
  const reseau = r => `<li class="inst-reseau">🌳 ${lien(r.note, r.libelle)} <span class="muted petit">réseau ${r.saison === 'froid' ? 'd\'eau glacée' : 'd\'eau chaude'} · ${[val(r.P, 'kW'), val(r.Q, 'm³/h', 2), val(r.hmt, 'mCE', 2)].filter(Boolean).join(' · ')}</span>
    ${r.branches.length ? `<ul class="inst-branches">${r.branches.map(b => { const c = b.consommateur && parCle.get(b.consommateur);
      return `<li style="--niv:${Math.min(b.niveau, 6)}"><span class="muted">${esc(b.rep)}</span> ${c ? conso(c) : `${esc(b.nom)}${b.emetteur ? ' <span class="avert petit">(émetteur relié introuvable)</span>' : ''}${b.P ? ` <span class="muted petit">${val(b.P, 'kW')} saisis</span>` : ''}`}</li>`; }).join('')}</ul>` : '<p class="muted petit">Aucune branche.</p>'}</li>`;
  // Schéma de principe ; sous un circuit qui alimente un autre schéma (sous-station, boucle secondaire), le schéma aval
  // et ses propres circuits, sur autant de niveaux que l'installation en compte
  const schema = s => `<details class="${s.niveau ? 'inst-aval' : 'carte'} inst-pid" open><summary>🏭 ${lien(s.note, s.libelle)}${s.niveau ? ` <span class="badge">niveau ${s.niveau + 1}</span>` : ''}${s.cycle ? ' <span class="badge erreur">liens circulaires</span>' : ''}</summary>
    <p class="petit">${esc(s.nGen > 1 ? `${s.nGen} × ` : '')}${esc(s.generateur.toLowerCase())}${s.Pgen ? ` de ${nf(s.Pgen, 0)} kW` : ''} · ${esc(s.regime)}<br>
      Production <strong>${val(s.Pprod, 'kW', 0) || '—'}</strong> · appelée <strong class="${s.Pdem > s.Pprod ? 'manque' : ''}">${val(s.Pdem, 'kW', 0) || '—'}</strong>
      ${s.primaire ? `<br>Côté primaire (${esc(s.primaire.libelle)}${s.primaire.regime ? `, ${esc(s.primaire.regime)} °C` : ''}) : ${val(s.primaire.P, 'kW', 0)} appelés au circuit amont, ΔP ${val(s.primaire.dp, 'kPa')}${s.primaire.dispo !== null ? `, disponible <strong class="${s.primaire.dispo < s.primaire.dp ? 'manque' : ''}">${val(s.primaire.dispo, 'kPa')}</strong>` : ''}` : ''}</p>
    ${s.circuits.length ? `<ul class="inst-arbre">${s.circuits.map(c => { const autres = c.consommateurs.filter(k => k !== `${s.note}|${c.i}` && !(c.schema && k === `${c.schema.note}:schema`));
      return `<li><strong>Circuit ${esc(c.rep)}</strong> <span class="muted petit">${esc(c.emetteur)} · ${esc(c.montage)}${c.regime ? ` · ${esc(c.regime)}` : ''} · ${[val(c.P, 'kW'), val(c.Q, 'm³/h', 2), val(c.hmt, 'mCE', 2)].filter(Boolean).join(' · ')}</span>
      ${c.annexe && !['arbo', 'pid'].includes(c.annexe.type) ? `<div class="petit">Réseau annexe : ${lien(c.annexe.id, c.annexe.libelle)}</div>` : ''}
      ${c.annexe && c.annexe.type === 'pid' && !c.schema ? `<div class="petit avert">Schéma aval ${lien(c.annexe.id, c.annexe.libelle)} ignoré : liens circulaires.</div>` : ''}
      ${autres.length ? `<ul>${autres.map(k => `<li>${conso(parCle.get(k))}</li>`).join('')}</ul>`
        : c.consommateurs.length && !c.schema ? '<div class="muted petit">Consommateur direct (puissance saisie dans le schéma)</div>' : ''}
      ${c.reseau ? `<ul>${reseau(c.reseau)}</ul>` : ''}${c.schema ? schema(c.schema) : ''}</li>`; }).join('')}</ul>` : '<p class="muted petit">Aucun circuit.</p>'}</details>`;
  // Calcul hydraulique global : une ligne par pompe (sa boucle), chemin le plus défavorisé de bout en bout, débits
  const H = A.hydraulique, ETAT_CL = { ok: 'ok', sur: 'attention', ko: 'erreur', choisir: '', integree: '', reseau: '' };
  const globalHtml = !H || !H.boucles.length ? '' : `<div class="carte inst-global"><h3 style="margin-top:0">Calcul hydraulique global</h3>
    <p class="muted petit">Chaque pompe ne voit que sa boucle : production, primaire de circuit, circuit avec son réseau aval (réseau arborescent jusqu'à la branche la plus défavorisée, ou côté primaire d'un schéma aval), branche à pompe placée.</p>
    <div class="defile-x"><table class="liste compact"><thead><tr><th>Pompe / boucle</th><th>Débit (m³/h)</th><th>ΔP de la boucle (kPa)</th><th>HMT nécessaire (mCE)</th><th>Pompe retenue</th><th>État</th></tr></thead><tbody>
      ${H.boucles.map(b => `<tr><td style="padding-left:${7 + b.niveau * 12}px"><strong>${esc(b.pompe)}</strong><br><span class="muted petit">${esc(b.boucle)}${b.autorite !== null && b.autorite !== undefined ? ` · autorité ${nf(b.autorite, 2)}` : ''}</span><br><span class="muted petit">${esc(b.detail || '')}</span></td>
        <td>${b.Q === null ? '—' : nf(b.Q, 2)}</td><td>${b.dp === null ? '—' : nf(b.dp, 1)}</td><td>${b.hmt === null ? '—' : nf(b.hmt, 2)}</td>
        <td>${b.retenue ? `${esc(b.retenue.ref)}${Number.isFinite(b.retenue.H) ? ` <span class="muted petit">(${nf(b.retenue.H, 2)} mCE)</span>` : ''}` : b.proposee ? `<span class="muted petit">proposée : ${esc(b.proposee)}</span>` : '—'}</td>
        <td><span class="badge ${ETAT_CL[b.etat] || ''}">${esc(b.etatLibelle)}</span></td></tr>`).join('')}</tbody></table></div>
    ${H.defavorise ? `<p class="petit"><strong>Chemin le plus défavorisé de bout en bout</strong> (${esc(H.defavorise.terminal)}) : ${H.defavorise.etapes.map(x => `${esc(x.libelle)}${x.dp ? ` ${nf(x.dp, 1)} kPa` : ''}`).join(' → ')} — <strong>${nf(H.defavorise.dp, 1)} kPa</strong> cumulés sur ${H.defavorise.etapes.filter(x => x.boucle !== undefined).length} boucle(s).</p>` : ''}
    ${H.debits.length ? `<div class="defile-x"><table class="liste compact"><thead><tr><th>Schéma</th><th>Alimentation</th><th>Débit fourni (m³/h)</th><th>Débit appelé (m³/h)</th><th>Puissance (kW)</th><th>État</th></tr></thead><tbody>
      ${H.debits.map(x => `<tr><td>${lien(x.note, x.schema)}</td><td>${esc(x.libelle)}</td><td>${nf(x.Qprod, 2)}</td><td>${nf(x.Qappel, 2)}</td><td>${nf(x.Pprod, 0)} / ${nf(x.Pdem, 0)} appelés</td><td><span class="badge ${x.etat === 'OK' ? 'ok' : 'attention'}">${esc(x.etat)}</span></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
  const nr = A.nonRaccordes, ctl = A.controles;
  const aRaccorder = c => { const opts = c.cibles || [];
    return `<li class="inst-libre">${conso(c)}<span class="inst-raccord">${opts.length ? `<select data-inst-sel="${esc(c.cle)}" aria-label="Raccorder ${esc(c.libelle)} à"><option value="">Raccorder à…</option>${opts.map(o => `<option value="${esc(o.valeur)}">${esc(o.libelle)}</option>`).join('')}</select>
      <button class="secondaire petit" data-inst-raccorder="${esc(c.cle)}">Raccorder</button>` : `<span class="muted petit">Aucun réseau ni circuit ${c.saison === 'froid' ? 'd\'eau glacée' : 'd\'eau chaude'} disponible : créez un schéma de principe ou un réseau arborescent.</span>`}</span></li>`; };
  return `<div class="barre"><a href="#/etude/${et.id}" class="secondaire btn petit">← ${esc(et.objet)}</a><h1>💧 Installation hydraulique</h1></div>
    <p class="muted petit">${A.consommateurs.length} consommateur(s) d'eau dans l'étude, ${A.consommateurs.length - nr.length} raccordé(s). Un raccordement se fait par une branche de réseau arborescent ou un circuit de schéma de principe : puissances, débits et pertes de charge remontent jusqu'à la production.</p>
    <div class="carte"><h3 style="margin-top:0">Contrôles de cohérence</h3><ul class="a-faire">${ctl.map(x => `<li class="${x.niveau}">${x.note ? `${esc(x.texte)} ${lien(x.note, 'ouvrir')}` : esc(x.texte)}</li>`).join('')}</ul></div>
    ${nr.length ? `<div class="carte"><h3 style="margin-top:0">Consommateurs non raccordés <span class="compte">${nr.length}</span></h3><ul class="inst-libres">${nr.map(aRaccorder).join('')}</ul></div>` : ''}
    ${ensembleHtml(et, A)}
    <h2>Production et distribution</h2>
    ${A.schemas.length ? A.schemas.map(schema).join('') : '<p class="muted">Aucun schéma de principe dans l\'étude.</p>'}
    ${A.reseaux.length ? `<div class="carte"><h3 style="margin-top:0">Réseaux arborescents non reliés à un schéma</h3><ul class="inst-arbre">${A.reseaux.map(reseau).join('')}</ul></div>` : ''}
    ${globalHtml}`;
}
// Schéma d'ensemble de l'installation (un dessin pour toute l'installation hydraulique) et documents de l'installation
function ensembleHtml(et, A) {
  let svg = '';
  try { svg = Ensemble.svg(A, { titre: et.objet }); } catch (e) { svg = ''; }
  return `<div class="carte inst-ensemble"><h3 style="margin-top:0">Schéma d'ensemble de l'installation</h3>
    <div class="actions-ensemble"><button class="secondaire petit" id="ens-imprimer">🖨️ Imprimer (A3 paysage)</button><button class="secondaire petit" id="ens-pdf">📄 PDF A3</button><button class="secondaire petit" id="ens-dxf">📐 DXF</button><button class="secondaire petit" id="ens-af">📄 Analyse fonctionnelle de l'installation (Word)</button></div>
    ${svg ? `<div class="defile-x ensemble-svg" role="img" aria-label="Schéma d'ensemble de l'installation hydraulique">${svg}</div>` : '<p class="muted petit">Schéma d\'ensemble indisponible (calcul incomplet).</p>'}
    <p class="muted petit">Productions racines à gauche, puis circuits (pompe, montage, régime, puissance), schémas aval, réseaux et consommateurs. DXF : un calque par niveau.</p></div>`;
}
const nomFichierEtude = (et, prefixe) => `${prefixe}_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}`;
// Analyse fonctionnelle de l'installation complète (Word), par niveau, d'après l'arbre de l'installation et la régulation
function telechargerAfInstallation(et) {
  try {
    const blocs = Docx.analyseInstallation({ arbre: Installation.arbre(et), installations: Regulation.contexte(et, Liens).installations, notes: et.notes,
      affaire: [et.objet, et.client].filter(Boolean).join(' — '), indice: et.indice, date: et.date });
    return Promise.resolve(telecharger(`${nomFichierEtude(et, 'AF_installation')}.docx`, Docx.build(blocs), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Analyse fonctionnelle de l\'installation enregistrée (Word)')).catch(er => toast(er.message, 6000));
  } catch (er) { toast(er.message, 6000); return null; }
}
// Impression du schéma d'ensemble : cadre caché, page A3 paysage, dessin ajusté à la page
function imprimerSvgA3(svg, titre) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title><style>@page { size: A3 landscape; margin: 8mm; } html, body { margin: 0; } svg { width: 100%; height: auto; max-height: 277mm; }</style></head><body>${svg}</body></html>`;
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Impression impossible dans ce navigateur : utilisez le PDF A3.', 6000); } setTimeout(() => f.remove(), 60000); };
  document.body.appendChild(f);
}
function lierInstallation(root, et) {
  const ens = () => Ensemble.dessiner(Installation.arbre(et), { titre: et.objet });
  const fin = p => Promise.resolve(p).then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Schéma d\'ensemble enregistré')).catch(er => toast(er.message, 6000));
  const bi = root.querySelector('#ens-imprimer'), bp = root.querySelector('#ens-pdf'), bd = root.querySelector('#ens-dxf'), ba = root.querySelector('#ens-af');
  if (bi) bi.onclick = () => imprimerSvgA3(ens().svg, `Schéma d'ensemble — ${et.objet}`);
  if (bp) bp.onclick = () => {
    if (typeof PDFLib === 'undefined') return toast('Module PDF indisponible', 5000);
    fin(schemaPdfA3(ens().svg).then(o => telecharger(`${nomFichierEtude(et, 'Schema_ensemble')}_A3.pdf`, o, 'application/pdf')));
  };
  if (bd) bd.onclick = () => fin(telecharger(`${nomFichierEtude(et, 'Schema_ensemble')}.dxf`, Dxf.depuisSvg(ens().svg, { polylignes: true }).octets, 'application/dxf'));
  if (ba) ba.onclick = () => telechargerAfInstallation(et);
  root.querySelectorAll('[data-inst-raccorder]').forEach(b => b.onclick = () => {
    const cle = b.dataset.instRaccorder, sel = [...root.querySelectorAll('[data-inst-sel]')].find(x => x.dataset.instSel === cle);
    if (!sel || !sel.value) return toast('Choisissez d\'abord où raccorder ce consommateur.');
    const r = Installation.raccorder(et, cle, sel.value);
    if (!r.ok) return toast(r.texte, 6000);
    enregistrer(et); avecFocus(() => App.render()); toast(r.texte, 6000);
  });
}
function fichesInstallationHtml(et, n) {
  const l = Liens.fichesInstallation(et, n);
  if (!l.length) return '';
  const calc = l.filter(x => x.calcul !== false), doe = l.filter(x => x.calcul === false), manque = calc.filter(x => !x.fiche).length, manqueDoe = doe.filter(x => !x.fiche).length;
  const ligne = x => { const i = l.indexOf(x); return `<tr><td>${esc(x.element)}</td><td class="petit">${esc(x.nature)}</td><td>${x.fiche ? `✓ ${esc([x.fiche.fabricant, x.fiche.reference].filter(Boolean).join(' ') || x.fiche.nom)}` : '<span class="muted">à charger</span>'}</td>
      <td class="petit"><a href="#/etude/${et.id}/${x.note}">${esc(x.ou)}</a></td><td><button class="secondaire petit" data-fiche-elt="${i}">📄 ${x.fiche ? 'Remplacer' : 'Charger'}</button></td></tr>`; };
  const table = lst => `<div class="defile-x"><table><thead><tr><th>Élément</th><th>Nature</th><th>Fiche technique</th><th>Calcul</th><th></th></tr></thead><tbody>${lst.map(ligne).join('')}</tbody></table></div>`;
  return `<div class="carte fiches-install"><h3 style="margin-top:0">📄 Fiches techniques de l'installation ${manque ? `<span class="muted petit">(${manque} à charger pour le calcul)</span>` : '✓'}</h3>
    ${calc.length ? `<p class="petit"><strong>Fiches qui changent le calcul</strong> (puissances, débits, Kv, pertes de charge)</p>${table(calc)}` : ''}
    ${doe.length ? `<details${manqueDoe && !manque ? ' open' : ''}><summary class="petit"><strong>Fiches pour le DOE seulement</strong> (thermomètres, purgeurs, soupapes…) — ${doe.length - manqueDoe}/${doe.length} chargée(s)</summary>${table(doe)}</details>` : ''}
    <p class="petit muted">Une fiche chargée ici remplit le calcul de l'élément (terminaux, production, CTA) et se retrouve dans le schéma de principe comme dans le réseau arborescent.</p></div>`;
}
let ligneCibleTerminal = '', cibleBouche = '', ciblePoint = '', cibleRobinet = '', ciblePompe = '';
// Vue d'une note : tout, saisie seule, résultats seuls, schéma, fiches techniques (mémorisée sur ce poste)
const VUES_NOTE = [['tout', 'Tout'], ['saisie', '✏️ Saisie'], ['resultats', '📊 Résultats'], ['schema', '📐 Schéma'], ['fiches', '📄 Fiches techniques']];
let vueNote = (() => { try { return localStorage.getItem('etudes-vue-note') || 'tout'; } catch (e) { return 'tout'; } })();
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-vue-note]'); if (!b) return;
  vueNote = b.dataset.vueNote; try { localStorage.setItem('etudes-vue-note', vueNote); } catch (e) { /* stockage indisponible */ }
  const z = document.querySelector('.vue-note'); if (z) z.dataset.vue = vueNote;
  document.querySelectorAll('[data-vue-note]').forEach(x => { x.classList.toggle('actif', x === b); x.setAttribute('aria-selected', x === b); });
});
// Onglets sans contenu (pas de schéma, pas de fiches) masqués
function majVuesNote(root) {
  const vide = { schema: () => { const s = root.querySelector('#schema'); return !s || s.hidden; }, fiches: () => !root.querySelector('.fiches-install') };
  root.querySelectorAll('[data-vue-note]').forEach(b => { b.hidden = !!(vide[b.dataset.vueNote] && vide[b.dataset.vueNote]()); });
  const actif = root.querySelector(`[data-vue-note="${vueNote}"]`), z = root.querySelector('.vue-note');
  if (z && actif && actif.hidden) { z.dataset.vue = 'tout'; root.querySelectorAll('[data-vue-note]').forEach(x => x.classList.toggle('actif', x.dataset.vueNote === 'tout')); }
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-fiche-elt]'); if (!b) return;
  const m = /#\/etude\/([^/]+)\/([^/?]+)/.exec(location.hash); if (!m) return;
  const et = S.etudes.find(x => x.id === m[1]), n = et && et.notes.find(x => x.id === m[2]); if (!n) return;
  const x = Liens.fichesInstallation(et, n)[+b.dataset.ficheElt], cible = x && et.notes.find(y => y.id === x.note); if (!cible) return;
  ligneCibleTerminal = x.rep || ''; cibleBouche = x.bouche !== undefined ? x.bouche : ''; ciblePoint = x.point !== undefined ? x.point : ''; cibleRobinet = x.robinet !== undefined ? x.robinet : ''; ciblePompe = x.pompe !== undefined ? x.pompe : '';
  dialogueFiche(et, cible);
});

// Fiche technique d'une pompe : courbe débit / hauteur (et P1) du fabricant, modèle ; point de fonctionnement recalculé
function appliquerFichePompe(et, n, lignesTexte, nomFichier) {
  const k = ciblePompe; ciblePompe = '';
  const courbe = Pompes.lireFiche(lignesTexte), f = Schema.lireFicheRobinet(lignesTexte), nom = [f.fabricant, f.reference].filter(Boolean).join(' '), fiche = { nom: String(nomFichier || '').slice(0, 120), fabricant: f.fabricant, reference: f.reference };
  if (k === 'reseau') { if (courbe) n.entrees.pompeCourbe = courbe; if (nom) n.entrees.pompeRef = nom; n.entrees.pompeFiche = fiche; }
  else { const p = (n.entrees.pompesFab || [])[+k]; if (!p) return; if (courbe) p.courbe = courbe; if (nom) p.ref = nom; p.fiche = fiche; Registre.lier(et, n, p); }
  if (k === 'reseau') Registre.lier(et, n, n.entrees);
  enregistrer(et); App.render();
  toast(courbe ? `Courbe de la pompe lue (${courbe.split(';').length} points)${nom ? ` — ${nom}` : ''} : point de fonctionnement recalculé` : 'Fiche jointe ; courbe non reconnue : saisissez-la « Q:H ; Q:H … » (m³/h:mCE)', 6000);
}
// Fiche technique d'un organe de robinetterie (vanne, clapet, filtre…) : Kv, DN, perte de charge, fabricant et référence
function appliquerFicheRobinet(et, n, lignesTexte, nomFichier) {
  const i = +cibleRobinet, r = (n.entrees.robinetterie || [])[i]; cibleRobinet = '';
  if (!r) return;
  const f = Schema.lireFicheRobinet(lignesTexte), nom = [f.fabricant, f.reference].filter(Boolean).join(' ');
  if (f.valeurs.kv !== undefined) r.kv = f.valeurs.kv;
  if (f.valeurs.dn !== undefined) r.dn = f.valeurs.dn;
  if (f.valeurs.dp !== undefined && f.valeurs.kv === undefined) r.dp = Math.round(f.valeurs.dp * 100) / 100;
  if (f.valeurs.tours !== undefined && r.type === 'equilibrage') r.tours = f.valeurs.tours;
  if (f.valeurs.abaque && r.type === 'equilibrage') r.abaque = f.valeurs.abaque;
  if (nom) r.ref = nom;
  r.fiche = { nom: String(nomFichier || '').slice(0, 120), fabricant: f.fabricant, reference: f.reference };
  Registre.lier(et, n, r, f.valeurs);
  enregistrer(et); App.render();
  toast(`Fiche reprise sur ${r.rep || 'l\'organe'} : ${[f.valeurs.kv !== undefined && `Kv ${String(f.valeurs.kv).replace('.', ',')}`, f.valeurs.dn !== undefined && `DN ${f.valeurs.dn}`, f.valeurs.tours !== undefined && `${String(f.valeurs.tours).replace('.', ',')} tours`, f.valeurs.abaque && 'abaque tours / Kv', f.valeurs.dp !== undefined && `ΔP ${String(Math.round(f.valeurs.dp * 10) / 10).replace('.', ',')} kPa`, nom].filter(Boolean).join(', ') || 'fiche jointe (aucune valeur lue : saisissez le Kv ou la ΔP)'} — HMT de la pompe recalculée`, 6000);
}
// Fiche technique d'un point de puisage (robinetterie, WC, douche…) : débit et pression mini reportés sur le point choisi
function appliquerFichePoint(et, n, lignesTexte, nomFichier) {
  const i = +ciblePoint, p = ciblePoint === '' ? null : (n.entrees.points || [])[i]; ciblePoint = '';
  if (!p) return toast('Choisissez le point de puisage dans le tableau « Fiches techniques de l\'installation ».', 5000);
  const r = Sanitaire.lireFichePoint(lignesTexte), nom = [r.fabricant, r.reference].filter(Boolean).join(' '), A = Sanitaire.APPAREILS[p.type] || Sanitaire.APPAREILS.lavabo;
  if (r.valeurs.q !== undefined) { p.qEF = r.valeurs.q; if (A[2]) p.qECS = r.valeurs.q; }
  if (r.valeurs.pMin !== undefined) p.pMin = r.valeurs.pMin;
  if (nom) p.ref = nom;
  p.fiche = { nom: String(nomFichier || '').slice(0, 120), fabricant: r.fabricant, reference: r.reference };
  Registre.lier(et, n, p, r.valeurs);
  enregistrer(et); App.render();
  toast(`Fiche reprise sur ${p.rep || 'le point'} : ${[r.valeurs.q !== undefined && `débit ${String(r.valeurs.q).replace('.', ',')} L/s`, r.valeurs.pMin !== undefined && `pression mini ${String(r.valeurs.pMin).replace('.', ',')} bar`].filter(Boolean).join(', ') || 'référence seule (débits du DTU conservés)'}`, 6000);
}

// Fiche technique d'une bouche : perte de charge et puissance acoustique reportées sur la bouche choisie
function appliquerFicheBouche(et, n, lignesTexte, nomFichier) {
  const i = +cibleBouche, b = (n.entrees.bouchesL || [])[i]; cibleBouche = '';
  if (!b) return;
  const r = SchemaAir.lireFicheBouche(lignesTexte), nom = [r.fabricant, r.reference].filter(Boolean).join(' ');
  if (!r.nb) return confirmer('Aucune caractéristique reconnue (perte de charge, puissance acoustique) : saisissez-les sur la ligne de la bouche.', 'OK');
  if (r.valeurs.dp !== undefined) b.dp = r.valeurs.dp;
  if (r.valeurs.Lw !== undefined) b.Lw = r.valeurs.Lw;
  if (nom) b.ref = nom;
  b.fiche = { nom: String(nomFichier || '').slice(0, 120), fabricant: r.fabricant, reference: r.reference };
  Registre.lier(et, n, b, r.valeurs);
  enregistrer(et); App.render();
  toast(`Fiche reprise sur ${b.rep || 'la bouche'} : ${[r.valeurs.dp !== undefined && `ΔP ${r.valeurs.dp} Pa`, r.valeurs.Lw !== undefined && `Lw ${r.valeurs.Lw} dB(A)`].filter(Boolean).join(', ')}${r.valeurs.Q && Notes.num(b.Q) && Math.abs(r.valeurs.Q - Notes.num(b.Q)) / Notes.num(b.Q) > 0.1 ? ` — attention, fiche sélectionnée à ${r.valeurs.Q} m³/h pour ${b.Q} m³/h` : ''}`, 6000);
}

// Fiche technique d'un terminal (cassette, ventilo-convecteur…) : puissances, ventilateur, batterie électrique, tension,
// reportés sur la ligne choisie (ou une nouvelle ligne)
function appliquerFicheTerminal(et, n, lignesTexte, nomFichier) {
  const r = Terminaux.lireFiche(lignesTexte), nom = [r.fabricant, r.reference].filter(Boolean).join(' ');
  if (!r.nb) return confirmer('Aucune caractéristique reconnue dans ce document (PDF scanné ou mise en page inhabituelle). Saisissez les valeurs à la main.', 'OK');
  const app = n.entrees.appareils = n.entrees.appareils || [];
  const cles = Object.keys(Terminaux.LIBELLES).filter(k => r.valeurs[k] !== undefined);
  const b = Modal.open(`<h2>Fiche technique${nom ? ` : ${esc(nom)}` : ''}</h2><p class="muted petit">${esc(nomFichier)} · ${r.nb} caractéristique(s) reconnue(s).</p>
    <label>Terminal à remplir <select id="ft-ligne">${app.map((l, i) => `<option value="${i}" ${l.rep && l.rep === ligneCibleTerminal ? 'selected' : ''}>${esc([l.rep, l.local, (Terminaux.TYPES[l.type] || [''])[0]].filter(Boolean).join(' — '))}</option>`).join('')}<option value="nouveau" ${app.length ? '' : 'selected'}>+ Nouveau terminal</option></select></label>
    <table><thead><tr><th></th><th>Donnée</th><th>Lu sur la fiche</th></tr></thead><tbody>${cles.map(k => `<tr title="${esc(r.sources[k] || '')}"><td><input type="checkbox" data-tf="${k}" checked></td><td>${esc(Terminaux.LIBELLES[k][0])}</td><td><strong>${esc(k === 'tension' ? (r.valeurs[k] === 'tri' ? '400 V tri' : '230 V mono') : String(r.valeurs[k]).replace('.', ','))}</strong> ${esc(Terminaux.LIBELLES[k][1])}</td></tr>`).join('')}</tbody></table>
    ${r.valeurs.Qair ? `<p class="petit muted">Débit d'air : ${esc(String(r.valeurs.Qair))} m³/h${r.valeurs.Kvs ? ` · Kvs de la vanne : ${esc(String(r.valeurs.Kvs).replace('.', ','))}` : ''}</p>` : ''}
    <div class="actions"><button class="secondaire" id="tf-x">Annuler</button><button id="tf-ok">Reprendre les valeurs cochées</button></div>`);
  b.querySelector('#tf-x').onclick = Modal.close;
  b.querySelector('#tf-ok').onclick = () => {
    const v = b.querySelector('#ft-ligne').value;
    let l = v === 'nouveau' ? null : app[+v];
    if (!l) { l = { rep: `T-${String(app.length + 1).padStart(2, '0')}`, local: '', type: 'cassette2', n: 1, Pch: '', Pfr: '', batterie: r.valeurs.Pbe ? 'froide+elec' : '2t', vanne: '2v', Pvent: '', Pbe: '', tension: '', alim: '', ref: '' }; app.push(l); }
    cles.forEach(k => { if (b.querySelector(`[data-tf="${k}"]`).checked) l[Terminaux.LIBELLES[k][2]] = r.valeurs[k]; });
    if (nom) l.ref = nom;
    l.fiche = { nom: String(nomFichier || '').slice(0, 120), fabricant: r.fabricant, reference: r.reference };
    Registre.lier(et, n, l, Object.fromEntries(Object.entries(r.valeurs).filter(([k]) => !cles.includes(k) || b.querySelector(`[data-tf="${k}"]`).checked)));
    ligneCibleTerminal = '';
    enregistrer(et); Modal.close(); App.render(); toast(`Fiche reprise sur ${l.rep} : puissances et données électriques reportées au bilan électrique`, 5000);
  };
}

// Note de calcul d'une étude
Vues.note = {
  html: (et, noteId) => {
    const n = et.notes.find(x => x.id === noteId);
    if (!n) return `<p class="erreur">Calcul introuvable.</p><p><a href="#/etude/${et.id}">Retour à l'étude</a></p>`;
    const t = Notes.TYPES[n.type], i = et.notes.indexOf(n);
    n.entrees = completer(n.type, n.entrees || {});
    contexteEtude = et;
    // Consignes du projet : zones de l'étude préremplies (type de bâtiment choisi ou deviné) tant que la saisie est celle par défaut
    if (n.type === 'elec' && typeof ConsignesProjet !== 'undefined' && ConsignesProjet.estDefaut(n.entrees.consignesZones)) {
      const zs = ConsignesProjet.zonesEtude(et), id = Liens.resoudre(et, n).entrees.profilBatiment || ConsignesProjet.detecterProfil(et.objet);
      if (zs.length || id) { n.entrees.consignesZones = ConsignesProjet.zonesDepuis(zs, id); enregistrer(et); }
    }
    // Marque d'automate et protocole GTB repris du CCTP (une fois, tant qu'ils sont aux valeurs par défaut)
    if (n.type === 'elec' && !n.entrees.repriseCctp && typeof Regulation !== 'undefined' && (et.inventaire || []).length) {
      const cc = Regulation.exigencesCctp(et.inventaire) || {}, M = { Wit: 'wit', Siemens: 'siemens', Schneider: 'schneider', Sauter: 'sauter', Distech: 'distech', Trend: 'trend' }, P = { BACnet: 'BACnet/IP', Modbus: 'Modbus TCP', KNX: 'KNX', LON: 'LON' };
      const m = (cc.marques || []).filter(x => M[x]), p = (cc.protocoles || []).filter(x => P[x]), faits = [];
      if (m.length === 1 && (!n.entrees.marqueAutomate || n.entrees.marqueAutomate === 'generique')) { n.entrees.marqueAutomate = M[m[0]]; faits.push(`automate ${m[0]}`); }
      if (p.length && !p.includes('BACnet') && n.entrees.gtb === 'BACnet/IP') { n.entrees.gtb = P[p[0]]; faits.push(`GTB ${P[p[0]]}`); }
      n.entrees.repriseCctp = true; enregistrer(et);
      if (faits.length) setTimeout(() => toast(`Repris du CCTP : ${faits.join(', ')}.`, 6000), 300);
    }
    const lien = Liens.description(et, n), ctx = ctxEtude(et, n);
    const nReg = typeof Registre !== 'undefined' ? Registre.emplacements({ notes: [n] }).filter(p => Registre.parId(et, p.eq)).length : 0;
    // Alimentation électrique : équipements de l'étude repris automatiquement (terminaux, CTA, producteurs, réseaux),
    // lignes ajoutées à la main gardées
    let auto = '';
    // Terminaux : une ligne par appareil (les lignes « × n » des anciennes saisies sont éclatées, repères numérotés)
    if (n.type === 'terminaux') { const x = Terminaux.eclater(n.entrees.appareils); if (x.nb) { n.entrees.appareils = x.lignes; enregistrer(et); auto = `<div class="bandeau-lien">🌀 ${x.nb} ligne(s) groupée(s) éclatée(s) : une ligne par appareil, avec son repère.</div>`; } }
    if (n.type === 'elec') {
      const r = Electricite.fusionner((n.entrees || {}).equipements, Electricite.equipementsEtude(et, Liens), new Set(et.notes.map(x => x.id)));
      if (r.ajoutees || r.majs || r.retirees) { n.entrees = { ...n.entrees, equipements: r.lignes }; enregistrer(et); auto = `<div class="bandeau-lien">⚡ Bilan mis à jour depuis l'étude : ${[r.ajoutees && `${r.ajoutees} équipement(s) ajouté(s)`, r.majs && `${r.majs} mis à jour`, r.retirees && `${r.retirees} retiré(s) (calcul supprimé)`].filter(Boolean).join(', ')}.</div>`; }
    }
    if (nReg) auto += `<div class="bandeau-lien">🗂️ ${nReg} élément(s) repris du registre des équipements : valeurs des fiches verrouillées, à corriger dans le registre (mise à jour de tous les calculs). <button class="secondaire petit" data-ouvrir-registre>Ouvrir le registre</button></div>`;
    return `${auto}<div class="barre"><a href="#/etude/${et.id}" class="secondaire btn petit">← ${esc(et.objet)}</a><span class="ico-titre">${t.icone}</span><span class="muted">N${i + 1}</span>
        <input class="titre-note" data-n="titre" value="${esc(n.titre)}" aria-label="Titre du calcul"><span class="muted petit" id="etat-enreg"></span></div>
      <p class="muted petit">${esc(t.description)}</p>
      ${lien ? `<div class="bandeau-lien">🔗 ${esc(lien)} <button class="secondaire petit" id="detacher">Détacher</button></div>` : ''}
      ${placerSchemaHtml(et, n)}
      <div class="onglets vues-note" role="tablist">${VUES_NOTE.map(([k, l]) => `<button role="tab" class="onglet${k === vueNote ? ' actif' : ''}" aria-selected="${k === vueNote}" data-vue-note="${k}">${l}</button>`).join('')}</div>
      <div class="vue-note" data-vue="${vueNote}">
      ${calculateurHtml(n.type, n.entrees, ctx)}
      ${['pid', 'arbo', 'sanitaire'].includes(n.type) || (n.type === 'aero' && n.entrees.structure === 'arborescence') ? fichesInstallationHtml(et, n) : ''}
      </div>
      <div class="carte"><label class="champ-libre">Commentaire (repris dans la note de calcul)<textarea data-n="commentaire" rows="3">${esc(n.commentaire)}</textarea></label>
      ${emissionsHtml(et, n)}
      <div class="actions-ligne actions-note" data-plus="2"><button id="emettre-note">🖋️ Émettre l'indice ${esc(Revisions.prochainIndice(n))} (PDF avec cartouche)</button><button class="secondaire" id="pdf-note">📄 Brouillon PDF</button><button class="secondaire" id="defauts">Valeurs par défaut</button><button class="secondaire" id="dupliquer">Dupliquer</button>
        ${TYPES_FICHE.includes(n.type) ? `<button class="secondaire" id="fiche-tech" title="Fiche du fabricant (PDF de l'ordinateur ou de la bibliothèque Pipe-Fit) : remplit le calcul et contrôle le matériel choisi">📄 Fiche technique${['cta', 'aero'].includes(n.type) ? ' de la CTA' : { reseau: ' de la pompe', arbo: ' de la pompe', vase: ' du vase', ecs: ' du ballon / échangeur', pid: ' du générateur', terminaux: ' d\'un terminal' }[n.type] || ''}${n.entrees.fiche && (n.entrees.fiche.fabricant || n.entrees.fiche.reference) ? ` ✓` : ''}</button>` : ''}
        ${n.type === 'cta' ? `<button class="secondaire" id="cta-reseau">🌬️ ${Liens.reseauxDeCta(et.notes, n).some(x => x.type === 'aero') ? 'Ouvrir le schéma aéraulique relié' : 'Créer le schéma aéraulique relié (gaines, bouches)'}</button>` : ''}
        ${n.type === 'arbo' ? '<button class="secondaire" id="pid-nomenc" title="Classeur Excel : nomenclature par tronçon (tubes, vannes d\'équilibrage avec préréglage, robinetterie, pompe) et liste d\'achat regroupée">📦 Nomenclature et liste d\'achat (Excel)</button>' : ''}
        ${n.type === 'pid' ? '<button class="secondaire" id="pid-pompes" title="Une ligne par circuit et par pompe de production (primaires PP, échangeur PECH1 / PECH2, récupération PREC, refroidissement PEV) pour saisir la pompe retenue et sa courbe (ou la lire sur la fiche du fabricant)">⚙️ Pompes retenues</button><button class="secondaire" id="pid-vannes" title="Vannes d\'autorité inférieure à 0,5 : Kvs cible, Kvs normalisé et vanne du catalogue proposés, appliqués après confirmation">🎚️ Redimensionner les vannes (autorité ≥ 0,5)</button>' : ''}
        ${n.type === 'pid' ? '<button class="secondaire" id="pid-rob" title="Pour chaque circuit sans robinetterie : vannes d\'isolement, vanne d\'équilibrage, filtre, manchettes, thermomètres ; à compléter avec les Kv des fiches">🔩 Robinetterie type par circuit</button><button class="secondaire" id="pid-nomenc" title="Classeur Excel : nomenclature par circuit (repères, DN, fabricant, référence, fiche, ΔP) et liste d\'achat regroupée">📦 Nomenclature et liste d\'achat (Excel)</button>' : ''}
        ${n.type === 'pid' ? '<button class="secondaire" id="notes-liees">🔗 Créer les notes liées (réseaux et pompes, vannes, vase)</button>' : ''}
        ${n.type === 'elec' ? '<button class="secondaire" id="elec-reprendre">⚡ Mettre à jour depuis l\'étude</button><button class="secondaire" id="elec-cables">🔌 Dimensionner les câbles à notre charge</button><button class="secondaire" id="elec-excel">📊 Classeur Excel (bilan, attentes, points, adressage, nomenclature)</button><button class="secondaire" id="elec-csv">🔗 Table d\'échange GTB (CSV)</button><button class="secondaire" id="elec-profil">🏢 Préremplir les zones (étude + type de bâtiment)</button><button class="secondaire" id="elec-af">📄 Analyse fonctionnelle (Word)</button><button class="secondaire" id="elec-af-inst">📄 Analyse fonctionnelle de l\'installation (Word)</button><button class="secondaire" id="elec-ede">🔗 Fichier EDE BACnet (intégrateur GTB)</button><button class="secondaire" id="elec-etiq">🏷️ Étiquettes de repérage</button><button class="secondaire" id="elec-devis-reg">💶 Chiffrer la régulation (devis Pipe-Fit)</button><button class="secondaire" id="elec-releves">📈 Analyser des relevés de la GTB</button><button class="secondaire" id="elec-achat-reg">🛒 Matériel de régulation : demande de prix</button><button class="secondaire" id="elec-reglees">↩️ Reprendre les valeurs réglées sur site</button><button class="secondaire" id="elec-pressions">📏 Reprendre les pressions des CTA (mises en service du chantier)</button><button class="secondaire" id="elec-cahier-docx">📄 Cahier de paramétrage (Word)</button><button class="secondaire" id="elec-cahier-xlsx">📑 Cahier (Excel, un onglet par rubrique)</button>' : ''}
        ${n.type === 'aero' && n.entrees.structure === 'arborescence' ? '<button class="secondaire" id="num-bouches" title="Numéro unique de chaque bouche : compléter les bouches sans repère ou en double, ou tout renuméroter (par zone et pièce, ou suivant les branches) quand l\'étude est au point">🔢 Numéroter les bouches</button>' : ''}
        ${n.type === 'terminaux' ? '<button class="secondaire" id="num-terminaux" title="Donne un repère unique à chaque terminal sans repère ou en double (CA-01, VC-02…) : une branche par terminal dans le réseau arborescent, une fiche de mise en service par terminal">🔢 Numéroter les terminaux</button>' : ''}
        ${n.type === 'aero' && n.entrees.structure === 'arborescence' ? '<button class="secondaire" id="aero-vitesses" title="Même vitesse pour toutes les branches (ou les principales, ou les terminales) : les diamètres des gaines sont recalculés">💨 Changer toutes les vitesses</button>' : ''}
        ${n.type === 'sanitaire' ? `<button class="secondaire" id="san-foison" title="Compare le débit probable avec et sans foisonnement et choisit la méthode de calcul">⚖️ Foisonnement : ${esc({ dtu: 'DTU 60.11', saisi: `${Notes.num(n.entrees.coefSaisi, 60)} %`, aucun: 'aucun' }[n.entrees.foisonnement || 'dtu'] || '')}</button>` : ''}
        ${n.type === 'evacuation' ? '<button class="secondaire" id="evac-san" title="Une ligne par appareil du calcul sanitaire choisi (lavabos, WC, douches…), avec sa salle et son étage ; il reste à choisir le tronçon">🚽 Reprendre les appareils du calcul sanitaire</button>' : ''}
        ${n.type === 'bouches' && et.notes.some(x => x.type === 'pieces' || x.type === 'aero') ? '<button class="secondaire" id="bouches-pieces" title="Une ligne par pièce de l\'étude (bilan pièce par pièce, bouches du schéma aéraulique) ; surface et débit repris et verrouillés">🏠 Reprendre les pièces de l\'étude</button>' : ''}
        ${n.type === 'terminaux' && et.notes.some(x => x.type === 'pieces') ? '<button class="secondaire" id="term-pieces" title="Un terminal par pièce du bilan pièce par pièce qui n\'en a pas, aux puissances de la pièce">🏠 Créer les terminaux des pièces</button>' : ''}
        ${(Notes.TYPES[n.type].champs || []).some(c => c.k === 'troncons' && (c.colonnes || []).some(x => x.k === 'L')) ? '<button class="secondaire" id="longueurs-plan" title="Nomenclature de canalisations ou de gaines exportée de Revit (CSV, Excel) ou plan DXF (une couche par tronçon) : longueurs additionnées par repère et reportées sur les tronçons de même repère">📏 Longueurs depuis Revit / DXF</button>' : ''}
        ${n.type === 'arbo' ? (n.entrees.jumeau && et.notes.some(x => x.id === n.entrees.jumeau) ? `<button class="secondaire" id="arbo-recopier" title="Tronçons, longueurs, branches et émetteurs repris du réseau jumeau (les tubes imposés et la pompe de ce réseau sont gardés)">🔄 Recopier l'arborescence de ${esc((et.notes.find(x => x.id === n.entrees.jumeau) || {}).titre || '')}</button>` : `<button class="secondaire" id="arbo-jumeau" title="Réseau de l'autre saison avec la même arborescence, les mêmes repères et émetteurs : réseau séparé (4 tubes) ou même réseau en change-over">${n.entrees.saison === 'froid' ? '🔥 Créer le réseau chaud' : '❄️ Créer le réseau froid'} (4 tubes / change-over)</button>`) : ''}
        ${n.type === 'arbo' ? '<button class="secondaire" id="arbo-emetteurs" title="Une branche par terminal ou batterie de CTA de l\'étude, reliée : puissance, débit et pertes de charge remplis ; il reste à choisir le tronçon amont et la longueur">🌀 Ajouter les émetteurs de l\'étude</button>' : ''}
        ${n.type === 'cable' ? '<button id="cable-reprendre">🔌 Reprendre les liaisons de l\'alimentation électrique</button>' : ''}<span class="espace"></span><button class="secondaire" id="supprimer">Supprimer ce calcul</button></div></div>`;
  },
  bind: (root, et, noteId) => {
    const n = et.notes.find(x => x.id === noteId);
    if (!n) return;
    lierCalculateur(root, n.type, n.entrees, redessin => { enregistrer(et); if (redessin) avecFocus(App.render); }, ctxEtude(et, n));
    majVuesNote(root);
    const det = root.querySelector('#detacher');
    if (det) det.onclick = async () => { if (await confirmer('Détacher ce calcul ? Les valeurs reprises deviennent des valeurs saisies et ne suivront plus la note d\'origine.', 'Détacher')) { Liens.detacher(et, n); enregistrer(et); App.render(); } };
    // CTA : schéma aéraulique relié (créé avec les zones par défaut à adapter), ouvert s'il existe
    const ftech = root.querySelector('#fiche-tech');
    if (ftech) ftech.onclick = () => dialogueFiche(et, n);
    const cr0 = root.querySelector('#cta-reseau');
    if (cr0) cr0.onclick = () => {
      let a = Liens.reseauxDeCta(et.notes, n).find(x => x.type === 'aero');
      if (!a) { a = nouvelleNote('aero'); a.entrees.cta = n.id; a.entrees.titreInstallation = n.titre; a.titre = `Réseau aéraulique — ${n.titre}`; et.notes.splice(et.notes.indexOf(n) + 1, 0, a); enregistrer(et); toast('Schéma aéraulique créé et relié à la CTA : saisissez les zones et les bouches, débits et pertes de charge remontent dans la CTA.', 7000); }
      location.hash = `#/etude/${et.id}/${a.id}`;
    };
    const liees = root.querySelector('#notes-liees');
    if (liees) liees.onclick = () => {
      const nv = Liens.notesDepuisSchema(et, n, uidE);
      if (!nv.length) return toast('Les notes liées existent déjà pour tous les circuits.');
      et.notes.splice(et.notes.indexOf(n) + 1, 0, ...nv); enregistrer(et); toast(`${nv.length} note(s) créée(s), reliées au schéma`); location.hash = `#/etude/${et.id}`;
    };
    // Câbles : liaisons à notre charge reprises du calcul d'alimentation électrique (alimentation des armoires, départs éloignés)
    // Les liaisons d'exemple sont remplacées ; des liaisons déjà saisies sont complétées (pose, isolant… gardés)
    const versCables = (cible, elec) => {
      const ex = (cible.entrees || {}).liaisons || [], exemples = JSON.stringify(ex) === JSON.stringify(Notes.defauts('cable').liaisons);
      cible.entrees = { ...Notes.defauts('cable'), ...(cible.entrees || {}), liaisons: Cables.depuisElectricite(Liens.resoudre(et, elec).entrees, exemples ? [] : ex) };
    };
    const cr = root.querySelector('#cable-reprendre');
    if (cr) cr.onclick = () => {
      const elec = et.notes.find(x => x.type === 'elec');
      if (!elec) return toast('Ajoutez d\'abord le calcul « Alimentation électrique et régulation » à l\'étude, ou saisissez les liaisons.', 6000);
      versCables(n, elec); enregistrer(et); App.render();
      toast(`${n.entrees.liaisons.length} liaison(s) : alimentation des armoires depuis le TGBT et départs dont la longueur est saisie. Complétez le mode de pose et les longueurs.`, 7000);
    };
    // Classeur Excel pour le lot électricité, le tableautier et l'automaticien
    const ex = root.querySelector('#elec-excel');
    if (ex) ex.onclick = () => {
      const r = Liens.calculer(et, n), f = (r.valeurs || {}).feuilles || [];
      if (!f.length || typeof XLSX === 'undefined') return toast('Classeur indisponible.', 5000);
      const H = v => ({ v, s: 'head' }), val = v => { const s = String(v ?? ''); return /^-?\d+(,\d+)?$/.test(s) ? Number(s.replace(',', '.')) : s; };
      const octets = XLSX.build(f.map(x => ({ name: x.name, freeze: 3, cols: x.entetes.map((h, i) => (i === 1 || /Désignation|Équipement|Pour|À prévoir/.test(h) ? 44 : 16)),
        rows: [[{ v: `${x.name} — ${et.objet} (indice ${et.indice})`, s: 'title' }], [], x.entetes.map(H), ...x.lignes.map(l => l.map(val))] })));
      Promise.resolve(telecharger(`Electricite_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}.xlsx`, octets, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
        .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : `Classeur enregistré : ${f.length} feuilles`)).catch(er => toast(er.message, 6000));
    };
    // Cahier de paramétrage de l'automate : document Word modifiable, ou classeur avec un onglet par rubrique
    const cahierDe = () => { const r = Liens.calculer(et, n), c = (r.valeurs || {}).cahierProg || []; if (!c.length) toast('Aucune armoire en automate programmable : pas de cahier de paramétrage.', 6000); return { c, marque: (r.valeurs || {}).marqueAutomate || 'automate' }; };
    const nomCahier = ext => `Cahier_parametrage_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}.${ext}`;
    // Profil de bâtiment : zones, consignes et horaires types
    const bp = root.querySelector('#elec-profil');
    if (bp) bp.onclick = () => {
      const id = Liens.resoudre(et, n).entrees.profilBatiment || ConsignesProjet.detecterProfil(et.objet) || 'bureaux', p = ConsignesProjet.profil(id), zs = ConsignesProjet.zonesEtude(et);
      n.entrees.consignesZones = ConsignesProjet.zonesDepuis(zs, id); enregistrer(et); App.render();
      toast(`${n.entrees.consignesZones.length} zone(s) préremplie(s)${zs.length ? ' depuis les zones de l\'étude' : ''} avec les consignes et horaires « ${p.nom} » : ajustez seulement ce qui diffère.`, 7000);
    };
    // Fichier EDE (BACnet) pour l'intégrateur GTB : objets + textes d'états
    const be = root.querySelector('#elec-ede');
    if (be) be.onclick = async () => {
      const r = Liens.calculer(et, n), f = ((r.valeurs || {}).feuilles || []).find(x => /^Table d'échange/.test(x.name));
      if (!f || !f.lignes.length) return toast('Aucun point dans la table d\'échange.', 5000);
      const d = Gtb.ede(f.lignes, { projet: et.objet || 'Projet', auteur: (S.me || {}).nom || 'Pipe-Fit', date: aujourdhui() });
      const base = `EDE_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}`, enc = t => new TextEncoder().encode(`﻿${t}`);
      try {
        await telecharger(`${base}.csv`, enc(d.ede), 'text/csv');
        await telecharger(`${base}_StateTexts.csv`, enc(d.etats), 'text/csv');
        toast(`Fichier EDE enregistré : ${d.objets} objet(s), ${d.devices} automate(s), avec le fichier des textes d'états.`, 6000);
      } catch (er) { toast(er.message, 6000); }
    };
    // Analyse fonctionnelle (Word) : consignes, plannings, fonctionnement, alarmes et conduite à tenir
    const ba = root.querySelector('#elec-af');
    if (ba) ba.onclick = () => {
      const r = Liens.calculer(et, n), v = r.valeurs || {}, blocsReg = ((r.onglets || []).find(o => o.titre === 'Régulation') || {}).blocs || [];
      const afs = blocsReg.filter(b => /^Analyse fonctionnelle — /.test(b.titre || '') && b.liste).map(b => ({ titre: b.titre.replace(/^Analyse fonctionnelle — /, ''), liste: b.liste }));
      const octets = Docx.build(Docx.analyseFonctionnelle({ cahier: v.cahierProg || [], projet: v.consignesProjet, afs, queFaire: Gtb.queFaire, affaire: [et.objet, et.client].filter(Boolean).join(' — '), indice: et.indice, date: et.date }));
      Promise.resolve(telecharger(`Analyse_fonctionnelle_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}.docx`, octets, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
        .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Analyse fonctionnelle enregistrée (Word)')).catch(er => toast(er.message, 6000));
    };
    // Analyse fonctionnelle de l'installation complète (Word), organisée par niveau de l'installation hydraulique
    const bai = root.querySelector('#elec-af-inst');
    if (bai) bai.onclick = () => telechargerAfInstallation(et);
    // Étiquettes de repérage : planches autocollantes (PDF) ou liste pour étiqueteuse (Excel)
    const bt = root.querySelector('#elec-etiq');
    if (bt) bt.onclick = () => {
      const r = Liens.calculer(et, n), v = r.valeurs || {}, l = Gtb.etiquettes(v.cahierProg || [], v.feuilles || []);
      const CAT = [['points', 'Entrées / sorties (nom du point, adresse)'], ['bornes', 'Bornier (bornes, repère)'], ['cables', 'Câbles (tenant → aboutissant)'], ['facade', 'Façade (départs)']];
      const box = Modal.open(`<h2>🏷️ Étiquettes de repérage</h2>
        ${CAT.map(([k, t]) => `<label class="ligne-case"><input type="checkbox" data-cat="${k}" ${l[k].length ? 'checked' : 'disabled'}> ${t} — ${l[k].length}</label>`).join('')}
        <label>Planche <select id="et-modele">${Planches.MODELES.map(m => `<option value="${m[0]}" ${m[0] === 'L4732' ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}</select></label>
        <div class="actions"><button class="secondaire" id="et-fermer">Fermer</button><button class="secondaire" id="et-xlsx">Liste pour étiqueteuse (Excel)</button><button id="et-pdf">Planches (PDF)</button></div>`);
      const choix = () => [...box.querySelectorAll('[data-cat]:checked')].flatMap(c => l[c.dataset.cat].map(x => ({ ...x, cat: CAT.find(y => y[0] === c.dataset.cat)[1] })));
      box.querySelector('#et-fermer').onclick = () => Modal.close();
      const nom = ext => `Etiquettes_${sansAccents(et.objet).slice(0, 40)}.${ext}`;
      box.querySelector('#et-pdf').onclick = () => {
        const items = choix(); if (!items.length) return toast('Rien à imprimer.');
        let ctx; const mesure = (t, taille, gras) => { ctx = ctx || document.createElement('canvas').getContext('2d'); ctx.font = `${gras ? 'bold ' : ''}${taille}px Helvetica, Arial, sans-serif`; return ctx.measureText(t).width; };
        const p = Planches.pdf(items.map(x => ({ titre: x.titre, sous: x.sous })), { modele: box.querySelector('#et-modele').value, mesure });
        Promise.resolve(telecharger(nom('pdf'), p.octets, 'application/pdf')).then(() => toast(`${items.length} étiquette(s) sur ${p.pages} planche(s).`)).catch(er => toast(er.message, 6000));
      };
      box.querySelector('#et-xlsx').onclick = () => {
        const items = choix(); if (!items.length) return toast('Rien à exporter.');
        const H = v2 => ({ v: v2, s: 'head' });
        Promise.resolve(telecharger(nom('xlsx'), XLSX.build([{ name: 'Etiquettes', cols: [30, 22, 50], rows: [['Catégorie', 'Texte', 'Complément'].map(H), ...items.map(x => [x.cat, x.titre, x.sous])] }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
          .then(() => toast(`${items.length} étiquette(s) exportée(s).`)).catch(er => toast(er.message, 6000));
      };
    };
    // Chiffrage de la régulation : devis brouillon dans Pipe-Fit (matériel automate + heures)
    const bd2 = root.querySelector('#elec-devis-reg');
    if (bd2) bd2.onclick = async () => {
      if (!et.affaireId && !et.clientId) return toast('Rattachez l\'étude à un chantier ou à un client de Pipe-Fit pour créer le devis.', 6000);
      const r = Liens.calculer(et, n), v = r.valeurs || {}, nom = (v.feuilles || []).filter(x => /^Nomenclature /.test(x.name)).flatMap(x => x.lignes);
      const boucles = (v.cahierProg || []).reduce((s, c) => s + ((c.sections.find(x => x.titre === 'Boucles de régulation') || { lignes: [] }).lignes.length), 0);
      const ch = ConsignesProjet.chiffrage({ pts: v.listePoints || [], nomenclature: nom, boucles, installations: ((v.regulation || {}).installations || []).length || 1 });
      const mos = (S.pf || {}).mainoeuvre || [], mo = mos.find(m => /automat|régul|regul|électr|electr/i.test(m.libelle || '')) || mos[0];
      const lignes = [{ type: 'chapitre', titre: 'Régulation et automatisme' },
        ...ch.materiel.map(m => ({ type: 'ouvrage', libre: true, designation: m.designation, unite: 'u', qte: m.qte, composants: [{ type: 'f', articleId: '', designation: m.designation, unite: 'u', qte: 1, pu: 0, cout: 0, poids: 0 }] })),
        ...ch.heures.map(([des, h]) => ({ type: 'ouvrage', designation: des, unite: 'forfait', qte: 1, ...(mo ? { composants: [{ type: 'mo', moId: mo.id, libelle: mo.libelle, heures: h, taux: Notes.num(mo.tauxVente), cout: Notes.num(mo.tauxCout) }] } : { libre: true, composants: [{ type: 'f', articleId: '', designation: `${des} (${h} h)`, unite: 'forfait', qte: 1, pu: 0, cout: 0, poids: 0 }] }) }))];
      if (!(await confirmer(`Créer un devis brouillon « Régulation » dans Pipe-Fit : ${ch.materiel.length} ligne(s) de matériel (prix à saisir) et ${ch.heures.reduce((s, x) => s + x[1], 0)} h (programmation, essais point à point, mise en service) ?`))) return;
      try {
        const d = await api('POST', '/api/pf/devis', { affaireId: et.affaireId, clientId: et.clientId || '', etudeId: et.id, objet: `${et.objet} — régulation et automatisme`, lignes });
        et.devisPF = [...(et.devisPF || []), { id: d.id, numero: d.numero, date: aujourdhui() }]; enregistrer(et);
        toast(`Devis ${d.numero || ''} créé en brouillon dans Pipe-Fit.`, 6000);
      } catch (er) { toast(er.message, 7000); }
    };
    // Suivi après réception : relevés de la GTB (CSV / Excel) comparés aux lois d'eau et aux consignes
    const br = root.querySelector('#elec-releves');
    if (br) br.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.xlsx';
      inp.onchange = async () => {
        const fi = inp.files[0]; if (!fi) return;
        let rows;
        try { const buf = await fi.arrayBuffer(), fs = /\.xlsx$/i.test(fi.name) ? await XLSX.read(buf) : XLSX.readCSV(buf); rows = fs.sort((a, b) => b.rows.length - a.rows.length)[0].rows; } catch (er) { return toast(`Fichier illisible : ${er.message}`, 6000); }
        const pj = (Liens.calculer(et, n).valeurs || {}).consignesProjet, a = pj && ConsignesProjet.analyserReleves(rows, pj);
        if (!a || a.erreur) return toast((a && a.erreur) || 'Consignes du projet indisponibles.', 7000);
        const tab = (e, l) => `<table><tr>${e.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${l.map(x => `<tr>${x.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
        Modal.open(`<h2>📈 Relevés de la GTB : ${a.mesures} mesure(s)</h2>
          ${a.circuits.length ? `<h3>Départs des circuits face à la loi d'eau</h3>${tab(['Circuit', 'Mesures', 'Écart moyen (K)', 'Proposition'], a.circuits.map(c => [c.circuit, c.mesures, String(c.ecartMoyen).replace('.', ','), c.proposition]))}` : '<p>Aucune colonne de départ reconnue (en-tête avec le nom du circuit).</p>'}
          ${a.zones.length ? `<h3>Ambiances</h3>${tab(['Zone', 'Jours', 'Jours hors plage', 'Proposition'], a.zones.map(z => [z.zone, z.jours, z.joursHors, z.proposition]))}` : '<p>Aucune colonne d\'ambiance reconnue.</p>'}
          <div class="actions"><button onclick="Modal.close()">Fermer</button></div>`);
      };
      inp.click();
    };
    // Demande de prix du matériel de régulation (automate, communication, sondes ; appareillage de l'armoire en option)
    const bm = root.querySelector('#elec-achat-reg');
    if (bm) bm.onclick = () => {
      const r = Liens.calculer(et, n), v = r.valeurs || {}, nom = (v.feuilles || []).filter(x => /^Nomenclature /.test(x.name)).flatMap(x => x.lignes);
      const eqf = ((v.feuilles || []).find(x => x.name === 'Équipements') || { lignes: [] }).lignes.filter(l => /sonde|capteur|pressostat|thermostat|détecteur|compteur/i.test(String(l[1] || '')));
      const familles = [...new Set(nom.map(l => l[0]))], AUTO = /automatisme|communication/i;
      const rendre = sel => {
        const m = new Map();
        nom.filter(l => sel.has(l[0])).forEach(l => { const k = String(l[1]); const x = m.get(k) || { designation: k, dn: '', fabricant: l[4] || '', reference: l[5] || '', unite: 'u', qte: 0, famille: l[0] }; x.qte += Notes.num(l[3]) || 1; m.set(k, x); });
        if (sel.has('Sondes et capteurs')) eqf.forEach(l => { const k = String(l[1]); const x = m.get(k) || { designation: k, dn: '', fabricant: '', reference: '', unite: 'u', qte: 0, famille: 'Sondes et capteurs' }; x.qte += 1; m.set(k, x); });
        return Nomenclature.prixAchats([...m.values()], (S.pf && S.pf.articles) || []);
      };
      const choix = new Set([...familles.filter(f => AUTO.test(f)), ...(eqf.length ? ['Sondes et capteurs'] : [])]);
      const b = Modal.open('<div id="ar-c"></div>'); b.classList.add('large');
      const dessiner = () => {
        const liste = rendre(choix), eur = x => `${Notes.nf(x, 2)} €`;
        b.querySelector('#ar-c').innerHTML = `<h2>🛒 Matériel de régulation — demande de prix</h2>
          <p class="petit">${[...familles, ...(eqf.length ? ['Sondes et capteurs'] : [])].map(f => `<label class="ligne-case"><input type="checkbox" data-fam="${esc(f)}" ${choix.has(f) ? 'checked' : ''}> ${esc(f)}${AUTO.test(f) || f === 'Sondes et capteurs' ? '' : ' (armoire)'}</label>`).join(' ')}</p>
          <p class="muted petit">${liste.length} article(s), ${liste.filter(x => x.pu).length} trouvé(s) dans la bibliothèque de Pipe-Fit (prix d'achat, fournisseur par défaut et variantes comparés dans la consultation).</p>
          <div class="defile-x" style="max-height:46vh;overflow:auto"><table class="liste compact"><thead><tr><th>Famille</th><th>Désignation</th><th>Qté</th><th>Article de la bibliothèque</th><th>PU HT</th></tr></thead><tbody>
          ${liste.map(x => `<tr><td class="petit">${esc(x.famille)}</td><td>${esc(x.designation)}</td><td>${Notes.nf(x.qte, 0)}</td><td class="petit">${x.articleId ? esc(`${x.articleRef ? `${x.articleRef} — ` : ''}${x.articleDesignation}`) : '<span class="muted">à chiffrer</span>'}</td><td>${x.pu ? eur(x.pu) : ''}</td></tr>`).join('')}</tbody></table></div>
          ${et.affaireId ? '' : '<p class="petit alerte attention">Reliez l\'étude à un chantier pour lancer la consultation des fournisseurs.</p>'}
          <div class="actions"><button class="secondaire" id="ar-x">Fermer</button>${et.affaireId ? '<button id="ar-cs">🛒 Consulter les fournisseurs dans Pipe-Fit</button>' : ''}</div>`;
        b.querySelector('#ar-x').onclick = () => { b.classList.remove('large'); Modal.close(); };
        b.querySelectorAll('[data-fam]').forEach(c => c.onchange = () => { if (c.checked) choix.add(c.dataset.fam); else choix.delete(c.dataset.fam); dessiner(); });
        const cs = b.querySelector('#ar-cs');
        if (cs) cs.onclick = async () => {
          if (!liste.length) return toast('Rien à consulter.');
          cs.disabled = true; cs.textContent = 'Création…';
          try {
            const rc = await api('POST', '/api/pf/consultation', { affaireId: et.affaireId, etudeId: et.id, noteId: n.id, objet: `Matériel de régulation — ${et.objet}`.slice(0, 200), lignes: Nomenclature.lignesConsultation(liste) });
            cs.outerHTML = `<span class="badge ok">Consultation ${esc(rc.ref || '')} créée</span>`;
            toast('Consultation créée dans Pipe-Fit : fournisseurs proposés d\'après la bibliothèque, demande de prix à envoyer ; l\'offre retenue devient la commande.', 7000);
          } catch (e) { cs.disabled = false; cs.textContent = '🛒 Consulter les fournisseurs dans Pipe-Fit'; toast(e.message, 6000); }
        };
      };
      dessiner();
    };
    // Valeurs réglées sur site (PV de réglage du chantier) reprises dans l'étude : nouvel indice du cahier
    const bv = root.querySelector('#elec-reglees');
    if (bv) bv.onclick = async () => {
      if (!et.affaireId) return toast('Étude non rattachée à un chantier de Pipe-Fit.', 6000);
      let d = [];
      try { d = await api('GET', `/api/pf/valeurs-reglees?affaireId=${encodeURIComponent(et.affaireId)}`); } catch (er) { return toast(er.message, 6000); }
      if (!d.length) return toast('Aucune valeur réglée différente de l\'étude dans le PV « Réglages de la régulation » du chantier.', 7000);
      const pj = (Liens.calculer(et, n).valeurs || {}).consignesProjet, a = ConsignesProjet.appliquerReglees(n.entrees, d, pj), nv = ConsignesProjet.indiceSuivant(et.indice);
      const nf = x => String(x).replace('.', ',');
      const b = Modal.open(`<h2>↩️ Valeurs réglées sur site</h2><p class="petit">${esc(d[0].source)} : ${d.length} valeur(s) différente(s) de l'étude.</p>
        <table class="liste compact"><thead><tr><th>Réglage</th><th>Étude</th><th>Réglé sur site</th><th></th></tr></thead><tbody>
        ${d.map(x => `<tr><td>${esc(x.libelle)}</td><td>${nf(x.attendu)} ${esc(x.unite)}</td><td><strong>${nf(x.regle)} ${esc(x.unite)}</strong></td><td class="petit">${a.appliques.includes(x) ? 'repris dans la saisie' : '<span class="muted">valeur déduite : à vérifier</span>'}</td></tr>`).join('')}</tbody></table>
        <p class="petit">${a.appliques.length} valeur(s) reprise(s) dans « Consignes du projet » ; cahier de paramétrage, table d'échange, EDE, analyse fonctionnelle et DOE suivent. L'étude passe à l'indice ${esc(nv)}.</p>
        <div class="actions"><button class="secondaire" id="vr-x">Annuler</button><button id="vr-ok" ${a.appliques.length ? '' : 'disabled'}>Reprendre dans l'étude (indice ${esc(et.indice || 'A')} → ${esc(nv)})</button></div>`);
      b.querySelector('#vr-x').onclick = () => Modal.close();
      b.querySelector('#vr-ok').onclick = () => {
        Object.assign(n.entrees, a.entrees);
        et.historiqueIndices = [...(et.historiqueIndices || []), { indice: nv, date: aujourdhui(), motif: `Valeurs réglées sur site (${d[0].source}) : ${a.appliques.map(x => x.libelle).join(', ')}`.slice(0, 500) }];
        et.indice = nv; enregistrer(et); Modal.close(); App.render();
        toast(`${a.appliques.length} valeur(s) reprise(s) ; étude à l'indice ${nv}.`, 6000);
      };
    };
    // Consignes de pression des CTA : relevées à la mise en service (PV du chantier dans Pipe-Fit)
    const prCta = root.querySelector('#elec-pressions');
    if (prCta) prCta.onclick = async () => {
      if (!et.affaireId) return toast('Étude non rattachée à un chantier de Pipe-Fit : saisissez les pressions relevées dans « Consignes de pression des CTA ».', 7000);
      let l = [];
      try { l = await api('GET', `/api/pf/pressions-cta?affaireId=${encodeURIComponent(et.affaireId)}`); } catch (er) { return toast(er.message, 6000); }
      if (!l.length) return toast('Aucune pression de soufflage ou de reprise relevée dans les mises en service de ce chantier pour l\'instant.', 7000);
      const ex = (n.entrees.pressionsCta || []).filter(x => !l.some(y => String(y.cta).toLowerCase() === String(x.cta || '').toLowerCase()));
      n.entrees.pressionsCta = [...ex, ...l]; enregistrer(et); App.render();
      toast(`${l.length} CTA : pressions reprises des PV de mise en service (consignes des boucles et du cahier de paramétrage).`, 6000);
    };
    const cd = root.querySelector('#elec-cahier-docx');
    if (cd) cd.onclick = () => {
      const { c, marque } = cahierDe(); if (!c.length || typeof Docx === 'undefined') return;
      const octets = Docx.build(Docx.cahierBlocs(c, { titre: `Cahier de paramétrage — ${marque}`, affaire: [et.objet, et.client].filter(Boolean).join(' — '), indice: et.indice, date: et.date, entetesDefaut: Gtb.ENTETES_CAHIER }));
      Promise.resolve(telecharger(nomCahier('docx'), octets, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
        .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Cahier de paramétrage enregistré (Word)')).catch(er => toast(er.message, 6000));
    };
    const cx = root.querySelector('#elec-cahier-xlsx');
    if (cx) cx.onclick = () => {
      const { c } = cahierDe(); if (!c.length || typeof XLSX === 'undefined') return;
      const H = v => ({ v, s: 'head' }), feuilles = [];
      c.forEach(a => a.sections.forEach((s, i) => {
        const ent = s.entetes || Gtb.ENTETES_CAHIER;
        feuilles.push({ name: `${c.length > 1 ? `${a.armoire} ` : ''}${i + 1}. ${s.titre}`.replace(/[\[\]:*?/\\]/g, '-').slice(0, 31), freeze: s.intro ? 5 : 3,
          cols: ent.map(h => (/Libellé|Logique|À valider|Action|Désignation|Remarque|Réglages/.test(h) ? 60 : /Installation|Fonction|Alarme|Unité|Signal|Condition/.test(h) ? 30 : 16)),
          rows: [[{ v: `${s.titre} — armoire ${a.armoire} — ${et.objet} (indice ${et.indice})`, s: 'title' }], ...(s.intro ? [[s.intro], []] : [[]]), ent.map(H), ...s.lignes] });
      }));
      Promise.resolve(telecharger(nomCahier('xlsx'), XLSX.build(feuilles), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
        .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : `Cahier enregistré : ${feuilles.length} onglets`)).catch(er => toast(er.message, 6000));
    };
    // Table d'échange GTB au format neutre (CSV « ; », UTF-8 avec BOM pour Excel) : objets BACnet, registres Modbus
    const ecsv = root.querySelector('#elec-csv');
    if (ecsv) ecsv.onclick = () => {
      const c = (Liens.calculer(et, n).valeurs || {}).echangeCsv;
      if (!c) return toast('Aucun point.', 4000);
      Promise.resolve(telecharger(`Table_echange_GTB_${sansAccents(et.objet).slice(0, 40)}_Ind${sansAccents(et.indice) || 'A'}.csv`, new TextEncoder().encode(`\ufeff${c}`), 'text/csv'))
        .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Table d\'échange enregistrée')).catch(er => toast(er.message, 6000));
    };
    const ec = root.querySelector('#elec-cables');
    if (ec) ec.onclick = () => {
      let c = et.notes.find(x => x.type === 'cable');
      if (!c) { c = nouvelleNote('cable'); c.entrees.liaisons = []; c.commentaire = 'Liaisons à la charge du lot CVC reprises du calcul d\'alimentation électrique. Note à soumettre au bureau d\'études électricité pour validation.'; et.notes.splice(et.notes.indexOf(n) + 1, 0, c); }
      versCables(c, n); enregistrer(et);
      location.hash = `#/etude/${et.id}/${c.id}`;
    };
    // Alimentation électrique : équipements repris des autres calculs (schéma, réseaux, CTA…), choix déjà faits conservés
    // Plomberie sanitaire : foisonnement comparé (DTU, saisi, aucun) puis choisi
    const sf = root.querySelector('#san-foison');
    if (sf) sf.onclick = () => {
      const es = Liens.resoudre(et, n).entrees, res = m => Notes.calculer('sanitaire', { ...es, foisonnement: m, coefSaisi: m === 'saisi' ? Notes.num(es.coefSaisi, 60) : es.coefSaisi }).valeurs || {};
      const f = x => Notes.nf(x, 2), modes = Object.entries(Sanitaire.FOISONNEMENTS);
      const b = Modal.open(`<h2>⚖️ Foisonnement</h2><p class="muted petit">Tous les appareils ne puisent pas en même temps : le débit probable = Σ débits de base × y. Les diamètres, pertes de charge et le point le plus défavorisé sont recalculés.</p>
        <table><thead><tr><th>Méthode</th><th>EF au compteur</th><th>ECS en sortie de production</th><th></th></tr></thead><tbody>
        ${modes.map(([k, l]) => { const v = res(k); return `<tr${(es.foisonnement || 'dtu') === k ? ' style="font-weight:600"' : ''}><td>${esc(l)}</td><td>${f(v.totEF)} L/s (${f(v.totEF * 3.6)} m³/h)</td><td>${f(v.totC)} L/s</td><td><button class="petit${(es.foisonnement || 'dtu') === k ? '' : ' secondaire'}" data-sf="${k}">Choisir</button></td></tr>`; }).join('')}</tbody></table>
        <label>Coefficient saisi (%) <input id="sf-c" inputmode="decimal" value="${esc(String(Notes.num(es.coefSaisi, 60)))}"></label>
        <div class="actions"><button class="secondaire" id="sf-x">Fermer</button></div>`);
      b.querySelector('#sf-x').onclick = Modal.close;
      b.querySelectorAll('[data-sf]').forEach(x => { x.onclick = () => { n.entrees.foisonnement = x.dataset.sf; if (x.dataset.sf === 'saisi') { const c = Notes.num(String(b.querySelector('#sf-c').value).replace(',', '.')); if (c > 0) n.entrees.coefSaisi = Math.min(100, c); } enregistrer(et); Modal.close(); App.render(); toast(`Foisonnement : ${Sanitaire.FOISONNEMENTS[x.dataset.sf]}`, 4000); }; });
    };
    // Schéma aéraulique : même vitesse sur toutes les branches choisies (diamètres recalculés)
    const nb = root.querySelector('#num-bouches');
    if (nb) nb.onclick = () => {
      const sch = Registre.schemasAir(et), I = new Map(SchemaAir.installationsAir(et));
      const b = Modal.open(`<h2>🔢 Numérotation des bouches</h2><p class="muted petit">Chaque bouche a un numéro unique dans l'étude : il sert au repérage sur plan, au relevé des débits et à sa fiche de mise en service.</p>
        <label style="display:flex;gap:.6em;align-items:center;margin:.4em 0;font-weight:normal"><input type="radio" style="width:auto;flex:none" name="nb-mode" value="completer" checked> Compléter : numéroter les bouches sans repère et celles en double (les autres gardent leur numéro)</label>
        <label style="display:flex;gap:.6em;align-items:center;margin:.4em 0;font-weight:normal"><input type="radio" style="width:auto;flex:none" name="nb-mode" value="tout"> Tout renuméroter (quand l'étude est au point, avant les fiches de mise en service)</label>
        <div class="grille-champs" id="nb-opts"><label>Ordre<select id="nb-ordre"><option value="zone">Par zone puis par pièce</option><option value="branche">Dans l'ordre des branches du réseau</option></select></label>
          <label>Numéros<select id="nb-prefixe"><option value="B">B-01, B-02…</option><option value="reseau">Par réseau : S-01 soufflage, R-01 reprise, E-01 extraction</option><option value="autre">Autre préfixe…</option></select></label>
          <label>Préfixe<input id="nb-texte" value="BS" disabled></label><label>Premier numéro<input id="nb-debut" type="number" min="1" value="1"></label>
          ${sch.length > 1 ? `<label class="large">Schémas<select id="nb-portee"><option value="${n.id}">Ce schéma : ${esc(I.get(n.id) || n.titre)}</option><option value="tous">Toutes les bouches de l'étude (${sch.length} CTA / extracteurs, numérotation continue)</option></select></label>` : ''}</div>
        <div class="actions"><button class="secondaire" id="nb-x">Annuler</button><button id="nb-ok">Numéroter</button></div>`);
      b.querySelector('#nb-x').onclick = Modal.close;
      b.querySelector('#nb-prefixe').onchange = ev => { b.querySelector('#nb-texte').disabled = ev.target.value !== 'autre'; };
      b.querySelector('#nb-ok').onclick = () => {
        let k;
        if (b.querySelector('[name="nb-mode"]:checked').value === 'completer') {
          const pris = Registre.repsBouches(et);
          (n.entrees.bouchesL || []).forEach(x => pris.delete(String(x.rep || '').trim()));
          k = Registre.numeroter(n.entrees.bouchesL || [], 'B', 'rep', x => x.rep || x.salle || x.zone || x.Q || x.troncon);
          const vus = new Set(); (n.entrees.bouchesL || []).forEach(x => { const r = String(x.rep || '').trim(); if (r && pris.has(r) && !vus.has(r)) { x.rep = Registre.repSuivant(r, new Set([...pris, ...Registre.repsBouches(et)])); k++; } vus.add(x.rep); });
        } else {
          const pf = b.querySelector('#nb-prefixe').value, portee = b.querySelector('#nb-portee') ? b.querySelector('#nb-portee').value : n.id;
          k = Registre.renumeroterBouches(et, { notes: portee === 'tous' ? null : [n.id], ordre: b.querySelector('#nb-ordre').value, prefixe: pf === 'autre' ? b.querySelector('#nb-texte').value : pf, debut: +b.querySelector('#nb-debut').value || 1 });
        }
        enregistrer(et); Modal.close(); App.render();
        toast(k ? `${k} bouche(s) numérotée(s) : chaque bouche a son numéro unique.` : 'Toutes les bouches ont déjà un numéro unique.', 5000);
      };
    };
    const nt = root.querySelector('#num-terminaux');
    if (nt) nt.onclick = () => {
      // Repère changé : les branches du réseau arborescent qui pointaient sur l'ancien repère suivent seulement s'il était unique
      const k = Registre.numeroter(n.entrees.appareils || [], a => Registre.typeTerminal(Terminaux.TYPES[a.type] ? Terminaux.TYPES[a.type][0] : '', a).prefixe, 'rep', a => a.type || a.rep);
      enregistrer(et); App.render(); toast(k ? `${k} terminal(aux) renuméroté(s) : raccordez-les dans le réseau arborescent (« Ajouter les émetteurs de l'étude »).` : 'Tous les terminaux ont déjà un repère unique.', 6000);
    };
    const av = root.querySelector('#aero-vitesses');
    if (av) av.onclick = () => {
      const b = Modal.open(`<h2>💨 Vitesse des branches</h2><p class="muted petit">La gaine de chaque branche est recalculée (plus petit diamètre dont la vitesse reste sous la valeur).</p>
        <label>Vitesse (m/s) <input id="av-v" inputmode="decimal" value="4"></label>
        <label>Branches <select id="av-p"><option value="tout">Toutes</option><option value="princ">Principales (avec des branches en aval)</option><option value="term">Terminales (bouches)</option></select></label>
        <div class="actions"><button class="secondaire" id="av-auto">Revenir en automatique</button><span class="espace"></span><button class="secondaire" id="av-x">Annuler</button><button id="av-ok">Appliquer</button></div>`);
      const tr = n.entrees.troncons || [], aval = t => tr.some(x => String(x.amont || '').trim() === String(t.rep || '').trim());
      const cibles = () => tr.filter(t => ({ tout: true, princ: aval(t), term: !aval(t) })[b.querySelector('#av-p').value]);
      b.querySelector('#av-x').onclick = Modal.close;
      b.querySelector('#av-auto').onclick = () => { cibles().forEach(t => { t.v = ''; }); enregistrer(et); Modal.close(); App.render(); };
      b.querySelector('#av-ok').onclick = () => { const v = Notes.num(String(b.querySelector('#av-v').value).replace(',', '.')); if (!(v > 0)) return toast('Vitesse invalide', 3000); const c = cibles(); c.forEach(t => { t.v = v; }); enregistrer(et); Modal.close(); App.render(); toast(`${c.length} branche(s) à ${String(v).replace('.', ',')} m/s : diamètres recalculés`, 4000); };
    };
    // Réseau arborescent : une branche par émetteur de l'étude non encore relié, rattachée au premier tronçon de départ
    // Schéma de principe : robinetterie type par circuit, nomenclature et liste d'achat
    const pp = root.querySelector('#pid-pompes');
    if (pp) pp.onclick = () => {
      // Circuits, puis pompes de production (primaires, échangeur, récupération, refroidissement)
      let prod = []; try { const eR = Liens.resoudre(et, n).entrees; prod = Schema.pompesProduction(eR, Schema.dimensionner(eR)).map(p => p.cle); } catch (er) { prod = []; }
      const l = n.entrees.pompesFab = n.entrees.pompesFab || [], deja = new Set(l.map(x => x.circuit)), c = [...(n.entrees.circuits || []).map((x, i) => x.rep || `C${i + 1}`), ...prod].filter(r => !deja.has(r));
      if (!c.length) return toast('Chaque circuit et chaque pompe de production a déjà sa ligne.', 4000);
      c.forEach(r => l.push({ circuit: r, ref: '', courbe: '' })); enregistrer(et); App.render(); toast(`${c.length} pompe(s) à renseigner : chargez la fiche (tableau des fiches) ou saisissez la courbe Q:H.`, 6000);
    };
    // Redimensionnement des vannes : autorité ≥ 0,5 (Kvs normalisé retenu, vanne du catalogue), appliqué après confirmation
    const pv = root.querySelector('#pid-vannes');
    if (pv) pv.onclick = () => {
      let mods; try { mods = Schema.redimensionnerVannes(Liens.resoudre(et, n).entrees); } catch (er) { return toast(er.message, 5000); }
      if (!mods.length) return toast('Toutes les vannes ont une autorité d\'au moins 0,5 : rien à modifier.', 4000);
      const nf = Notes.nf, b = Modal.open(`<h2>🎚️ Redimensionner les vannes — ${esc(n.titre)}</h2>
        <p class="muted petit">Autorité visée ≥ 0,5 : ΔP de vanne au moins égale à la ΔP de la partie à débit variable ; Kvs normalisé immédiatement inférieur au Kv cible (vanne plus résistante). Les pompes des circuits sont recalculées avec la nouvelle ΔP.</p>
        <div class="defile-x"><table class="liste compact"><thead><tr><th>Circuit</th><th>Vanne</th><th>Débit (m³/h)</th><th>Avant : Kvs · ΔP · autorité</th><th>Kv cible</th><th>Après : Kvs · ΔP · autorité</th><th>Vanne du catalogue</th></tr></thead><tbody>
        ${mods.map(m => `<tr><td>${esc(m.rep)}</td><td>${m.type === '3v' ? '3 voies' : '2 voies'}</td><td>${nf(m.Qv, 2)}</td><td>${m.kvsAvant ? nf(m.kvsAvant, m.kvsAvant < 1 ? 2 : 1) : '—'} · ${nf(m.dpAvant, 1)} kPa · ${nf(m.autoriteAvant, 2)}</td><td>${nf(m.kvCible, 2)}</td>
          <td><strong>${nf(m.kvs, m.kvs < 1 ? 2 : 1)}</strong> · ${nf(m.dpApres, 1)} kPa · <strong>${nf(m.autoriteApres, 2)}</strong></td><td class="petit">${esc(m.vanne || '—')}</td></tr>`).join('')}</tbody></table></div>
        <div class="actions"><button class="secondaire" id="rv-x">Annuler</button><button id="rv-ok">Appliquer (${mods.length} vanne${mods.length > 1 ? 's' : ''})</button></div>`);
      b.querySelector('#rv-x').onclick = Modal.close;
      b.querySelector('#rv-ok').onclick = () => {
        if (!Array.isArray(n.entrees.circuits)) n.entrees.circuits = JSON.parse(JSON.stringify(Notes.defauts('pid').circuits || []));
        const k = Schema.appliquerVannes(n.entrees, mods); enregistrer(et); Modal.close(); App.render();
        toast(`${k} vanne(s) redimensionnée(s) : Kvs retenu dans la colonne « Kvs retenu » des circuits (autorité ≥ 0,5).`, 6000);
      };
    };
    const pr = root.querySelector('#pid-rob');
    if (pr) pr.onclick = () => {
      const l = n.entrees.robinetterie = n.entrees.robinetterie || [], avec = new Set(l.map(r => r.circuit)), circuits = (n.entrees.circuits || []).map((c, i) => c.rep || `C${i + 1}`).filter(c => !avec.has(c));
      if (!circuits.length) return toast('Chaque circuit a déjà sa robinetterie.', 4000);
      circuits.forEach((c, k) => { const s = (n.entrees.circuits || []).findIndex(x => (x.rep || '') === c) + 1 || k + 1;
        [['isolement', 4, 'VI'], ['equilibrage', 1, 'VE'], ['filtre', 1, 'F'], ['manchette', 2, 'MA'], ['thermometre', 2, 'TH']].forEach(([type, qte, p]) => l.push({ rep: `${p}${s}`, circuit: c, type, dn: '', qte, kv: '', dp: '', ref: '' })); });
      enregistrer(et); App.render(); toast(`Robinetterie type ajoutée sur ${circuits.length} circuit(s) : chargez les fiches techniques (tableau des fiches) pour les Kv et pertes de charge.`, 6000);
    };
    const pn = root.querySelector('#pid-nomenc');
    if (pn) pn.onclick = () => {
      // Liste d'achat chiffrée avec la bibliothèque de Pipe-Fit : classeur Excel, consultation des fournisseurs
      const calc = x => Liens.calculer(et, x); calc.entrees = x => Liens.resoudre(et, x).entrees;
      const arts = (S.pf && S.pf.articles) || [], liste = Nomenclature.prixAchats(Nomenclature.achats(Nomenclature.lignes(et, n, calc)), arts);
      const tot = liste.reduce((s, x) => s + x.total, 0), eur = v => `${Notes.nf(v, 2)} €`;
      const b = Modal.open(`<h2>📦 Liste d'achat — ${esc(n.titre)}</h2>
        <p class="muted petit">${liste.length} article(s), ${liste.filter(x => x.pu).length} chiffré(s) avec la bibliothèque de Pipe-Fit (coût d'achat) ; les autres sont à chiffrer par la consultation.</p>
        <div class="defile-x" style="max-height:48vh;overflow:auto"><table class="liste compact"><thead><tr><th>Désignation</th><th>DN</th><th>Qté</th><th>Article de la bibliothèque</th><th>PU HT</th><th>Total HT</th></tr></thead><tbody>
        ${liste.map(x => `<tr><td>${esc(x.designation)}${x.reference ? ` <span class="muted petit">${esc([x.fabricant, x.reference].filter(Boolean).join(' '))}</span>` : ''}</td><td>${x.dn ? `DN ${esc(String(x.dn))}` : ''}</td><td>${esc(Notes.nf(x.qte, x.unite === 'ml' ? 1 : 0))} ${esc(x.unite)}</td>
          <td class="petit">${x.articleId ? esc(`${x.articleRef ? `${x.articleRef} — ` : ''}${x.articleDesignation}`) : '<span class="muted">à chiffrer</span>'}</td><td>${x.pu ? eur(x.pu) : ''}</td><td>${x.pu ? eur(x.total) : ''}</td></tr>`).join('')}
        <tr class="total"><td colspan="5">Total des articles chiffrés</td><td>${eur(tot)}</td></tr></tbody></table></div>
        ${et.affaireId ? '' : '<p class="petit alerte attention">Reliez l\'étude à un chantier (fiche de l\'étude) pour lancer la consultation des fournisseurs.</p>'}
        <div class="actions"><button class="secondaire" id="la-x">Fermer</button><button class="secondaire" id="la-xlsx">📊 Classeur Excel</button>${et.affaireId ? '<button id="la-cs">🛒 Consulter les fournisseurs dans Pipe-Fit</button>' : ''}</div>`);
      b.querySelector('#la-x').onclick = Modal.close;
      const cs = b.querySelector('#la-cs');
      if (cs) cs.onclick = async () => {
        cs.disabled = true; cs.textContent = 'Création…';
        try {
          const r = await api('POST', '/api/pf/consultation', { affaireId: et.affaireId, etudeId: et.id, noteId: n.id, objet: `${n.titre} — ${et.objet}`.slice(0, 200), lignes: Nomenclature.lignesConsultation(liste) });
          const pf = S.me.pipefit || (/^https?:$/.test(location.protocol) ? `${location.protocol}//${location.hostname}:3000` : '');
          cs.outerHTML = `<span class="badge ok">Consultation ${esc(r.ref || '')} créée</span>${pf ? `<a class="btn" href="${esc(pf)}/#/consultations/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Ouvrir dans Pipe-Fit ↗</a>` : ''}`;
          toast('Consultation créée dans Pipe-Fit : choisissez les fournisseurs, envoyez la demande de prix ; l\'offre retenue devient la commande du chantier.', 7000);
        } catch (e) { cs.disabled = false; cs.textContent = '🛒 Consulter les fournisseurs dans Pipe-Fit'; toast(e.message, 6000); }
      };
      b.querySelector('#la-xlsx').onclick = () => {
      if (typeof XLSX === 'undefined') return toast('Classeur indisponible.', 5000);
      const f = Nomenclature.feuilles(et, n, calc, arts), H = v => ({ v, s: 'head' });
      const octets = XLSX.build(f.map(x => ({ name: x.name, freeze: 3, cols: x.entetes.map(h => (/Désignation/.test(h) ? 52 : /Circuit|Fabricant|Référence|Repères|Fournisseur|Fiche/.test(h) ? 22 : 12)),
        rows: [[{ v: `${x.name} — ${n.titre} — ${et.objet} (indice ${et.indice})`, s: 'title' }], [], x.entetes.map(H), ...x.lignes] })));
      Promise.resolve(telecharger(`Nomenclature_${sansAccents(n.titre).slice(0, 30)}_${sansAccents(et.objet).slice(0, 30)}.xlsx`, octets, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
        .then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : `Nomenclature enregistrée : ${f[0].lignes.length} ligne(s), ${f[1].lignes.length - 1} article(s) à acheter`, 5000)).catch(er => toast(er.message, 6000));
      };
    };
    // Évacuations : appareils repris du calcul sanitaire (tronçon à choisir)
    const es = root.querySelector('#evac-san');
    if (es) es.onclick = () => {
      const san = et.notes.find(x => x.id === n.entrees.sanitaire && x.type === 'sanitaire') || et.notes.find(x => x.type === 'sanitaire');
      if (!san) return toast('Aucun calcul « Eau froide et eau chaude sanitaires » dans l\'étude.', 5000);
      const l = n.entrees.appareils = (n.entrees.appareils || []).filter(a => a.rep || a.salle), deja = new Set(l.map(a => a.rep).filter(Boolean));
      const nv = Evacuation.depuisSanitaire(Liens.resoudre(et, san).entrees.points).filter(a => !a.rep || !deja.has(a.rep));
      if (!nv.length) return toast('Tous les appareils du calcul sanitaire sont déjà repris.', 4000);
      l.push(...nv); n.entrees.sanitaire = san.id; enregistrer(et); App.render(); toast(`${nv.length} appareil(s) repris : choisissez leur tronçon.`, 5000);
    };
    // Terminaux : un terminal par pièce sans terminal (bilan pièce par pièce)
    // Bouches : une ligne par pièce de l'étude qui n'en a pas ; surface et débit repris des pièces (verrouillés)
    const bpi = root.querySelector('#bouches-pieces');
    if (bpi) bpi.onclick = () => {
      const l = n.entrees.locaux = n.entrees.locaux || [], deja = new Set(l.map(x => Pieces.norm(x.local))), lx = Notes.lieuxEtude(et);
      const nv = lx.salles.filter(s => !deja.has(Pieces.norm(s)) && (Pieces.besoinsEtude(et)[Pieces.norm(s)] || et.notes.some(x => x.type === 'aero' && ((x.entrees || {}).bouchesL || []).some(b => Pieces.norm(b.salle) === Pieces.norm(s)))));
      nv.forEach(s => l.push({ local: s, S: '', Q: '', n: 1, type: 'plafond', portee: '', LpMax: 35 }));
      n.entrees.reprise = 'pieces';
      enregistrer(et); App.render(); toast(nv.length ? `${nv.length} pièce(s) ajoutée(s) : surface et débit repris de l'étude ; choisissez le type et le nombre de bouches.` : 'Surface et débit des locaux repris des pièces de l\'étude (même nom).', 6000);
    };
    const tp = root.querySelector('#term-pieces');
    if (tp) tp.onclick = () => {
      const l = n.entrees.appareils = n.entrees.appareils || [], nv = Pieces.terminauxManquants(et, l);
      if (!nv.length) return toast('Chaque pièce du bilan a déjà son terminal.', 4000);
      const reps = new Set(l.map(a => a.rep)); let k = l.length + 1;
      nv.forEach(x => { let r; do { r = `T-${String(k++).padStart(2, '0')}`; } while (reps.has(r)); reps.add(r); l.push({ rep: r, local: x.local, type: x.type, n: 1, Pch: x.Pch, Pfr: x.Pfr, batterie: '4t', vanne: '2v', Pvent: '', Pbe: '', tension: '', alim: 'cvc', regul: 'propre', ref: '' }); });
      enregistrer(et); App.render(); toast(`${nv.length} terminal(aux) créé(s) aux puissances des pièces : choisissez le modèle (fiche technique).`, 6000);
    };
    const aj = root.querySelector('#arbo-jumeau');
    if (aj) aj.onclick = () => {
      const froid = n.entrees.saison !== 'froid';
      const b = Modal.open(`<h2>${froid ? '❄️ Réseau froid' : '🔥 Réseau chaud'} de ${esc(n.titre)}</h2><p class="muted petit">Même arborescence, mêmes repères et mêmes émetteurs ; puissances, débits et pertes de charge repris des batteries ${froid ? 'froides' : 'chaudes'} de chaque émetteur.</p>
        <label class="case" style="display:block"><input type="radio" name="jm" value="separe" checked> Réseau séparé (4 tubes) : ses tubes, ses vannes d'équilibrage, sa pompe, sa fiche de mise en service</label>
        <label class="case" style="display:block"><input type="radio" name="jm" value="meme"> Même réseau en change-over (2 tubes) : vérification en saison ${froid ? 'froide' : 'chaude'}, une seule fiche de mise en service</label>
        <div class="grille-champs"><label>Température moyenne de l'eau (°C)<input id="jm-t" value="${froid ? 9.5 : 60}"></label><label>Écart de température (K)<input id="jm-dt" value="${froid ? 5 : 15}"></label></div>
        <div class="actions"><button class="secondaire" id="jm-x">Annuler</button><button id="jm-ok">Créer</button></div>`);
      b.querySelector('#jm-x').onclick = Modal.close;
      b.querySelector('#jm-ok').onclick = () => {
        const j = nouvelleNote('arbo'), meme = b.querySelector('[name="jm"]:checked').value === 'meme';
        j.titre = `${n.titre} — ${froid ? 'eau glacée' : 'eau chaude'}${meme ? ' (même réseau, change-over)' : ''}`;
        j.entrees = Equilibrage.jumeau(n.entrees, { id: n.id, meme, Tm: Notes.num(b.querySelector('#jm-t').value, froid ? 9.5 : 60), dT: Notes.num(b.querySelector('#jm-dt').value, froid ? 5 : 15) });
        n.entrees.jumeau = j.id;
        et.notes.splice(et.notes.indexOf(n) + 1, 0, j); enregistrer(et); Modal.close();
        location.hash = `#/etude/${et.id}/${j.id}`; toast(`${j.titre} créé : ${j.entrees.troncons.filter(t => t.emetteur).length} branche(s) d'émetteur reprises.`, 6000);
      };
    };
    const ar = root.querySelector('#arbo-recopier');
    if (ar) ar.onclick = () => { const src = et.notes.find(x => x.id === n.entrees.jumeau); if (!src) return; const k = Equilibrage.recopierArbre(src.entrees, n.entrees); enregistrer(et); App.render(); toast(k ? `${k} modification(s) d'arborescence reprise(s) de ${src.titre}` : 'Arborescences déjà identiques.', 5000); };
    const lp = root.querySelector('#longueurs-plan');
    if (lp) lp.onclick = () => dialogueLongueurs(et, n);
    const ae = root.querySelector('#arbo-emetteurs');
    if (ae) ae.onclick = () => {
      // Réseau d'un circuit du schéma de principe : ses terminaux (et ceux non rattachés, qui le deviennent)
      const pid = et.notes.find(x => x.type === 'pid' && ((x.entrees || {}).circuits || []).some(c => c.annexe === n.id)), circ = pid && pid.entrees.circuits.find(c => c.annexe === n.id), cleC = circ ? `${pid.id}|${circ.rep}` : '';
      const appDe = cl => { const [id, r] = cl.split(':'), tn = et.notes.find(x => x.id === id); return tn && tn.type === 'terminaux' ? (tn.entrees.appareils || []).find(a => a.rep === r) : null; };
      const tr = n.entrees.troncons = n.entrees.troncons || [], dispo = Equilibrage.emetteursEtude(et, n.entrees.saison).filter(x => { const a = appDe(x.cle); return !cleC || !a || !a.circuit || a.circuit === cleC; }), deja = new Set(tr.map(t => t.emetteur).filter(Boolean));
      const nouveaux = dispo.filter(x => !deja.has(x.cle));
      if (!nouveaux.length) return toast(dispo.length ? 'Tous les émetteurs de l\'étude ont déjà leur branche.' : 'Aucun émetteur dans l\'étude : ajoutez un calcul « Terminaux » ou une CTA.', 5000);
      // Chaque émetteur (repère unique) a sa branche : tronçon amont choisi ligne par ligne (proposé d'après la pièce)
      const amonts = tr.filter(t => String(t.rep || '').trim() && !t.emetteur), racine0 = amonts.find(t => !String(t.amont || '').trim());
      const propose = x => { const p = String(x.nom || '').toLowerCase(); const t = p && amonts.find(y => y !== racine0 && String(y.nom || '').toLowerCase().includes(p)); return (t || racine0 || {}).rep || 'C'; };
      const opts = sel => `${amonts.length ? '' : '<option value="C">C — départ pompe (créé)</option>'}${amonts.map(t => `<option value="${esc(t.rep)}" ${t.rep === sel ? 'selected' : ''}>${esc(t.rep)}${t.nom ? ` — ${esc(t.nom)}` : ''}</option>`).join('')}`;
      const b = Modal.open(`<h2>🌀 Raccorder les émetteurs</h2><p class="muted petit">Une branche par émetteur, avec son repère unique : choisissez le tronçon amont de chacun (antenne, étage, pièce). Puissance, débit et pertes de charge sont repris de l'émetteur ; il restera la longueur.</p>
        <p><label>Même tronçon amont pour tous <select id="ae-tous"><option value="">—</option>${opts('')}</select></label></p>
        <div class="defile-x" style="max-height:55vh;overflow:auto"><table><thead><tr><th><input type="checkbox" id="ae-tout" checked></th><th>Émetteur</th><th>Tronçon amont</th></tr></thead><tbody>${nouveaux.map((x, i) => `<tr><td><input type="checkbox" data-ae="${i}" checked></td><td>${esc(x.libelle)}</td><td><select data-ae-amont="${i}">${opts(propose(x))}</select></td></tr>`).join('')}</tbody></table></div>
        <div class="actions"><button class="secondaire" id="ae-x">Annuler</button><button id="ae-ok">Créer les branches</button></div>`);
      b.querySelector('#ae-x').onclick = Modal.close;
      b.querySelector('#ae-tout').onchange = ev => b.querySelectorAll('[data-ae]').forEach(c => { c.checked = ev.target.checked; });
      b.querySelector('#ae-tous').onchange = ev => { if (ev.target.value) b.querySelectorAll('[data-ae-amont]').forEach(s => { s.value = ev.target.value; }); };
      b.querySelector('#ae-ok').onclick = () => {
        const choisis = nouveaux.map((x, i) => [x, b.querySelector(`[data-ae="${i}"]`).checked, b.querySelector(`[data-ae-amont="${i}"]`).value]).filter(y => y[1]);
        if (!choisis.length) return Modal.close();
        if (!amonts.length) tr.unshift({ rep: 'C', amont: '', nom: 'Départ pompe → collecteur', L: 10, zeta: 4, tube: '', P: '', Q: '', dpEm: '' });
        const reps = new Set(tr.map(t => t.rep));
        choisis.forEach(([x, , amont]) => { let r = x.rep, k = 2; while (reps.has(r)) r = `${x.rep}-${k++}`; reps.add(r); tr.push({ rep: r, amont, nom: x.nom, L: 10, zeta: 5, tube: '', emetteur: x.cle, P: '', Q: '', dpEm: '' }); });
        if (cleC) choisis.forEach(([x]) => { const a = appDe(x.cle); if (a && !a.circuit) a.circuit = cleC; });
        enregistrer(et); Modal.close(); App.render();
        toast(`${choisis.length} branche(s) créée(s), une par émetteur : puissance, débit et pertes de charge repris ; saisissez la longueur de chacune.`, 7000);
      };
    };
    const rep = root.querySelector('#elec-reprendre');
    if (rep) rep.onclick = () => {
      const r = Electricite.fusionner((n.entrees || {}).equipements, Electricite.equipementsEtude(et, Liens), new Set(et.notes.map(x => x.id)));
      if (!r.ajoutees && !r.majs) return toast('Aucun nouvel équipement : ajoutez un schéma de principe, un réseau, une CTA… à l\'étude, ou saisissez les équipements.', 6000);
      n.entrees = { ...(n.entrees || {}), equipements: r.lignes }; enregistrer(et); App.render();
      toast(`${r.ajoutees} équipement(s) ajouté(s)${r.majs ? `, ${r.majs} mis à jour` : ''} : choisissez pour chacun son alimentation et sa régulation.`, 6000);
    };
    root.querySelectorAll('[data-n]').forEach(el => el.oninput = () => { n[el.dataset.n] = el.value; enregistrer(et); });
    // Réseau relié au schéma de principe : son nom est celui du circuit (s'il le portait déjà)
    const titreAvant = n.titre, tn = root.querySelector('.titre-note');
    if (tn) tn.addEventListener('input', () => root.querySelectorAll('#schema-circuit option[value$="|-1"]').forEach(o => { o.textContent = `➕ Nouveau circuit « ${tn.value} »`; }));
    if (tn) tn.addEventListener('change', () => {
      const ref = Liens.circuitDeAnnexe(et.notes, n), c = ref && ref.pid.entrees.circuits[ref.i];
      if (!c || !n.titre.trim() || (String(c.rep || '').trim() && String(c.rep).trim() !== titreAvant.trim())) return;
      const r = Liens.renommerCircuit(et, ref.pid, ref.i, n.titre); enregistrer(et); App.render();
      toast(`Circuit renommé « ${r} » dans ${ref.pid.titre} (terminaux, robinetterie et régulation suivent).`, 5000);
    });
    root.querySelectorAll('[data-bat-relier]').forEach(bt => bt.onclick = () => {
      const b = bt.dataset.batRelier, v = root.querySelector(`[data-bat-sel="${b}"]`).value;
      if (v.startsWith('arbo|')) {
        const a = et.notes.find(x => x.id === v.split('|')[1]), rep = a && Liens.brancherSurArbo(et, n, a, `${n.id}:${b}`);
        if (!rep) return;
        const dep = Liens.circuitDeAnnexe(et.notes, a);
        enregistrer(et); App.render(); toast(`Branche ${rep} créée dans ${a.titre} : saisissez sa longueur et son tronçon amont. ${dep ? `Le réseau est le départ « ${dep.pid.entrees.circuits[dep.i].rep} » du schéma de principe.` : 'Ouvrez ce réseau pour le placer en départ dans le schéma de principe.'}`, 8000); return;
      }
      const [pidId, k] = v.split('|'), r = Liens.relierAuSchema(et, n, pidId, Number(k));
      if (!r) return;
      if (Number(k) >= 0 && n.titre.trim()) Liens.renommerCircuit(et, r.pid, r.i, n.titre);
      enregistrer(et); App.render(); toast(`CTA placée dans ${r.pid.titre} : circuit « ${r.pid.entrees.circuits[r.i].rep} ».`, 6000);
    });
    const sr = root.querySelector('#schema-relier'), sCree = root.querySelector('#schema-creer');
    if (sr) sr.onclick = () => {
      const v = root.querySelector('#schema-circuit').value;
      if (v.startsWith('arbo|')) {
        const [, aid, cle] = v.split('|'), a = et.notes.find(x => x.id === aid), rep = a && Liens.brancherSurArbo(et, n, a, cle);
        if (!rep) return;
        const dep = Liens.circuitDeAnnexe(et.notes, a);
        enregistrer(et); App.render(); toast(`Branche ${rep} créée dans ${a.titre} : saisissez sa longueur et son tronçon amont. ${dep ? `Le réseau est le départ « ${dep.pid.entrees.circuits[dep.i].rep} » du schéma de principe.` : 'Ouvrez ce réseau pour le placer en départ dans le schéma de principe.'}`, 8000); return;
      }
      const [pidId, k] = v.split('|'), r = Liens.relierAuSchema(et, n, pidId, Number(k));
      if (!r) return;
      if (Number(k) >= 0 && n.titre.trim()) Liens.renommerCircuit(et, r.pid, r.i, n.titre);
      enregistrer(et); App.render(); toast(`${n.type === 'pid' ? 'Schéma relié' : 'Réseau placé'} dans ${r.pid.titre} : circuit « ${r.pid.entrees.circuits[r.i].rep} ».`, 6000);
    };
    if (sCree) sCree.onclick = () => {
      const p = nouvelleNote('pid'); p.entrees.circuits = []; et.notes.splice(et.notes.indexOf(n) + 1, 0, p);
      if (n.type === 'pid') { p.titre = `Schéma amont — ${n.titre}`; p.entrees.titreInstallation = p.titre; }
      const r = Liens.relierAuSchema(et, n, p.id, -1); enregistrer(et); App.render();
      toast(`Schéma de principe créé avec le circuit « ${r.pid.entrees.circuits[r.i].rep} » : complétez la production.`, 6000);
    };
    root.querySelector('#pdf-note').onclick = () => genererNoteCalcul(et, [n.id]);
    root.querySelector('#emettre-note').onclick = () => emettreNote(et, n);
    root.querySelectorAll('[data-retour]').forEach(b => b.onclick = () => dialogueRetour(et, n, b.dataset.retour));
    const ci = root.querySelector('#comparer-indices'); if (ci) ci.onclick = () => dialogueComparerIndices(et, n);
    const dn = root.querySelector('#diffuser-note'); if (dn) dn.onclick = () => dialogueDiffuser(et, [n.id]);
    root.querySelector('#defauts').onclick = async () => { if (await confirmer('Remplacer toutes les données saisies par les valeurs par défaut ?', 'Remplacer')) { n.entrees = Notes.defauts(n.type); enregistrer(et); App.render(); } };
    root.querySelector('#dupliquer').onclick = () => { const c = { ...copie(n), id: uidE(), titre: `${n.titre} (copie)`, emissions: [], indice: '' }; et.notes.splice(et.notes.indexOf(n) + 1, 0, c); enregistrer(et); location.hash = `#/etude/${et.id}/${c.id}`; };
    root.querySelector('#supprimer').onclick = async () => { if (await confirmer(`Supprimer le calcul « ${n.titre} » ?`, 'Supprimer')) { et.notes.splice(et.notes.indexOf(n), 1); enregistrer(et); location.hash = `#/etude/${et.id}`; } };
  },
};

// Émissions d'un calcul : indice émis, modifié depuis (badge de la liste des calculs) ; historique avec les modifications
// Fiches de mise en service prêtes à remplir (une par équipement) : choix des équipements, PDF à imprimer
// Matériel en vrac : toutes les fiches de l'affaire chargées d'un coup (PDF, fiches texte au format Pipe-Fit, texte collé),
// reconnues, puis réparties dans les calculs de l'étude (terminaux, CTA, production, pompes, vase, ballon, bouches, robinetterie…)
function dialogueVrac(et) {
  let items = [];
  const b = Modal.open(`<h2>📥 Matériel en vrac</h2><p class="muted petit">Chargez toutes les fiches techniques du chantier en une fois (PDF, fiches texte au format Pipe-Fit) ou collez plusieurs fiches séparées par une ligne <code>---</code>. Chaque fiche est reconnue (CTA, pompe, terminal, générateur, vase, ballon, bouche, vanne, appareil sanitaire), lue, puis vous choisissez où la répartir : rien n'est ressaisi.</p>
    <p><label class="btn">💻 Choisir les fiches (plusieurs à la fois)<input type="file" id="vr-fichiers" multiple accept=".pdf,application/pdf,image/*,.txt,.md,text/plain" hidden></label></p>
    <details><summary>📋 Coller des fiches au format Pipe-Fit</summary><textarea id="vr-texte" rows="8" style="width:100%" placeholder="Type : Terminal&#10;Fabricant : …&#10;Référence : …&#10;Puissance chaud : 3,2 kW&#10;---&#10;Type : Pompe&#10;…"></textarea>
      <button class="secondaire petit" id="vr-coller">Ajouter les fiches collées</button></details>
    <div id="vr-liste"></div>
    <div class="actions"><button class="secondaire" id="vr-x">Fermer</button><button id="vr-ok" disabled>Inscrire au registre et répartir</button></div>`);
  b.classList.add('large');
  const circuitsPid = () => et.notes.filter(n => n.type === 'pid').flatMap(n => (n.entrees.circuits || []).filter(c => c.rep).map(c => c.rep));
  const ajouter = (nom, lignes) => {
    const type = Vrac.classer(lignes, nom), lu = Vrac.lire(type === 'inconnu' ? 'generateur' : type, lignes), d = Vrac.destinations(et, type);
    items.push({ nom, lignes, type, lu, qte: 1, rep: '', local: '', circuit: '', cible: d.length ? d[0][0] : '' });
  };
  const rendre = () => {
    const z = b.querySelector('#vr-liste'), circ = [...new Set(circuitsPid())];
    b.querySelector('#vr-ok').disabled = !items.some(x => x.type !== 'inconnu');
    if (!items.length) { z.innerHTML = ''; return; }
    z.innerHTML = `<div class="defile-x"><table class="edit"><thead><tr><th>Fiche</th><th>Type reconnu</th><th>Lu</th><th>Qté</th><th>Repère</th><th>Local</th><th>Répartir dans</th><th>Branche</th><th>Circuit (P&ID)</th><th></th></tr></thead><tbody>${items.map((x, i) => {
      const d = Vrac.destinations(et, x.type);
      return `<tr><td class="petit">${esc(x.nom)}</td>
        <td><select data-vr="${i}" data-k="type">${Object.entries(Vrac.TYPES).map(([k, l]) => `<option value="${k}" ${k === x.type ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        <td class="petit"><strong>${esc([x.lu.fabricant, x.lu.reference].filter(Boolean).join(' ') || '—')}</strong><br><span class="muted">${esc(x.lu.resume || `${x.lu.nb} valeur(s)`)}</span></td>
        <td><input type="number" min="1" style="width:4em" data-vr="${i}" data-k="qte" value="${x.qte}"></td>
        <td><input style="width:6em" data-vr="${i}" data-k="rep" value="${esc(x.rep)}" placeholder="auto"></td>
        <td><input style="width:10em" data-vr="${i}" data-k="local" value="${esc(x.local)}" placeholder="Bureau 1 ; Salle ×2" title="Plusieurs pièces : « Bureau 1 ; Salle de réunion ×2 » (la quantité devient le total)"></td>
        <td>${d.length ? `<select data-vr="${i}" data-k="cible"><option value="">Registre seulement (à placer plus tard)</option>${d.map(([k, l]) => `<option value="${esc(k)}" ${k === x.cible ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<span class="petit muted">${x.type === 'inconnu' ? 'Choisissez le type' : 'Registre seulement : aucun calcul ne reçoit encore ce type'}</span>`}</td>
        <td>${(() => { const br = Registre.branches(et, x.cible); return br.length ? `<select style="max-width:12em" data-vr="${i}" data-k="branche"><option value="">—</option>${br.map(([k, l]) => `<option value="${esc(k)}" ${k === x.branche ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''; })()}</td>
        <td>${x.type === 'terminal' && circ.length ? `<select data-vr="${i}" data-k="circuit"><option value="">—</option>${circ.map(c => `<option ${c === x.circuit ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}</td>
        <td><button class="icone" data-vr-suppr="${i}" title="Retirer">✕</button></td></tr>`; }).join('')}</tbody></table></div>`;
    z.querySelectorAll('[data-vr]').forEach(el => el.onchange = () => {
      const x = items[+el.dataset.vr], k = el.dataset.k;
      x[k] = el.value;
      if (k === 'cible') { x.branche = ''; rendre(); return; }
      if (k === 'type') { x.lu = Vrac.lire(x.type === 'inconnu' ? 'generateur' : x.type, x.lignes); const d = Vrac.destinations(et, x.type); x.cible = d.length ? d[0][0] : ''; rendre(); }
      else b.querySelector('#vr-ok').disabled = !items.some(y => y.type !== 'inconnu');
    });
    z.querySelectorAll('[data-vr-suppr]').forEach(el => el.onclick = () => { items.splice(+el.dataset.vrSuppr, 1); rendre(); });
  };
  b.querySelector('#vr-x').onclick = Modal.close;
  b.querySelector('#vr-coller').onclick = () => {
    const blocs = Vrac.decouper(b.querySelector('#vr-texte').value);
    if (!blocs.length) return toast('Collez d\'abord le texte des fiches.', 3000);
    blocs.forEach((l, k) => ajouter(`Fiche collée ${items.length + 1}${blocs.length > 1 ? ` (${k + 1}/${blocs.length})` : ''}`, l));
    b.querySelector('#vr-texte').value = ''; rendre();
  };
  b.querySelector('#vr-fichiers').onchange = async ev => {
    const fichiers = [...ev.target.files]; ev.target.value = '';
    const z = b.querySelector('#vr-liste');
    for (const [k, f] of fichiers.entries()) {
      z.insertAdjacentHTML('afterbegin', `<p class="petit muted vr-lecture">Lecture ${k + 1}/${fichiers.length} : ${esc(f.name)}…</p>`);
      try {
        if (/^text\//.test(f.type || '') || /\.(txt|md)$/i.test(f.name || '')) Vrac.decouper(await f.text()).forEach((l, j, t) => ajouter(t.length > 1 ? `${f.name} (${j + 1}/${t.length})` : f.name, l));
        else ajouter(f.name, (await PdfLecture.lire(f, () => {}, { pagesMax: 12, ocr: typeof OCR !== 'undefined' })).lignes);
      } catch (e) { toast(`${f.name} : lecture impossible (${e.message})`, 5000); }
    }
    rendre();
  };
  b.querySelector('#vr-ok').onclick = () => {
    const comptes = [];
    items.filter(x => x.type !== 'inconnu').forEach(x => { try { const m = Vrac.appliquer(et, x, x.cible, nouvelleNote); if (m) comptes.push(m); } catch (e) { comptes.push(`${x.nom} : ${e.message}`); } });
    if (!comptes.length) return toast('Rien à répartir.', 3000);
    enregistrer(et); Modal.close(); App.render();
    const r = Modal.open(`<h2>📥 Matériel réparti</h2><ul>${comptes.map(c => `<li>${esc(c)}</li>`).join('')}</ul><p class="muted petit">Chaque modèle est inscrit une fois au registre des équipements ; les calculs reprennent ses valeurs. Complétez ce qui reste à choisir (tronçon d'une bouche ou d'un point de puisage, branche d'une pompe).</p><div class="actions"><button class="secondaire" id="vr-reg">Ouvrir le registre</button><button id="vr-fin">OK</button></div>`);
    r.querySelector('#vr-fin').onclick = Modal.close;
    r.querySelector('#vr-reg').onclick = () => dialogueRegistre(et);
  };
}

// Longueurs des tronçons depuis un export Revit (CSV, texte, Excel) ou un DXF : aperçu, puis report sur les tronçons
function dialogueLongueurs(et, n) {
  const b = Modal.open(`<h2>📏 Longueurs depuis les plans</h2><p class="muted petit">Revit : nomenclature de canalisations ou de gaines avec une colonne « Repère » (ou « Commentaires ») égale au repère du tronçon et une colonne « Longueur », exportée en CSV / texte ou Excel. DXF : une couche par tronçon, nommée par son repère. Les longueurs d'un même repère sont additionnées, les mm convertis en m.</p>
    <p><label class="btn">📂 Choisir l'export (CSV, TXT, XLSX, DXF)<input type="file" id="lg-f" accept=".csv,.txt,.xlsx,.dxf" hidden></label></p>
    <label class="case"><input type="checkbox" id="lg-div"${n.type === 'arbo' ? '' : ' disabled'}> Diviser par 2 (l'export contient l'aller et le retour sous le même repère ; le calcul attend la longueur aller)</label>
    <div id="lg-res"></div><div class="actions"><button class="secondaire" id="lg-x">Fermer</button><button id="lg-ok" disabled>Reporter les longueurs</button></div>`);
  let lu = null;
  const tr = () => n.entrees.troncons || [];
  const rendre = () => {
    const z = b.querySelector('#lg-res'); if (!lu) { z.innerHTML = ''; return; }
    if (lu.erreur) { z.innerHTML = `<p class="erreur">${esc(lu.erreur)}</p>`; return; }
    const p = Longueurs.proposer(tr(), lu.parRep, { diviser: b.querySelector('#lg-div').checked });
    b.querySelector('#lg-ok').disabled = !p.lignes.length;
    z.innerHTML = `<p class="petit">${lu.lignes} ligne(s) lue(s) (${esc(lu.colonnes.join(' / '))}, ${esc(lu.unite)}) · ${p.lignes.length} tronçon(s) trouvé(s)</p>
      ${p.lignes.length ? `<div class="defile-x"><table><thead><tr><th>Tronçon</th><th>Lu sous</th><th>Longueur actuelle (m)</th><th>Longueur des plans (m)</th></tr></thead><tbody>${p.lignes.map(x => `<tr><td>${esc(x.rep)}</td><td class="petit">${esc(x.cle)}</td><td>${esc(String(x.avant ?? '').replace('.', ','))}</td><td><strong>${String(x.apres).replace('.', ',')}</strong></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${p.nonUtilisees.length ? `<p class="petit muted">Sans tronçon de même repère : ${esc(p.nonUtilisees.slice(0, 30).join(', '))}${p.nonUtilisees.length > 30 ? '…' : ''}</p>` : ''}`;
  };
  b.querySelector('#lg-x').onclick = Modal.close;
  b.querySelector('#lg-div').onchange = rendre;
  b.querySelector('#lg-f').onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try {
      if (/\.dxf$/i.test(f.name)) lu = Longueurs.dxf(await f.text());
      else if (/\.xlsx$/i.test(f.name)) { const fe = await XLSX.read(await f.arrayBuffer()); lu = fe.map(x => Longueurs.depuisTableau(x.rows)).find(x => !x.erreur) || Longueurs.depuisTableau((fe[0] || {}).rows); }
      else lu = Longueurs.depuisTableau(Longueurs.csv(await f.text()));
    } catch (e) { lu = { erreur: `Lecture impossible : ${e.message}`, parRep: new Map() }; }
    rendre();
  };
  b.querySelector('#lg-ok').onclick = () => {
    const p = Longueurs.proposer(tr(), lu.parRep, { diviser: b.querySelector('#lg-div').checked });
    p.lignes.forEach(x => { tr()[x.i].L = x.apres; });
    enregistrer(et); Modal.close(); App.render(); toast(`${p.lignes.length} longueur(s) reprise(s) des plans : pertes de charge et métré recalculés.`, 5000);
  };
}
function dialogueFichesMes(et) {
  let liste = [];
  try { contexteEtude = et; liste = FichesMes.fiches(et, n => Liens.calculer(et, n)); } catch (e) { return toast(`Fiches impossibles : ${e.message}`, 6000); }
  if (!liste.length) return toast('Aucun équipement à mettre en service dans les calculs de l\'étude (production, pompes, terminaux, CTA…).', 6000);
  const groupes = [...new Set(liste.map(f => f.libType))];
  const b = Modal.open(`<h2>📋 Fiches de mise en service</h2><p class="muted petit">Une fiche par équipement : points de contrôle à cocher, valeurs attendues reprises de l'étude, colonnes « Mesuré », « Écart » et « Conforme » à remplir sur place, réglages, conclusion et signatures.</p>
    <p><label class="case"><input type="checkbox" id="fm-tout" checked> Tout sélectionner (${liste.length} équipement(s))</label></p>
    <div style="max-height:50vh;overflow:auto">${groupes.map(g => `<h3>${esc(g)}</h3>${liste.map((f, i) => f.libType === g ? `<label class="case" style="display:block"><input type="checkbox" data-fm="${i}" checked> ${esc(f.titre)} <span class="muted petit">${f.mesures.filter(m => m.attendu !== null).length} valeur(s) attendue(s)</span></label>` : '').join('')}`).join('')}</div>
    <div class="actions"><button class="secondaire" id="fm-x">Fermer</button><button id="fm-pdf">Générer le PDF</button></div>`);
  b.querySelector('#fm-x').onclick = Modal.close;
  b.querySelector('#fm-tout').onchange = ev => b.querySelectorAll('[data-fm]').forEach(x => { x.checked = ev.target.checked; });
  b.querySelector('#fm-pdf').onclick = async () => {
    const choix = [...b.querySelectorAll('[data-fm]:checked')].map(x => liste[+x.dataset.fm]);
    if (!choix.length) return toast('Sélectionnez au moins un équipement.', 3000);
    b.innerHTML = `<h2>Fiches de mise en service</h2><p>Mise en page de ${choix.length} fiche(s)…</p>`;
    try {
      const bytes = await PDF.depuisHTML(pourPdf(FichesMes.html(et, choix, { societe: (S.config || {}).societe })), 'Fiches de mise en service', null, { margeHaut: 36, margeBas: 36 });
      const nom = `Fiches_MES_${String(et.objet).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 40)}.pdf`;
      b.innerHTML = `<h2>Fiches générées</h2><p><strong>${esc(nom)}</strong> — ${choix.length} fiche(s), une par page.</p><p class="petit muted">Les mêmes équipements apparaissent dans la liste des mises en service du chantier (Pipe-Fit), avec les PV préremplis des valeurs attendues.</p>
        <div class="actions"><button class="secondaire" id="f">Fermer</button><button id="dl">Télécharger le PDF</button></div>`;
      b.querySelector('#f').onclick = Modal.close; b.querySelector('#dl').onclick = () => enregistrerFichier(b, nom, bytes, 'application/pdf');
    } catch (e) { b.innerHTML = `<h2>Génération impossible</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="f">Fermer</button></div>`; b.querySelector('#f').onclick = Modal.close; }
  };
}
// Tableau de bord de l'étude : calculs en erreur, points d'attention, fiches techniques à charger, notes non émises ou
// modifiées depuis leur émission ; chaque point mène au calcul concerné
function tableauBordHtml(et) {
  if (!(et.notes || []).length) return '';
  const lib = n => `N${et.notes.indexOf(n) + 1} — ${n.titre}`, aFaire = [], fichesVues = new Set();
  let err = 0, att = 0, nonEmis = 0, modifies = 0, fiches = 0;
  et.notes.forEach(n => {
    let r; try { r = Liens.calculer(et, n); } catch (e) { r = { alertes: [{ niveau: 'erreur', texte: `Calcul impossible : ${e.message}` }] }; }
    r.alertes.filter(a => a.niveau === 'erreur').forEach(a => { err++; aFaire.push({ n, niveau: 'erreur', texte: a.texte }); });
    att += r.alertes.filter(a => a.niveau === 'attention').length;
    const d = Revisions.derniere(n);
    if (!d) nonEmis++;
    else { contexteEtude = et; if (Revisions.modifieDepuis(n, Liens.resoudre(et, n).entrees)) { modifies++; aFaire.push({ n, niveau: 'attention', texte: `Modifié depuis l'émission de l'indice ${d.indice} : à réémettre.` }); } }
    if (['pid', 'arbo', 'sanitaire'].includes(n.type) || (n.type === 'aero' && (n.entrees || {}).structure === 'arborescence')) {
      Liens.fichesInstallation(et, n).forEach(x => { const k = `${x.note}|${x.element}`; if (fichesVues.has(k)) return; fichesVues.add(k); if (!x.fiche) { fiches++; if (fiches <= 6) aFaire.push({ n, niveau: 'info', texte: `Fiche technique à charger : ${x.element} (${x.nature}).` }); } });
    }
  });
  const tuile = (v, l, c) => `<div class="tuile ${v ? c : 'ok'}"><strong>${v}</strong><span>${l}</span></div>`;
  return `<div class="carte tableau-bord"><h3 style="margin-top:0">📊 Tableau de bord de l'étude</h3>
    <div class="tuiles">${tuile(err, 'erreur(s) de calcul', 'erreur')}${tuile(att, 'point(s) d\'attention', 'attention')}${tuile(fiches, 'fiche(s) technique(s) à charger', 'attention')}${tuile(nonEmis, 'calcul(s) jamais émis', 'attention')}${tuile(modifies, 'modifié(s) depuis l\'émission', 'erreur')}</div>
    ${aFaire.length ? `<ul class="a-faire">${aFaire.slice(0, 14).map(x => `<li class="${x.niveau}"><a href="#/etude/${et.id}/${x.n.id}">${esc(lib(x.n))}</a> : ${esc(x.texte)}</li>`).join('')}${aFaire.length > 14 ? `<li class="muted">… et ${aFaire.length - 14} autre(s)</li>` : ''}</ul>` : '<p class="petit muted">✓ Rien à reprendre : calculs sans erreur, fiches chargées, notes émises à jour.</p>'}</div>`;
}
function etatEmission(et, n) {
  const d = Revisions.derniere(n);
  if (!d) return ' <span class="badge" title="Jamais émis">non émis</span>';
  contexteEtude = et;
  const modif = Revisions.modifieDepuis(n, Liens.resoudre(et, n).entrees);
  return ` <span class="badge pf" title="${esc(`Indice ${d.indice} du ${dateFr(d.date)} — ${d.statut}`)}">Ind. ${esc(d.indice)}</span>${modif ? ` <span class="badge attention" title="Données modifiées depuis l'émission de l'indice ${esc(d.indice)} : à réémettre">modifié depuis ${esc(d.indice)}</span>` : ''}`;
}
function emissionsHtml(et, n) {
  const l = n.emissions || [], d = l[l.length - 1];
  if (!d) return '<div class="carte petit">🖋️ <strong>Émissions</strong> : ce calcul n\'a pas encore été émis. « Émettre » produit le PDF avec cartouche (indice A) et fige ses données pour le suivi des modifications.</div>';
  const e = Liens.resoudre(et, n).entrees, r = Liens.calculer(et, n), schema = schemaNote(n.type, e);
  const m = Revisions.comparer(schema, d.entrees, e), mr = Revisions.comparerResultats(d.resultats, r.resume), modifCom = (n.commentaire || '') !== (d.commentaire || '');
  return `<div class="carte"><h3>🖋️ Émissions et suivi des modifications</h3>
    ${m.length || mr.length || modifCom ? `<div class="alerte attention petit">Modifié depuis l'indice ${esc(d.indice)} : ${m.length} donnée(s)${mr.length ? `, ${mr.length} résultat(s)` : ''}${modifCom ? ', commentaire' : ''} — à réémettre (indice ${esc(Revisions.prochainIndice(n))}).
      <details><summary>Voir les modifications</summary><table class="liste compact"><thead><tr><th>Donnée</th><th>Indice ${esc(d.indice)}</th><th>Maintenant</th></tr></thead>${[...m.map(x => [x.libelle, x.avant, x.apres]), ...mr.map(x => [`Résultat : ${x.libelle}`, x.avant, x.apres])].map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td><strong>${esc(c)}</strong></td></tr>`).join('')}</table></details></div>`
      : `<p class="petit ok-texte">✓ Conforme à l'indice ${esc(d.indice)} émis le ${dateFr(d.date)}.</p>`}
    ${(() => { const o = Revisions.observationsOuvertes(n); return o.length ? `<div class="alerte attention petit">📥 ${o.length} observation(s) du maître d'œuvre à lever : ${o.map(x => `<strong>${esc(x.avis)}</strong> ind. ${esc(x.indice)} : ${esc(x.texte)}`).join(' · ')}</div>` : ''; })()}
    <div class="defile-x"><table class="liste compact"><thead><tr><th>Ind.</th><th>Date</th><th>Statut</th><th>Objet de la modification</th><th>Rédigé</th><th>Vérifié</th><th>Approuvé</th><th>Modifications</th><th>Retours du maître d'œuvre</th></tr></thead>
      ${l.slice().reverse().map(x => `<tr><td><strong>${esc(x.indice)}</strong></td><td>${dateFr(x.date)}</td><td>${esc(x.statut)}</td><td>${esc(x.objet)}</td><td>${esc(x.redige)}</td><td>${esc(x.verifie)}</td><td>${esc(x.approuve)}</td>
        <td class="petit">${x.depuis ? ((x.modifs || []).length + (x.modifsResultats || []).length ? `<details><summary>${(x.modifs || []).length} donnée(s), ${(x.modifsResultats || []).length} résultat(s) depuis ${esc(x.depuis)}</summary><ul>${[...(x.modifs || []).map(y => `${y.libelle} : ${y.avant} → ${y.apres}`), ...(x.modifsResultats || []).map(y => `Résultat ${y.libelle} : ${y.avant} → ${y.apres}`)].map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : 'aucune donnée') : 'première émission'}${x.deposeLe ? `<br>📤 déposé le ${dateFr(x.deposeLe)}` : ''}${x.fichier ? `<br><a href="${urlFichierEtude(x.fichier)}" target="_blank" rel="noopener">📄 PDF émis</a>` : ''}${(x.observationsLevees || []).length ? `<br>${x.observationsLevees.length} observation(s) levée(s)` : ''}</td>
        <td class="petit">${(x.retours || []).map(rt => `<div><span class="badge ${{ VSO: 'ok', VAO: 'attention', REF: 'erreur' }[rt.avis] || ''}" title="${esc(Revisions.AVIS[rt.avis])}">${esc(rt.avis)}</span> ${dateFr(rt.date)}${rt.de ? ` — ${esc(rt.de)}` : ''}${rt.fichier ? ` <a href="${urlFichierEtude(rt.fichier)}" target="_blank" rel="noopener">📎</a>` : ''}${(rt.observations || []).map(o => `<br>${o.leveeIndice ? `✓ <s>${esc(o.texte)}</s> <span class="muted">levée ind. ${esc(o.leveeIndice)}</span>` : `• ${esc(o.texte)}`}`).join('')}</div>`).join('')}
          <button class="petit secondaire" data-retour="${esc(x.indice)}">📥 Saisir un retour</button></td></tr>`).join('')}</table></div>
    <div class="actions-ligne"><button class="secondaire petit" id="comparer-indices">⚖️ Comparer deux indices</button><button class="secondaire petit" id="diffuser-note">📨 Diffuser ce calcul</button></div></div>`;
}

// Calcul rapide : saisie conservée dans l'onglet, versement dans une étude
const cleRapide = type => `etudes-rapide-${type}`;
const entreesRapide = type => { try { const j = JSON.parse(sessionStorage.getItem(cleRapide(type))); if (j) return completer(type, j); } catch (e) { /* stockage indisponible */ } return Notes.defauts(type); };
const memoRapide = (type, e) => { try { sessionStorage.setItem(cleRapide(type), JSON.stringify(e)); } catch (er) { /* stockage indisponible */ } };
Vues.rapide = {
  html: ([type]) => {
    const t = Notes.TYPES[type];
    contexteEtude = null;
    if (!t) return '<p class="erreur">Calcul inconnu.</p>';
    return `<div class="barre"><a href="#/" class="secondaire btn petit">← Accueil</a><span class="ico-titre">${t.icone}</span><h1>${esc(t.titre)}</h1><span class="espace"></span>
      <button class="secondaire" id="defauts">Valeurs par défaut</button><button class="secondaire" id="pdf">📄 PDF</button><button id="verser">Enregistrer dans une étude…</button></div>
      <p class="muted petit">${esc(t.description)}</p>${calculateurHtml(type, entreesRapide(type))}`;
  },
  bind: (root, [type]) => {
    if (!Notes.TYPES[type]) return;
    contexteEtude = null;
    const e = entreesRapide(type);
    lierCalculateur(root, type, e, redessin => { memoRapide(type, e); if (redessin) avecFocus(App.render); });
    root.querySelector('#defauts').onclick = () => { memoRapide(type, Notes.defauts(type)); App.render(); };
    root.querySelector('#pdf').onclick = () => genererNoteCalcul({ objet: Notes.TYPES[type].titre, affaireId: '', client: '', indice: 'A', date: aujourdhui(), auteur: S.me.nom || S.me.login, verificateur: '', description: '', historique: [], notes: [nouvelleNote(type, e)] });
    root.querySelector('#verser').onclick = () => {
      const b = Modal.open(`<h2>Enregistrer le calcul dans une étude</h2><label>Étude<select id="dest"><option value="">+ Nouvelle étude…</option>${S.etudes.map(x => `<option value="${esc(x.id)}">${esc(x.objet)}${x.affaireId ? ` — ${esc((affaireDe(x.affaireId) || {}).code || '')}` : ''}</option>`).join('')}</select></label>
        <div class="actions"><button class="secondaire" id="annuler">Annuler</button><button id="ok">Enregistrer</button></div>`);
      b.querySelector('#annuler').onclick = Modal.close;
      b.querySelector('#ok').onclick = () => {
        const dest = etudeDe(b.querySelector('#dest').value);
        if (!dest) return dialogueNouvelleEtude('', et => et.notes.push(nouvelleNote(type, e)));
        const n = nouvelleNote(type, e); dest.notes.push(n); enregistrer(dest); Modal.close(); location.hash = `#/etude/${dest.id}/${n.id}`;
      };
    };
  },
};

// Tableaux de référence : séries de tubes, ζ, isolants, vapeur saturée, fluides
Vues.reference = {
  html: () => {
    const f = (v, d) => Notes.nf(v, d);
    return `<h1>Données de référence</h1><p class="muted">Valeurs de pré-dimensionnement utilisées par les calculs. Les fiches des fabricants et les normes matériaux font foi pour l'exécution.</p>
      <h2>Séries de tubes</h2><div class="types">${Object.entries(Donnees.SERIES).map(([k, s]) => `<details class="carte"><summary><strong>${esc(s.libelle)}</strong> <span class="muted petit">rugosité ${f(s.rugosite, 3)} mm</span></summary>
        <table class="liste compact"><thead><tr><th>Tube</th><th>De (mm)</th><th>e (mm)</th><th>Di (mm)</th><th>Section (cm²)</th><th>Eau (L/m)</th></tr></thead><tbody>${Calculs.tubes(k).map(t => `<tr><td>${esc(t.nom)}</td><td>${f(t.de, 1)}</td><td>${f(t.ep, 2)}</td><td>${f(t.di, 1)}</td><td>${f(Math.PI * t.di ** 2 / 400, 2)}</td><td>${f(Math.PI * t.di ** 2 / 4e3, 3)}</td></tr>`).join('')}</tbody></table></details>`).join('')}</div>
      <h2>Coefficients de pertes de charge singulières ζ</h2><div class="deux-col"><table class="liste compact"><thead><tr><th>Hydraulique</th><th>ζ</th></tr></thead><tbody>${Donnees.SINGULARITES.map(([, l, z]) => `<tr><td>${esc(l)}</td><td>${f(z, 2)}</td></tr>`).join('')}</tbody></table>
        <table class="liste compact"><thead><tr><th>Aéraulique</th><th>ζ</th></tr></thead><tbody>${Donnees.SINGULARITES_AIR.map(([, l, z]) => `<tr><td>${esc(l)}</td><td>${f(z, 2)}</td></tr>`).join('')}</tbody></table></div>
      <h2>Fluides caloporteurs à 20 °C</h2><table class="liste compact"><thead><tr><th>Fluide</th><th>Congélation (°C)</th><th>ρ (kg/m³)</th><th>cp (kJ/kg·K)</th><th>μ (mPa·s)</th></tr></thead><tbody>
        ${[['eau', 'Eau'], ...Object.entries(Donnees.GLYCOLS).map(([k, g]) => [k, g.libelle])].map(([k, l]) => { const p = Calculs.liquide(k, 20); return `<tr><td>${esc(l)}</td><td>${f(p.gel, 1)}</td><td>${f(p.rho, 1)}</td><td>${f(p.cp / 1000, 3)}</td><td>${f(p.mu * 1000, 2)}</td></tr>`; }).join('')}</tbody></table>
      <h2>Vapeur d'eau saturée</h2><table class="liste compact"><thead><tr><th>p (bar abs)</th><th>p (bar rel)</th><th>T (°C)</th><th>v'' (m³/kg)</th><th>h' (kJ/kg)</th><th>r (kJ/kg)</th><th>h'' (kJ/kg)</th></tr></thead><tbody>
        ${Donnees.VAPEUR.map(([p, T, v, h, r]) => `<tr><td>${f(p, 1)}</td><td>${f(p - 1.013, 2)}</td><td>${f(T, 1)}</td><td>${f(v, 4)}</td><td>${f(h, 1)}</td><td>${f(r, 1)}</td><td>${f(h + r, 1)}</td></tr>`).join('')}</tbody></table>
      <h2>Isolants</h2><table class="liste compact"><thead><tr><th>Isolant</th><th>λ à 10 °C (W/m·K)</th><th>Domaine d'emploi (°C)</th><th>Épaisseurs (mm)</th></tr></thead><tbody>
        ${Object.values(Donnees.ISOLANTS).map(i => `<tr><td>${esc(i.libelle)}</td><td>${f(i.lambda10, 3)}</td><td>${i.tmin} à ${i.tmax}</td><td>${i.epaisseurs.join(', ')}</td></tr>`).join('')}</tbody></table>
      <h2>Matériaux</h2><table class="liste compact"><thead><tr><th>Matériau</th><th>ρ (kg/m³)</th><th>E (MPa)</th><th>α (10⁻⁶ /K)</th></tr></thead><tbody>
        ${Object.values(Donnees.MATERIAUX).map(m => `<tr><td>${esc(m.libelle)}</td><td>${f(m.rho, 0)}</td><td>${f(m.E, 0)}</td><td>${f(m.alpha * 1e6, 1)}</td></tr>`).join('')}</tbody></table>`;
  },
};

/* ---------- Réglages ---------- */
const ecrireChemin = (o, chemin, v) => { const k = chemin.split('.'); k.slice(0, -1).reduce((a, x) => (a[x] = a[x] || {}), o)[k[k.length - 1]] = v; };
Vues.reglages = {
  html: () => { const c = S.config, admin = S.me.role === 'admin', dis = admin ? '' : 'disabled';
    return `<h1>Réglages</h1>${admin ? '' : '<p class="muted">Réservé à l\'administrateur.</p>'}
    <div class="carte"><h2>Entreprise (en-tête des notes de calcul)</h2><div class="grille-champs">${[['raison', 'Raison sociale'], ['activite', 'Activité'], ['adresse', 'Adresse'], ['tel', 'Téléphone'], ['siret', 'SIRET'], ['email', 'E-mail']]
      .map(([k, l]) => `<label>${l}<input data-cfg="societe.${k}" value="${esc(c.societe[k])}" ${dis}></label>`).join('')}
      <label>Couleur de la charte<input data-cfg="couleur" type="color" value="${esc(c.couleur)}" ${dis}></label></div></div>
    <div class="carte"><h2>Fluides caloporteurs (fiches fabricants)</h2>
      <p class="muted petit">Les mélanges glycolés de référence sont des valeurs moyennes. Importer la fiche du fabricant du fluide installé (une ligne par température, au moins deux) : le fluide apparaît dans les listes de tous les calculs.</p>
      <div class="actions-ligne"><span class="badge ${(c.fluides || []).length ? 'ok' : ''}">${(c.fluides || []).length ? `${c.fluides.length} fluide(s) importé(s) : ${esc(c.fluides.map(f => f.libelle.replace(' (fiche fabricant)', '')).join(', '))}` : 'aucune fiche importée'}</span>
        <button class="secondaire petit" id="fl-modele">Modèle CSV</button>${admin ? `<button class="petit" id="fl-import">Importer un CSV…</button>${(c.fluides || []).length ? '<button class="secondaire petit" id="fl-vider">Retirer les fiches</button>' : ''}` : ''}</div></div>
    <div class="carte"><h2>Réglementation (onglet du schéma de principe)</h2>
      <p class="muted petit">La synthèse réglementaire est indicative tant qu'elle n'a pas été relue. Le visa (relecteur, date, validité) et les exigences complémentaires de l'entreprise figurent dans l'onglet et dans les notes de calcul.</p>
      <div class="grille-champs"><label>Relue par<input id="rg-qui" value="${esc((c.reglementation || {}).relecteur || S.me.nom || '')}" ${dis}></label>
        <label>Le<input type="date" id="rg-date" value="${esc((c.reglementation || {}).date || aujourdhui())}" ${dis}></label>
        <label>Valable jusqu'au<input type="date" id="rg-val" value="${esc((c.reglementation || {}).validite || '')}" ${dis}></label>
        <label class="large">Exigences complémentaires de l'entreprise (une par ligne)<textarea id="rg-comp" rows="3" ${dis}>${esc((c.reglementation || {}).complements || '')}</textarea></label></div>
      <div class="actions-ligne">${(c.reglementation || {}).date ? `<span class="badge ok">Visée le ${dateFr(c.reglementation.date)}</span>` : '<span class="badge">Non visée</span>'}${admin ? '<button class="petit" id="rg-viser">Enregistrer le visa</button>' : ''}</div></div>
    <div class="carte" id="metre-ratios"><h2>Métré et chiffrage : ratios</h2>
      <p class="muted petit">Heures de pose utilisées par le métré des études (avant les coefficients de calage). Pour les tubes et le calorifuge : heures par mètre = a + b × DN. Les coefficients de calage multiplient les heures de chaque main-d'œuvre ; ils se calculent sur les chantiers terminés de Pipe-Fit (heures pointées face aux heures prévues aux devis).</p>
      ${(() => { const r = Metre.ratios(), inp = (ch, v, pas = '0.001', st = '') => `<input type="number" min="0" step="${pas}" data-mr="${ch}" value="${v}" ${st ? `style="${st}"` : ''} ${dis}>`;
        const MAT = { acier: 'Acier soudé', galva: 'Acier galvanisé', inox: 'Inox', cuivre: 'Cuivre', pehd: 'PEHD', multicouche: 'Multicouche' };
        return `<div class="deux-col"><table class="liste compact"><thead><tr><th>Tuyauterie (h/ml)</th><th>a</th><th>b (par DN)</th></tr></thead><tbody>
          ${Object.entries(MAT).map(([k, l]) => `<tr><td>${l}</td><td>${inp(`tube.${k}.0`, r.tube[k][0])}</td><td>${inp(`tube.${k}.1`, r.tube[k][1], '0.0001')}</td></tr>`).join('')}
          <tr><td>Calorifuge</td><td>${inp('calorifuge.0', r.calorifuge[0])}</td><td>${inp('calorifuge.1', r.calorifuge[1], '0.0001')}</td></tr>
          <tr><td>Études (forfait + par note)</td><td>${inp('be.0', r.be[0], '0.5')}</td><td>${inp('be.1', r.be[1], '0.5')}</td></tr></tbody></table>
          <table class="liste compact"><thead><tr><th>Équipement (h/u)</th><th>Heures</th></tr></thead><tbody>
          ${Object.entries(Metre.LIBELLES_EQUIP).map(([k, l]) => `<tr><td>${esc(l)}</td><td>${Array.isArray(r.equip[k]) ? `<span style="white-space:nowrap">${inp(`equip.${k}.0`, r.equip[k][0], '0.001', 'width:6em;display:inline-block')} + ${inp(`equip.${k}.1`, r.equip[k][1], '0.0001', 'width:6em;display:inline-block')} × DN</span>` : inp(`equip.${k}`, r.equip[k], '0.05')}</td></tr>`).join('')}</tbody></table></div>
          <div class="grille-champs"><label>Gaine (h/ml)${inp('gaine', r.gaine, '0.05')}</label><label>Coudes par mètre de tube${inp('coudesParMl', r.coudesParMl, '0.05')}</label>
            <label>Supports par mètre de tube${inp('supportsParMl', r.supportsParMl, '0.05')}</label><label>Chutes sur les tubes (%)${inp('chute', r.chute, '0.5')}</label></div>
          <h3>Coefficients de calage</h3><div class="grille-champs">${[['monteur', 'Monteurs, tuyauteurs, soudeurs'], ['calorifugeur', 'Calorifugeurs'], ['be', 'Bureau d\'études']].map(([k, l]) => `<label>${l}${inp(`coefs.${k}`, r.coefs[k], '0.01')}</label>`).join('')}</div>
          <div class="actions-ligne">${(S.config.metre || {}).calage ? `<span class="badge ok">Calé le ${dateFr(S.config.metre.calage.date)} sur ${S.config.metre.calage.n} chantier(s)</span>` : '<span class="badge">Coefficients non calés</span>'}
          ${admin ? '<button class="petit" id="mr-enreg">Enregistrer les ratios</button><button class="secondaire petit" id="mr-rex">Caler sur le REX Pipe-Fit…</button><button class="secondaire petit" id="mr-defaut">Valeurs par défaut</button>' : ''}</div>`; })()}</div>
    <div class="carte"><h2>Lecture des CCTP et DPGF : corrections retenues</h2>
      <p class="muted petit">Quand un genre est corrigé, une ligne écartée ou la nature d'un réseau changée dans l'inventaire d'une étude, la correction est retenue et appliquée aux dossiers suivants (même désignation, sans les dimensions). Supprimez une règle qui ne convient plus.</p>
      <div id="regles-inv" class="petit muted">Chargement…</div></div>
    <div class="carte"><h2>Catalogues de pompes et de vannes</h2>
      <p class="muted petit">Les calculs proposent un modèle d'après le point de fonctionnement. Sans catalogue importé, une gamme générique d'exemple est utilisée (ordres de grandeur, aucune marque). Import au format CSV (séparateur « ; »).</p>
      ${['pompes', 'vannes', 'materiel'].map(g => { const cat = (c.catalogues || {})[g] || []; return `<div class="actions-ligne"><strong>${{ pompes: 'Pompes', vannes: 'Vannes de régulation', materiel: 'Matériel des fabricants (bouches, CTA, caissons, générateurs, PAC…) — CSV ou Excel, proposé dans « Matériel retenu »' }[g]}</strong>
        <span class="badge ${cat.length ? 'ok' : ''}">${cat.length ? `${cat.length} modèle(s) importé(s)${g === 'materiel' ? ` (${[...new Set(cat.map(x => x.fabricant))].slice(0, 6).join(', ')})` : ''}` : g === 'materiel' ? 'aucun catalogue' : 'gamme générique'}</span>
        <button class="secondaire petit" data-csv-modele="${g}">Modèle CSV</button>${admin ? `<button class="petit" data-csv-import="${g}">Importer un CSV…</button>${cat.length ? `<button class="secondaire petit" data-csv-vider="${g}">Revenir à la gamme générique</button>` : ''}` : ''}${g === 'materiel' && admin ? '<button class="secondaire petit" id="cat-biblio" title="Modèles des fiches techniques de la bibliothèque Pipe-Fit : débit, puissances, puissance électrique, niveau sonore, volume, pression lus dans les PDF">📚 Compléter depuis les fiches de Pipe-Fit</button>' : ''}${g === 'materiel' && cat.some(x => x.fiche) ? `<button class="secondaire petit" id="cat-fiches" title="Les PDF des liens « fiche » du catalogue sont téléchargés par Pipe-Fit et gardés dans sa bibliothèque des fiches techniques">📥 Fiches dans la bibliothèque Pipe-Fit (${new Set(cat.filter(x => x.fiche).map(x => x.fiche)).size})</button>` : ''}</div>`; }).join('')}</div>`; },
  bind: root => {
    // Catalogue matériel complété par les fiches techniques de Pipe-Fit (modèles absents seulement)
    const cb = root.querySelector('#cat-biblio');
    if (cb) cb.onclick = async () => {
      try {
        const l = await api('GET', '/api/pf/fiches/catalogue-lignes'), cat = ((S.config.catalogues || {}).materiel || []).slice(), cle = p => `${String(p.fabricant).toLowerCase()}|${String(p.reference).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const deja = new Set(cat.map(cle)), nouveaux = l.filter(p => !deja.has(cle(p))).map(({ ficheId: _, ...p }) => p);
        if (!nouveaux.length) return toast('Le catalogue contient déjà tous les modèles des fiches de Pipe-Fit.');
        if (!await confirmer(`${nouveaux.length} modèle(s) à ajouter au catalogue matériel, avec les caractéristiques lues dans leurs fiches (à vérifier : débit maxi, puissances, niveau sonore). Ajouter ?`, 'Ajouter')) return;
        S.config = await api('PUT', '/api/config', { ...S.config, catalogues: { ...(S.config.catalogues || {}), materiel: [...cat, ...nouveaux] } }); Catalogue.utiliser(S.config.catalogues); App.render();
        toast(`${nouveaux.length} modèle(s) ajouté(s) au catalogue matériel.`);
      } catch (e) { toast(e.message, 6000); }
    };
    // Liens « fiche » du catalogue matériel : PDF téléchargés et gardés dans la bibliothèque de Pipe-Fit
    const cf = root.querySelector('#cat-fiches');
    if (cf) cf.onclick = async () => {
      const cat = ((S.config.catalogues || {}).materiel || []).filter(x => x.fiche);
      try { const r = await api('POST', '/api/pf/fiches/catalogue', { lignes: cat.map(x => ({ fabricant: x.fabricant, reference: x.reference, designation: x.designation, url: x.fiche })) }); toast(`${r.total} fiche(s) en cours de téléchargement par Pipe-Fit (Bibliothèque → Fiches techniques : liens cassés signalés).`, 7000); }
      catch (e) { toast(e.message, 6000); }
    };
    // Corrections retenues de l'inventaire CCTP / DPGF (règles partagées)
    const zr = root.querySelector('#regles-inv');
    const rendreRegles = l => {
      if (!zr) return;
      const G = InventaireCVC.GENRES, N = InventaireCVC.NATURE;
      zr.innerHTML = l.length ? `<div class="defile-x"><table class="liste compact"><thead><tr><th>Désignation (exemple)</th><th>Correction</th><th>Le</th><th></th></tr></thead><tbody>${l.map((r, k) => `<tr><td>${esc(r.exemple || r.cle)}</td><td>${r.objet === 'reseau' ? `réseau : ${esc((N[r.nature] || {}).libelle || r.nature)}` : [r.genre && `genre : ${esc((G[r.genre] || {}).libelle || r.genre)}`, r.inclus === false && 'écartée'].filter(Boolean).join(', ')}</td><td>${esc(dateFr(r.date || ''))}</td><td><button class="icone" data-regle="${k}" title="Supprimer">✕</button></td></tr>`).join('')}</tbody></table></div>`
        : 'Aucune correction retenue pour l\'instant.';
      zr.querySelectorAll('[data-regle]').forEach(x => x.onclick = async () => { const n = l.filter((_, k) => k !== +x.dataset.regle); try { rendreRegles(await api('PUT', '/api/regles-inventaire', n)); } catch (e) { toast(e.message); } });
    };
    if (zr) api('GET', '/api/regles-inventaire').then(rendreRegles).catch(() => { zr.textContent = 'Indisponible.'; });
    root.querySelectorAll('[data-cfg]').forEach(el => el.onchange = async () => { const c = copie(S.config); ecrireChemin(c, el.dataset.cfg, el.value); S.config = await api('PUT', '/api/config', c); toast('Réglages enregistrés'); });
    const majConfig = async c => { S.config = await api('PUT', '/api/config', c); Catalogue.utiliser(S.config.catalogues); Calculs.utiliserFluides(S.config.fluides); Schema.utiliserReglementation(S.config.reglementation); Metre.utiliser(S.config.metre); App.render(); };
    const fichierTexte = (accept, suite) => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const brut = new Uint8Array(await f.arrayBuffer()); let t = new TextDecoder('utf-8').decode(brut); if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(brut); suite(t); }; inp.click(); };
    const flm = root.querySelector('#fl-modele');
    if (flm) flm.onclick = () => Promise.resolve(telecharger('fluides-caloporteurs.csv', new TextEncoder().encode('fluide;concentration_%;T_C;rho_kg_m3;cp_kJ_kgK;mu_mPa_s;gel_C\nNom du fluide (exemple de format, valeurs à remplacer par la fiche);30;0;1000;3,8;5;-15\nNom du fluide (exemple de format, valeurs à remplacer par la fiche);30;80;980;3,9;0,8;-15\n'), 'text/csv')).catch(e => toast(e.message, 6000));
    const fli = root.querySelector('#fl-import');
    if (fli) fli.onclick = () => fichierTexte('.csv,text/csv,text/plain', async t => {
      const { liste, rejets, incomplets } = Calculs.lireFluidesCsv(t);
      if (!liste.length) return toast('Aucun fluide valide : au moins deux températures par fluide (voir « Modèle CSV »).', 6000);
      const autres = (S.config.fluides || []).filter(f => !liste.some(x => x.cle === f.cle));
      await majConfig({ ...S.config, fluides: [...autres, ...liste] });
      toast(`${liste.length} fluide(s) importé(s)${rejets.length ? `, lignes ignorées : ${rejets.slice(0, 8).join(', ')}` : ''}${incomplets.length ? `, incomplets : ${incomplets.join(', ')}` : ''}`, 6000);
    });
    const flv = root.querySelector('#fl-vider');
    if (flv) flv.onclick = async () => { if (await confirmer('Retirer les fiches de fluides importées ? Les calculs qui les utilisent reviendront à l\'eau.', 'Retirer')) await majConfig({ ...S.config, fluides: [] }); };
    const rgv = root.querySelector('#rg-viser');
    if (rgv) rgv.onclick = async () => {
      const v = { relecteur: root.querySelector('#rg-qui').value.trim(), date: root.querySelector('#rg-date').value, validite: root.querySelector('#rg-val').value, complements: root.querySelector('#rg-comp').value };
      if (!v.relecteur || !v.date) return toast('Indiquer le relecteur et la date de relecture.');
      await majConfig({ ...S.config, reglementation: v }); toast('Visa de la synthèse réglementaire enregistré');
    };
    const lireRatios = () => { const r = copie(Metre.ratios()); root.querySelectorAll('[data-mr]').forEach(el => { const k = el.dataset.mr.split('.'), v = parseFloat(el.value); if (!Number.isFinite(v) || v < 0) return; k.slice(0, -1).reduce((o, x) => o[x], r)[k[k.length - 1]] = v; }); return r; };
    const enregistrerMetre = async (m, msg) => { await majConfig({ ...S.config, metre: m }); toast(msg); };
    const mre = root.querySelector('#mr-enreg');
    if (mre) mre.onclick = () => enregistrerMetre({ ...lireRatios(), calage: (S.config.metre || {}).calage || null }, 'Ratios du métré enregistrés');
    const mrd = root.querySelector('#mr-defaut');
    if (mrd) mrd.onclick = async () => { if (await confirmer('Revenir aux ratios et coefficients par défaut ?', 'Revenir')) await enregistrerMetre({}, 'Ratios par défaut rétablis'); };
    const mrr = root.querySelector('#mr-rex');
    if (mrr) mrr.onclick = async () => {
      let rex;
      try { rex = await api('GET', '/api/pf/rex'); } catch (e) { return toast(`REX Pipe-Fit indisponible : ${e.message}`, 6000); }
      if (!rex.affaires.length) return toast('Aucun chantier terminé avec des heures prévues au devis et des heures pointées dans Pipe-Fit.', 6000);
      const b = Modal.open(`<h2>Calage sur le retour d'expérience</h2><p class="muted petit">Chantiers terminés de Pipe-Fit : heures prévues aux devis acceptés et heures pointées. Décocher les chantiers atypiques (aléas, travaux supplémentaires).</p>
        <table class="liste compact"><thead><tr><th></th><th>Chantier</th><th>Prévues (h)</th><th>Pointées (h)</th><th>Écart</th></tr></thead><tbody>${rex.affaires.map(a => `<tr><td><input type="checkbox" data-rex="${esc(a.id)}" checked></td><td>${esc(`${a.code} — ${a.nom}`)}</td><td>${Notes.nf(a.prevues, 0)}</td><td>${Notes.nf(a.passees, 0)}</td><td>${a.passees >= a.prevues ? '+' : ''}${Notes.nf((a.passees / a.prevues - 1) * 100, 0)} %</td></tr>`).join('')}</tbody></table>
        <div id="rex-res"></div><div class="actions"><button class="secondaire" data-fermer>Annuler</button><button id="rex-ok">Appliquer les coefficients</button></div>`);
      const calc = () => { const ids = [...b.querySelectorAll('[data-rex]:checked')].map(x => x.dataset.rex), c = Metre.calage(rex, ids), noms = { monteur: 'Monteurs, tuyauteurs, soudeurs', calorifugeur: 'Calorifugeurs', be: 'Bureau d\'études' };
        b.querySelector('#rex-res').innerHTML = `<table class="liste compact"><thead><tr><th>Main-d'œuvre</th><th>Prévues (h)</th><th>Pointées (h)</th><th>Coefficient</th></tr></thead><tbody>${Object.entries(c.groupes).map(([k, g]) => `<tr><td>${noms[k]}</td><td>${Notes.nf(g.prevues, 0)}</td><td>${Notes.nf(g.passees, 0)}</td><td><strong>${c.coefs[k] === null ? 'inchangé' : Notes.nf(c.coefs[k], 2)}</strong></td></tr>`).join('')}</tbody></table>
          <p class="muted petit">Coefficient = heures pointées / heures prévues, borné entre 0,3 et 3 ; « inchangé » faute de données.</p>`; return { ids, c }; };
      calc(); b.querySelectorAll('[data-rex]').forEach(x => x.onchange = calc);
      b.querySelector('[data-fermer]').onclick = () => Modal.close();
      b.querySelector('#rex-ok').onclick = async () => { const { ids, c } = calc(); if (!ids.length) return toast('Cocher au moins un chantier.');
        const r = lireRatios(); Object.entries(c.coefs).forEach(([k, v]) => { if (v !== null) r.coefs[k] = v; });
        Modal.close(); await enregistrerMetre({ ...r, calage: { date: aujourdhui(), n: ids.length, affaires: ids } }, 'Coefficients calés sur le REX Pipe-Fit'); };
    };
    const enregistrerCatalogue = async (genre, liste) => {
      const cat = { ...(S.config.catalogues || {}), [genre]: liste };
      S.config = await api('PUT', '/api/config', { ...S.config, catalogues: cat }); Catalogue.utiliser(S.config.catalogues); App.render();
    };
    root.querySelectorAll('[data-csv-modele]').forEach(b => b.onclick = () => Promise.resolve(telecharger(`catalogue-${b.dataset.csvModele}.csv`, new TextEncoder().encode(b.dataset.csvModele === 'materiel' ? `\uFEFF${CatalogueMateriel.modeleCsv()}` : Catalogue.modeleCsv(b.dataset.csvModele)), 'text/csv')).catch(e => toast(e.message, 6000)));
    root.querySelectorAll('[data-csv-vider]').forEach(b => b.onclick = async () => { if (await confirmer('Revenir à la gamme générique pour ce catalogue ?', 'Revenir')) { await enregistrerCatalogue(b.dataset.csvVider, []); toast('Gamme générique rétablie'); } });
    root.querySelectorAll('[data-csv-import]').forEach(b => b.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = b.dataset.csvImport === 'materiel' ? '.csv,.xlsx,text/csv' : '.csv,text/csv,text/plain';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        // Catalogue matériel : CSV ou classeur Excel (première feuille la plus remplie), colonnes reconnues par leur en-tête
        if (b.dataset.csvImport === 'materiel') {
          try {
            const buf = await f.arrayBuffer(), feuilles = /\.xlsx$/i.test(f.name) ? await XLSX.read(buf) : XLSX.readCSV(buf);
            const { liste, rejets } = CatalogueMateriel.lireLignes(feuilles.sort((x, y) => y.rows.length - x.rows.length)[0].rows);
            if (!liste.length) return toast('Aucune ligne valide : il faut au moins le fabricant et la référence (bouton « Modèle CSV »).', 7000);
            await enregistrerCatalogue('materiel', liste);
            toast(`${liste.length} modèle(s) importé(s)${rejets.length ? `, lignes ignorées : ${rejets.slice(0, 8).join(', ')}` : ''}`, 6000);
          } catch (e) { toast(e.message, 6000); }
          return;
        }
        const brut = new Uint8Array(await f.arrayBuffer());
        let texte = new TextDecoder('utf-8').decode(brut);
        if (texte.includes('\uFFFD')) texte = new TextDecoder('windows-1252').decode(brut); // export Excel
        const { liste, rejets } = Catalogue.lireCsv(texte, b.dataset.csvImport);
        if (!liste.length) return toast('Aucune ligne valide : vérifier le format (bouton « Modèle CSV »).', 6000);
        await enregistrerCatalogue(b.dataset.csvImport, liste);
        toast(`${liste.length} modèle(s) importé(s)${rejets.length ? `, lignes ignorées : ${rejets.slice(0, 8).join(', ')}` : ''}`, 6000);
      };
      inp.click();
    });
  },
};

/* ---------- Démarrage ---------- */
async function demarrer() {
  try { S.me = await api('GET', '/api/me'); } catch (e) { return ecranConnexion(e.status === 401 ? '' : e.message); }
  document.body.classList.remove('deconnecte');
  document.getElementById('qui').textContent = S.me.nom || S.me.login;
  document.getElementById('deconnexion').onclick = async () => { await api('POST', '/api/logout', {}).catch(() => {}); location.reload(); };
  const pf = S.me.pipefit || (/^https?:$/.test(location.protocol) ? `${location.protocol}//${location.hostname}:3000` : '');
  if (pf) { const a = document.getElementById('lien-pf'); a.href = pf; a.hidden = false; }
  document.getElementById('app').innerHTML = '<p class="muted">Chargement…</p>';
  try { [S.config, S.etudes] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/etudes')]); }
  catch (e) { document.getElementById('app').innerHTML = `<p class="erreur">${esc(e.message)}</p>`; return; }
  // Les affaires Pipe-Fit sont facultatives : l'application reste utilisable si Pipe-Fit ne répond pas
  try { S.pf = await api('GET', '/api/pf/affaires'); } catch (e) { toast(`Affaires Pipe-Fit indisponibles : ${e.message}`, 5000); }
  S.etudes.forEach(et => { et.notes = et.notes || []; et.historique = et.historique || []; });
  Catalogue.utiliser(S.config.catalogues); Calculs.utiliserFluides(S.config.fluides); Schema.utiliserReglementation(S.config.reglementation); Metre.utiliser(S.config.metre);
  App.render();
  window.addEventListener('hashchange', () => { Modal.close(); App.render(); });
}
document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
demarrer();
