// Pipe-Fit Études : études du bureau d'études fluides (une étude = un objet, une affaire Pipe-Fit, un indice et ses notes
// de calcul), calculateurs (saisie à gauche, résultats recalculés à chaque frappe), calculs rapides sans enregistrement,
// tableaux de référence et note de calcul en PDF.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = iso => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : '');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const uidE = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
const copie = o => JSON.parse(JSON.stringify(o));
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
function resumePF(et) {
  const notes = (et.notes || []).map(n => {
    let al = [];
    try { al = Liens.calculer(et, n).alertes || []; } catch (e) { al = [{ niveau: 'erreur' }]; }
    return { titre: n.titre || (Notes.TYPES[n.type] || {}).titre || n.type, type: n.type, erreurs: al.filter(a => a.niveau === 'erreur').length, attention: al.filter(a => a.niveau === 'attention').length };
  });
  let equipements = [];
  try { equipements = Metre.metre(et).filter(p => p.unite === 'u' && p.chapitre !== 'Études').slice(0, 150).map(p => ({ chapitre: p.chapitre, designation: p.designation, qte: p.qte, sources: p.sources })); } catch (e) { equipements = []; }
  return { objet: et.objet, client: et.client || '', clientId: et.clientId || '', devisId: et.devisId || '', indice: et.indice, date: et.date, auteur: et.auteur || '', verificateur: et.verificateur || '', description: String(et.description || '').slice(0, 500),
    notes, erreurs: notes.reduce((s, n) => s + n.erreurs, 0), attention: notes.reduce((s, n) => s + n.attention, 0), equipements, devis: (et.devisPF || []).slice(-10) };
}
const corpsEtude = et => { let resume; try { resume = et.modele ? undefined : resumePF(et); } catch (e) { resume = undefined; } return { data: et, version: et._v, resume }; };
// Enregistrement différé (une requête à la fois par étude, contrôle de version)
function enregistrer(etude) {
  if (!S.etudes.includes(etude)) S.etudes.unshift(etude);
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
const optionsDe = (c, e) => (typeof c.o === 'function' ? c.o(e, contexteEtude) : c.o);
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
function formulaireHtml(type, e, v = {}) {
  return rubriques(type, e).map(r => `<fieldset>${r.titre ? `<legend>${esc(r.titre)}</legend>` : ''}<div class="grille-champs">${r.champs.map(c => {
    if (c.t === 'lignes') {
      const lignes = e[c.k] || [], cols = colonnesDe(c, e);
      return `<div class="large"><div class="petit muted">${esc(c.l)}</div><div class="defile-x"><table class="edit"><thead><tr>${cols.map(col => `<th>${esc(col.l)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${lignes.map((l, i) => `<tr>${cols.map(col => `<td>${col.t === 's' ? `<select data-l="${c.k}.${i}.${col.k}"${verrou(v, `${c.k}.${i}.${col.k}`)}>${optionsHtml(optionsDe(col, e), l[col.k])}</select>`
          : `<input data-l="${c.k}.${i}.${col.k}" value="${esc(valeurChamp(l[col.k]))}" ${col.t === 't' ? '' : 'inputmode="decimal" class="nombre"'}${verrou(v, `${c.k}.${i}.${col.k}`)}>`}</td>`).join('')}
          <td><button class="icone" data-suppr-ligne="${c.k}.${i}" title="Supprimer la ligne">✕</button></td></tr>`).join('')}</tbody></table></div>
        <button class="secondaire petit" data-ajout-ligne="${c.k}">+ Ajouter une ligne</button></div>`;
    }
    const lib = `<span>${esc(c.l)}${c.u ? ` <span class="unite">(${esc(c.u)})</span>` : ''}</span>`;
    if (c.t === 's') return `<label>${lib}<select data-k="${c.k}"${verrou(v, c.k)}>${optionsHtml(optionsDe(c, e), e[c.k])}</select></label>`;
    return `<label>${lib}<input data-k="${c.k}" value="${esc(valeurChamp(e[c.k]))}" ${c.t === 't' ? '' : 'inputmode="decimal" class="nombre"'}${verrou(v, c.k)}></label>`;
  }).join('')}</div></fieldset>`).join('');
}
// Onglets complémentaires d'un calcul (réglementation, régulation…) : blocs d'exigences, listes, tableaux, textes
let ongletActif = 'Résultats';
const NIVEAUX = { obligatoire: 'Obligatoire', conseil: 'Conseillé', info: 'Information' };
const blocsHtml = blocs => blocs.map(b => `${b.titre ? `<h3>${esc(b.titre)}</h3>` : ''}
  ${b.items ? `<ul class="exigences">${b.items.map(i => `<li class="${i.niveau}"><span class="badge ${i.niveau}">${NIVEAUX[i.niveau] || i.niveau}</span> ${esc(i.texte)}${i.ref ? ` <span class="ref">${esc(i.ref)}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${b.liste ? `<ul class="af">${b.liste.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  ${b.tableau ? `<div class="defile-x"><table class="liste compact"><thead><tr>${b.tableau.entetes.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.tableau.lignes.map((l, i) => `<tr class="${b.tableau.total && i === b.tableau.lignes.length - 1 ? 'total' : ''}">${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
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
const schemaHtml = r => (r.schema ? `<div class="barre"><h2>Schéma de principe</h2><span class="espace"></span><button class="secondaire petit" data-dl-schema>Télécharger (SVG)</button><button class="secondaire petit" data-dl-dxf>Télécharger pour AutoCAD (DXF)</button></div><div class="schema">${r.schema}</div>` : '');
// ctx : entrées effectives (avec les valeurs reprises d'autres notes) et calcul ; par défaut, la saisie seule
const ctxSimple = (type, e) => ({ effectives: () => ({ entrees: e, verrous: {} }), calcul: () => Notes.calculer(type, e) });
const ctxEtude = (et, n) => ({ effectives: () => Liens.resoudre(et, n), calcul: () => Liens.calculer(et, n) });
function calculateurHtml(type, e, ctx = ctxSimple(type, e)) {
  const r = ctx.calcul(), eff = ctx.effectives();
  return `<div class="calc"><div class="calc-saisie">${formulaireHtml(type, eff.entrees, eff.verrous)}</div><div class="calc-resultats carte" id="resultats">${resultatsHtml(r)}</div></div>
    <div class="carte schema-carte" id="schema" ${r.schema ? '' : 'hidden'}>${schemaHtml(r)}</div>`;
}
function lierCalculateur(root, type, e, changer, ctx = ctxSimple(type, e)) {
  const recalculer = () => {
    const r = ctx.calcul(), z = root.querySelector('#schema');
    root.querySelector('#resultats').innerHTML = resultatsHtml(r);
    z.innerHTML = schemaHtml(r); z.hidden = !r.schema;
    changer(false);
  };
  root.querySelector('#resultats').onclick = ev => {
    const o = ev.target.closest('[data-onglet]');
    if (o) { ongletActif = o.dataset.onglet; root.querySelector('#resultats').innerHTML = resultatsHtml(ctx.calcul()); }
  };
  root.querySelector('#schema').onclick = ev => {
    const svg = ev.target.closest('[data-dl-schema]'), dxf = ev.target.closest('[data-dl-dxf]');
    if (!svg && !dxf) return;
    const r = ctx.calcul(), nom = `Schema_${String(e.titreInstallation || 'principe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_')}`;
    const [fichier, data, mime] = dxf ? [`${nom}.dxf`, Dxf.depuisSvg(r.schema).octets, 'application/dxf'] : [`${nom}.svg`, new TextEncoder().encode(r.schema), 'image/svg+xml'];
    Promise.resolve(telecharger(fichier, data, mime)).then(x => toast(x === 'refuse' ? 'Téléchargement annulé' : 'Schéma enregistré')).catch(er => toast(er.message, 6000));
  };
  const redessiner = () => { changer(true); };
  root.querySelectorAll('[data-k]').forEach(el => {
    if (el.tagName === 'SELECT') el.onchange = () => { e[el.dataset.k] = el.value; redessiner(); };
    else el.oninput = () => { e[el.dataset.k] = el.value; recalculer(); };
  });
  root.querySelectorAll('[data-l]').forEach(el => {
    const [k, i, col] = el.dataset.l.split('.');
    const ecrire = () => { const l = e[k] || (e[k] = []); (l[+i] || (l[+i] = {}))[col] = el.value; };
    // Une liste peut changer les champs verrouillés (puissance reprise d'un bilan) : formulaire redessiné
    if (el.tagName === 'SELECT') el.onchange = () => { ecrire(); redessiner(); }; else el.oninput = () => { ecrire(); recalculer(); };
  });
  root.querySelectorAll('[data-ajout-ligne]').forEach(b => b.onclick = () => {
    const k = b.dataset.ajoutLigne, c = Notes.TYPES[type].champs.find(x => x.k === k), l = e[k] || (e[k] = []);
    l.push(l.length ? { ...l[l.length - 1], ...(c.colonnes[0].t === 't' ? { [c.colonnes[0].k]: '' } : {}) } : Object.fromEntries(c.colonnes.map(col => [col.k, ''])));
    redessiner();
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
function dialogueNouvelleEtude(affaireId = '', apres, modeleId = '', opts = {}) {
  const perso = S.etudes.filter(x => x.modele), m0 = modeleDe(modeleId);
  const b = Modal.open(`<h2>Nouvelle étude</h2><form id="f-etude" class="grille-champs">
    ${apres ? '' : `<label class="large">Partir de<select name="modele"><option value="">Étude vide</option><optgroup label="Modèles intégrés">${Modeles.INTEGRES.map(m => `<option value="${m.id}" ${m.id === modeleId ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</optgroup>
      ${perso.length ? `<optgroup label="Modèles enregistrés">${perso.map(m => `<option value="${m.id}" ${m.id === modeleId ? 'selected' : ''}>${esc(m.objet)}</option>`).join('')}</optgroup>` : ''}</select></label>`}
    <label class="large">Objet de l'étude<input name="objet" required placeholder="Ex. : réseau eau glacée CTA bâtiment B" value="${esc(m0 ? m0.objet : opts.objet || '')}"></label>
    <label class="large">Affaire Pipe-Fit<select name="affaireId">${optionsAffaires(affaireId)}</select><span class="muted petit">Pas encore de commande : « Sans affaire » ; l'étude se relie au chantier plus tard (ici ou dans Pipe-Fit).</span></label>
    <div class="actions large"><button type="button" class="secondaire" id="annuler">Annuler</button><button>Créer</button></div></form>`);
  b.querySelector('#annuler').onclick = Modal.close;
  const sel = b.querySelector('[name="modele"]');
  if (sel) sel.onchange = () => { const m = modeleDe(sel.value), o = b.querySelector('[name="objet"]'); if (m && (!o.value || o.dataset.auto)) { o.value = m.objet; o.dataset.auto = '1'; } };
  b.querySelector('#f-etude').onsubmit = ev => {
    ev.preventDefault();
    const et = nouvelleEtude(ev.target.affaireId.value), m = sel && modeleDe(sel.value);
    et.objet = ev.target.objet.value.trim();
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
  html: ([id, noteId, ids]) => {
    const et = etudeDe(id);
    if (!et) return '<p class="erreur">Étude introuvable.</p><p><a href="#/">Retour aux études</a></p>';
    if (noteId === 'comparer') return Vues.comparer.html(et, ids);
    if (noteId) return Vues.note.html(et, noteId);
    const a = affaireDe(et.affaireId);
    return `<div class="barre"><a href="#/" class="secondaire btn petit">← Études</a><h1 class="titre-etude">${esc(et.objet)}</h1><span class="badge pf">${et.modele ? 'Modèle' : `Indice ${esc(et.indice)}`}</span>
        <span class="espace"></span><span class="muted petit" id="etat-enreg"></span><button class="secondaire" id="chiffrer">💶 Métré et chiffrage</button><button id="pdf">📄 Note de calcul PDF</button></div>
      <div class="carte"><div class="grille-champs">
        <label class="large">Objet<input data-e="objet" value="${esc(et.objet)}"></label>
        <label>Affaire Pipe-Fit<select data-e="affaireId">${optionsAffaires(et.affaireId)}</select></label>
        ${et.modele || et.affaireId ? '' : `<label>Client Pipe-Fit (étude sans chantier)<select data-e="clientId"><option value="">—</option>${S.pf.entreprises.filter(e => e.categorie !== 'Fournisseur').slice().sort((x, y) => x.nom.localeCompare(y.nom)).map(e => `<option value="${esc(e.id)}" ${e.id === et.clientId ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></label>
          <label>Devis Pipe-Fit (relie le chantier à son acceptation)<select data-e="devisId"><option value="">—</option>${S.pf.devis.filter(d => !et.clientId || d.clientId === et.clientId).map(d => `<option value="${esc(d.id)}" ${d.id === et.devisId ? 'selected' : ''}>${esc(d.numero || 'brouillon')} — ${esc(d.objet || '')} (${esc(d.statut || '')})</option>`).join('')}</select></label>`}
        <label>Client / maître d'ouvrage<input data-e="client" value="${esc(et.client)}" placeholder="${esc(clientDe(a))}"></label>
        <label>Date<input type="date" data-e="date" value="${esc(et.date)}"></label>
        <label>Rédacteur<input data-e="auteur" value="${esc(et.auteur)}"></label><label>Vérificateur<input data-e="verificateur" value="${esc(et.verificateur)}"></label>
        <label class="large">Objet détaillé, documents de référence (CCTP, plans, indices)<textarea data-e="description" rows="3">${esc(et.description)}</textarea></label></div>
        <div class="actions-ligne"><button class="secondaire petit" id="indice">Nouvel indice (${esc(suivantIndice(et.indice))})</button>
          ${et.historique.length ? `<span class="petit muted">Historique : ${et.historique.map(h => `${esc(h.indice)} du ${dateFr(h.date)}${h.motif ? ` (${esc(h.motif)})` : ''}`).join(' · ')}</span>` : ''}
          <span class="espace"></span><button class="secondaire petit" id="dupliquer">Dupliquer l'étude</button>${et.modele ? '' : '<button class="secondaire petit" id="modele">⭐ Enregistrer comme modèle</button>'}<button class="secondaire petit" id="supprimer">Supprimer</button></div></div>
      <div class="barre"><h2>Calculs <span class="compte">${et.notes.length}</span></h2><button id="ajout">+ Ajouter un calcul</button><span class="espace"></span>
        ${et.notes.length > 1 ? '<button class="secondaire" id="comparer" disabled title="Cocher au moins deux calculs">⚖️ Comparer la sélection</button>' : ''}</div>
      ${et.notes.length ? `<div class="notes">${et.notes.map((n, i) => { const t = Notes.TYPES[n.type], r = Liens.calculer(et, n), err = r.alertes.filter(x => x.niveau === 'erreur').length, att = r.alertes.filter(x => x.niveau === 'attention').length;
        return `<div class="carte note"><a href="#/etude/${et.id}/${n.id}" class="note-lien"><span class="ico">${t.icone}</span><span><span class="muted petit">N${i + 1} · ${esc(t.famille)}${n.lien || (n.entrees.circuits || []).some(c => c.bilan) ? ' · 🔗 lié' : ''}</span><strong>${esc(n.titre)}</strong>
          <span class="petit">${esc(r.synthese)}</span></span></a><span class="note-etat">${err ? `<span class="badge erreur">${err} erreur(s)</span>` : att ? `<span class="badge">${att} point(s) d'attention</span>` : '<span class="badge ok">Conforme</span>'}</span>
          <span class="note-actions"><label class="case petit" title="Sélectionner pour comparer"><input type="checkbox" data-comparer="${n.id}"> comparer</label><button class="icone" data-monter="${i}" title="Monter" ${i ? '' : 'disabled'}>▲</button><button class="icone" data-descendre="${i}" title="Descendre" ${i < et.notes.length - 1 ? '' : 'disabled'}>▼</button></span></div>`; }).join('')}</div>`
        : '<p class="muted">Aucun calcul : ajoutez-en un ou versez un calcul rapide dans cette étude.</p>'}`;
  },
  bind: (root, [id, noteId, ids]) => {
    const et = etudeDe(id);
    if (!et) return;
    if (noteId === 'comparer') return Vues.comparer.bind(root, et, ids);
    if (noteId) return Vues.note.bind(root, et, noteId);
    root.querySelectorAll('[data-e]').forEach(el => {
      el.onchange = el.oninput = () => {
        et[el.dataset.e] = el.value;
        if (el.dataset.e === 'affaireId') { et.client = clientDe(affaireDe(el.value)) || et.client; enregistrer(et); return App.render(); }
        if (el.dataset.e === 'clientId') { et.client = (S.pf.entreprises.find(e => e.id === el.value) || {}).nom || et.client; if (et.devisId && (S.pf.devis.find(d => d.id === et.devisId) || {}).clientId !== el.value) et.devisId = ''; enregistrer(et); return App.render(); }
        if (el.dataset.e === 'devisId') { enregistrer(et); return; }
        if (el.dataset.e === 'objet') root.querySelector('.titre-etude').textContent = el.value;
        if (String(et.objet).trim()) enregistrer(et);
      };
    });
    root.querySelector('#pdf').onclick = () => genererNoteCalcul(et);
    root.querySelector('#chiffrer').onclick = () => dialogueChiffrage(et);
    root.querySelector('#ajout').onclick = () => dialogueAjoutCalcul(et);
    root.querySelector('#indice').onclick = () => {
      const b = Modal.open(`<h2>Nouvel indice ${esc(suivantIndice(et.indice))}</h2><label>Motif de la révision<input id="motif" placeholder="Ex. : prise en compte des remarques du BET"></label>
        <div class="actions"><button class="secondaire" id="annuler">Annuler</button><button id="ok">Créer l'indice</button></div>`);
      b.querySelector('#annuler').onclick = Modal.close;
      b.querySelector('#ok').onclick = () => { et.historique.push({ indice: et.indice, date: et.date, motif: et.motifIndice || '' }); et.indice = suivantIndice(et.indice); et.motifIndice = b.querySelector('#motif').value; et.date = aujourdhui(); enregistrer(et); Modal.close(); App.render(); };
    };
    root.querySelector('#dupliquer').onclick = () => {
      const c = { ...copie(et), id: uidE(), objet: `${et.objet} (copie)`, indice: 'A', historique: [], date: aujourdhui(), auteur: S.me.nom || S.me.login };
      ['_v', '_at', '_by'].forEach(k => delete c[k]);
      // Nouveaux identifiants, liens entre notes reportés sur les copies
      const ids = new Map(c.notes.map(n => [n.id, uidE()]));
      c.notes.forEach(n => { n.id = ids.get(n.id); if (n.lien) n.lien.note = ids.get(n.lien.note) || n.lien.note; (n.entrees.circuits || []).forEach(x => { if (x.bilan) x.bilan = ids.get(x.bilan) || x.bilan; }); });
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
        const m = { ...copie(et), id: uidE(), modele: true, objet: nom, affaireId: '', client: '', indice: 'A', historique: [], motifIndice: '', verificateur: '' };
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

// Note de calcul d'une étude
Vues.note = {
  html: (et, noteId) => {
    const n = et.notes.find(x => x.id === noteId);
    if (!n) return `<p class="erreur">Calcul introuvable.</p><p><a href="#/etude/${et.id}">Retour à l'étude</a></p>`;
    const t = Notes.TYPES[n.type], i = et.notes.indexOf(n);
    n.entrees = completer(n.type, n.entrees || {});
    contexteEtude = et;
    const lien = Liens.description(et, n), ctx = ctxEtude(et, n);
    return `<div class="barre"><a href="#/etude/${et.id}" class="secondaire btn petit">← ${esc(et.objet)}</a><span class="ico-titre">${t.icone}</span><span class="muted">N${i + 1}</span>
        <input class="titre-note" data-n="titre" value="${esc(n.titre)}" aria-label="Titre du calcul"><span class="muted petit" id="etat-enreg"></span></div>
      <p class="muted petit">${esc(t.description)}</p>
      ${lien ? `<div class="bandeau-lien">🔗 ${esc(lien)} <button class="secondaire petit" id="detacher">Détacher</button></div>` : ''}
      ${calculateurHtml(n.type, n.entrees, ctx)}
      <div class="carte"><label class="champ-libre">Commentaire (repris dans la note de calcul)<textarea data-n="commentaire" rows="3">${esc(n.commentaire)}</textarea></label>
      <div class="actions-ligne"><button id="pdf-note">📄 PDF de ce calcul</button><button class="secondaire" id="defauts">Valeurs par défaut</button><button class="secondaire" id="dupliquer">Dupliquer</button>
        ${n.type === 'pid' ? '<button class="secondaire" id="notes-liees">🔗 Créer les notes liées (réseaux et pompes, vannes, vase)</button>' : ''}<span class="espace"></span><button class="secondaire" id="supprimer">Supprimer ce calcul</button></div></div>`;
  },
  bind: (root, et, noteId) => {
    const n = et.notes.find(x => x.id === noteId);
    if (!n) return;
    lierCalculateur(root, n.type, n.entrees, redessin => { enregistrer(et); if (redessin) avecFocus(App.render); }, ctxEtude(et, n));
    const det = root.querySelector('#detacher');
    if (det) det.onclick = async () => { if (await confirmer('Détacher ce calcul ? Les valeurs reprises deviennent des valeurs saisies et ne suivront plus la note d\'origine.', 'Détacher')) { Liens.detacher(et, n); enregistrer(et); App.render(); } };
    const liees = root.querySelector('#notes-liees');
    if (liees) liees.onclick = () => {
      const nv = Liens.notesDepuisSchema(et, n, uidE);
      if (!nv.length) return toast('Les notes liées existent déjà pour tous les circuits.');
      et.notes.splice(et.notes.indexOf(n) + 1, 0, ...nv); enregistrer(et); toast(`${nv.length} note(s) créée(s), reliées au schéma`); location.hash = `#/etude/${et.id}`;
    };
    root.querySelectorAll('[data-n]').forEach(el => el.oninput = () => { n[el.dataset.n] = el.value; enregistrer(et); });
    root.querySelector('#pdf-note').onclick = () => genererNoteCalcul(et, [n.id]);
    root.querySelector('#defauts').onclick = async () => { if (await confirmer('Remplacer toutes les données saisies par les valeurs par défaut ?', 'Remplacer')) { n.entrees = Notes.defauts(n.type); enregistrer(et); App.render(); } };
    root.querySelector('#dupliquer').onclick = () => { const c = { ...copie(n), id: uidE(), titre: `${n.titre} (copie)` }; et.notes.splice(et.notes.indexOf(n) + 1, 0, c); enregistrer(et); location.hash = `#/etude/${et.id}/${c.id}`; };
    root.querySelector('#supprimer').onclick = async () => { if (await confirmer(`Supprimer le calcul « ${n.titre} » ?`, 'Supprimer')) { et.notes.splice(et.notes.indexOf(n), 1); enregistrer(et); location.hash = `#/etude/${et.id}`; } };
  },
};

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
    <div class="carte"><h2>Catalogues de pompes et de vannes</h2>
      <p class="muted petit">Les calculs proposent un modèle d'après le point de fonctionnement. Sans catalogue importé, une gamme générique d'exemple est utilisée (ordres de grandeur, aucune marque). Import au format CSV (séparateur « ; »).</p>
      ${['pompes', 'vannes'].map(g => { const cat = (c.catalogues || {})[g] || []; return `<div class="actions-ligne"><strong>${g === 'pompes' ? 'Pompes' : 'Vannes de régulation'}</strong>
        <span class="badge ${cat.length ? 'ok' : ''}">${cat.length ? `${cat.length} modèle(s) importé(s)` : 'gamme générique'}</span>
        <button class="secondaire petit" data-csv-modele="${g}">Modèle CSV</button>${admin ? `<button class="petit" data-csv-import="${g}">Importer un CSV…</button>${cat.length ? `<button class="secondaire petit" data-csv-vider="${g}">Revenir à la gamme générique</button>` : ''}` : ''}</div>`; }).join('')}</div>`; },
  bind: root => {
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
    root.querySelectorAll('[data-csv-modele]').forEach(b => b.onclick = () => Promise.resolve(telecharger(`catalogue-${b.dataset.csvModele}.csv`, new TextEncoder().encode(Catalogue.modeleCsv(b.dataset.csvModele)), 'text/csv')).catch(e => toast(e.message, 6000)));
    root.querySelectorAll('[data-csv-vider]').forEach(b => b.onclick = async () => { if (await confirmer('Revenir à la gamme générique pour ce catalogue ?', 'Revenir')) { await enregistrerCatalogue(b.dataset.csvVider, []); toast('Gamme générique rétablie'); } });
    root.querySelectorAll('[data-csv-import]').forEach(b => b.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv,text/plain';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
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
