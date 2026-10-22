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
  open(html) { const m = document.getElementById('modal'); m.querySelector('.modal-box').innerHTML = html; m.hidden = false; return m.querySelector('.modal-box'); },
  close() { document.getElementById('modal').hidden = true; },
};
const confirmer = (msg, ok = 'Confirmer') => new Promise(res => {
  const b = Modal.open(`<p>${esc(msg)}</p><div class="actions"><button class="secondaire" data-r="0">Annuler</button><button data-r="1">${esc(ok)}</button></div>`);
  b.querySelectorAll('[data-r]').forEach(x => x.onclick = () => { Modal.close(); res(x.dataset.r === '1'); });
});

/* ---------- Données ---------- */
const S = { me: null, config: null, etudes: [], pf: { affaires: [], entreprises: [] }, enCours: new Map() };
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
// Enregistrement différé (une requête à la fois par étude, contrôle de version)
function enregistrer(etude) {
  if (!S.etudes.includes(etude)) S.etudes.unshift(etude);
  const st = S.enCours.get(etude.id) || {};
  clearTimeout(st.t);
  st.t = setTimeout(async () => {
    if (st.vol) { st.encore = true; return; }
    st.vol = true;
    try {
      const r = await api('PUT', `/api/etudes/${etude.id}`, { data: etude, version: etude._v });
      Object.assign(etude, { _v: r._v, _at: r._at, _by: r._by });
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
const optionsDe = (c, e) => (typeof c.o === 'function' ? c.o(e) : c.o);
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
function formulaireHtml(type, e) {
  return rubriques(type, e).map(r => `<fieldset>${r.titre ? `<legend>${esc(r.titre)}</legend>` : ''}<div class="grille-champs">${r.champs.map(c => {
    if (c.t === 'lignes') {
      const lignes = e[c.k] || [];
      return `<div class="large"><div class="petit muted">${esc(c.l)}</div><div class="defile-x"><table class="edit"><thead><tr>${c.colonnes.map(col => `<th>${esc(col.l)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${lignes.map((l, i) => `<tr>${c.colonnes.map(col => `<td>${col.t === 's' ? `<select data-l="${c.k}.${i}.${col.k}">${optionsHtml(optionsDe(col, e), l[col.k])}</select>`
          : `<input data-l="${c.k}.${i}.${col.k}" value="${esc(valeurChamp(l[col.k]))}" ${col.t === 't' ? '' : 'inputmode="decimal" class="nombre"'}>`}</td>`).join('')}
          <td><button class="icone" data-suppr-ligne="${c.k}.${i}" title="Supprimer la ligne">✕</button></td></tr>`).join('')}</tbody></table></div>
        <button class="secondaire petit" data-ajout-ligne="${c.k}">+ Ajouter une ligne</button></div>`;
    }
    const lib = `<span>${esc(c.l)}${c.u ? ` <span class="unite">(${esc(c.u)})</span>` : ''}</span>`;
    if (c.t === 's') return `<label>${lib}<select data-k="${c.k}">${optionsHtml(optionsDe(c, e), e[c.k])}</select></label>`;
    return `<label>${lib}<input data-k="${c.k}" value="${esc(valeurChamp(e[c.k]))}" ${c.t === 't' ? '' : 'inputmode="decimal" class="nombre"'}></label>`;
  }).join('')}</div></fieldset>`).join('');
}
function resultatsHtml(r) {
  return `${r.alertes.map(a => `<div class="alerte ${a.niveau}">${esc(a.texte)}</div>`).join('')}
    <table class="resume">${r.resume.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    ${r.tableaux.map(t => `<h3>${esc(t.titre)}</h3><div class="defile-x"><table class="liste compact"><thead><tr>${t.entetes.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${t.lignes.map((l, i) => `<tr class="${i === t.surligne ? 'retenu' : ''}${t.total && i === t.lignes.length - 1 ? ' total' : ''}">${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}
    <details class="hypotheses"><summary>Hypothèses et méthode</summary><ul>${r.hypotheses.map(h => `<li>${esc(h)}</li>`).join('')}</ul></details>`;
}
// Calculateur : formulaire et résultats ; changer() est appelé après chaque modification des entrées
// Schéma dessiné par le calcul (P&ID), sur toute la largeur sous la saisie
const schemaHtml = r => (r.schema ? `<div class="barre"><h2>Schéma de principe</h2><span class="espace"></span><button class="secondaire petit" data-dl-schema>Télécharger le schéma (SVG)</button></div><div class="schema">${r.schema}</div>` : '');
function calculateurHtml(type, e) {
  const r = Notes.calculer(type, e);
  return `<div class="calc"><div class="calc-saisie">${formulaireHtml(type, e)}</div><div class="calc-resultats carte" id="resultats">${resultatsHtml(r)}</div></div>
    <div class="carte schema-carte" id="schema" ${r.schema ? '' : 'hidden'}>${schemaHtml(r)}</div>`;
}
function lierCalculateur(root, type, e, changer) {
  const recalculer = () => {
    const r = Notes.calculer(type, e), z = root.querySelector('#schema');
    root.querySelector('#resultats').innerHTML = resultatsHtml(r);
    z.innerHTML = schemaHtml(r); z.hidden = !r.schema;
    changer(false);
  };
  root.querySelector('#schema').onclick = ev => {
    if (!ev.target.closest('[data-dl-schema]')) return;
    const r = Notes.calculer(type, e), nom = `Schema_${String(e.titreInstallation || 'principe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_')}.svg`;
    telecharger(nom, new TextEncoder().encode(r.schema), 'image/svg+xml');
  };
  const redessiner = () => { changer(true); };
  root.querySelectorAll('[data-k]').forEach(el => {
    if (el.tagName === 'SELECT') el.onchange = () => { e[el.dataset.k] = el.value; redessiner(); };
    else el.oninput = () => { e[el.dataset.k] = el.value; recalculer(); };
  });
  root.querySelectorAll('[data-l]').forEach(el => {
    const [k, i, col] = el.dataset.l.split('.');
    const maj = () => { e[k][+i][col] = el.value; recalculer(); };
    if (el.tagName === 'SELECT') el.onchange = maj; else el.oninput = maj;
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
    const etudes = S.etudes.filter(x => !q || `${x.objet} ${x.client} ${libelleAffaire(affaireDe(x.affaireId))}`.toLowerCase().includes(q));
    return `<div class="barre"><h1>Études</h1><button id="nouvelle">+ Nouvelle étude</button><input type="search" id="q" placeholder="Rechercher une étude, une affaire…" value="${esc(q)}"></div>
      <section>${listeEtudes(etudes)}</section>
      <section><h2>Calcul rapide <span class="muted petit">— sans enregistrement, à verser ensuite dans une étude</span></h2>
      ${typesParFamille().map(([f, ts]) => `<h3>${esc(f)}</h3><div class="types">${ts.map(([k, t]) => `<a class="carte type" href="#/rapide/${k}"><span class="ico">${t.icone}</span><span><strong>${esc(t.titre)}</strong><span class="muted petit">${esc(t.description)}</span></span></a>`).join('')}</div>`).join('')}</section>`;
  },
  bind: root => {
    const q = root.querySelector('#q');
    q.oninput = () => { sessionStorage.setItem('etudes-q', q.value); const pos = q.selectionStart; App.render(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); };
    root.querySelector('#nouvelle').onclick = () => dialogueNouvelleEtude();
    lierListe(root);
  },
};

// Lien « Études » d'un chantier dans Pipe-Fit : études de l'affaire, création pré-remplie
Vues.chantier = {
  html: ([id]) => {
    const a = affaireDe(id), etudes = S.etudes.filter(x => x.affaireId === id);
    return `<div class="barre"><h1>${a ? esc(libelleAffaire(a)) : 'Affaire inconnue'}</h1><button id="nouvelle">+ Nouvelle étude pour cette affaire</button></div>
      ${a ? `<p class="muted">${esc(clientDe(a))}${a.statut ? ` · ${esc(a.statut)}` : ''}</p>` : '<p class="erreur">Cette affaire n\'existe pas dans Pipe-Fit ou vous n\'y avez pas accès.</p>'}
      ${listeEtudes(etudes)}`;
  },
  bind: (root, [id]) => { root.querySelector('#nouvelle').onclick = () => dialogueNouvelleEtude(affaireDe(id) ? id : ''); lierListe(root); },
};

const optionsAffaires = sel => `<option value="">— Sans affaire —</option>${S.pf.affaires.filter(a => a.type !== 'horsDevis').slice().sort((x, y) => String(y.code || '').localeCompare(String(x.code || '')))
  .map(a => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(libelleAffaire(a))}</option>`).join('')}`;
function dialogueNouvelleEtude(affaireId = '', apres) {
  const b = Modal.open(`<h2>Nouvelle étude</h2><form id="f-etude" class="grille-champs">
    <label class="large">Objet de l'étude<input name="objet" required placeholder="Ex. : réseau eau glacée CTA bâtiment B"></label>
    <label class="large">Affaire Pipe-Fit<select name="affaireId">${optionsAffaires(affaireId)}</select></label>
    <div class="actions large"><button type="button" class="secondaire" id="annuler">Annuler</button><button>Créer</button></div></form>`);
  b.querySelector('#annuler').onclick = Modal.close;
  b.querySelector('#f-etude').onsubmit = ev => {
    ev.preventDefault();
    const et = nouvelleEtude(ev.target.affaireId.value);
    et.objet = ev.target.objet.value.trim();
    if (apres) apres(et);
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

// Étude : en-tête, indices, liste des notes de calcul
Vues.etude = {
  html: ([id, noteId]) => {
    const et = etudeDe(id);
    if (!et) return '<p class="erreur">Étude introuvable.</p><p><a href="#/">Retour aux études</a></p>';
    if (noteId) return Vues.note.html(et, noteId);
    const a = affaireDe(et.affaireId);
    return `<div class="barre"><a href="#/" class="secondaire btn petit">← Études</a><h1 class="titre-etude">${esc(et.objet)}</h1><span class="badge pf">Indice ${esc(et.indice)}</span>
        <span class="espace"></span><span class="muted petit" id="etat-enreg"></span><button id="pdf">📄 Note de calcul PDF</button></div>
      <div class="carte"><div class="grille-champs">
        <label class="large">Objet<input data-e="objet" value="${esc(et.objet)}"></label>
        <label>Affaire Pipe-Fit<select data-e="affaireId">${optionsAffaires(et.affaireId)}</select></label>
        <label>Client / maître d'ouvrage<input data-e="client" value="${esc(et.client)}" placeholder="${esc(clientDe(a))}"></label>
        <label>Date<input type="date" data-e="date" value="${esc(et.date)}"></label>
        <label>Rédacteur<input data-e="auteur" value="${esc(et.auteur)}"></label><label>Vérificateur<input data-e="verificateur" value="${esc(et.verificateur)}"></label>
        <label class="large">Objet détaillé, documents de référence (CCTP, plans, indices)<textarea data-e="description" rows="3">${esc(et.description)}</textarea></label></div>
        <div class="actions-ligne"><button class="secondaire petit" id="indice">Nouvel indice (${esc(suivantIndice(et.indice))})</button>
          ${et.historique.length ? `<span class="petit muted">Historique : ${et.historique.map(h => `${esc(h.indice)} du ${dateFr(h.date)}${h.motif ? ` (${esc(h.motif)})` : ''}`).join(' · ')}</span>` : ''}
          <span class="espace"></span><button class="secondaire petit" id="dupliquer">Dupliquer l'étude</button><button class="secondaire petit" id="supprimer">Supprimer</button></div></div>
      <div class="barre"><h2>Calculs <span class="compte">${et.notes.length}</span></h2><button id="ajout">+ Ajouter un calcul</button></div>
      ${et.notes.length ? `<div class="notes">${et.notes.map((n, i) => { const t = Notes.TYPES[n.type], r = Notes.calculer(n.type, n.entrees), err = r.alertes.filter(x => x.niveau === 'erreur').length, att = r.alertes.filter(x => x.niveau === 'attention').length;
        return `<div class="carte note"><a href="#/etude/${et.id}/${n.id}" class="note-lien"><span class="ico">${t.icone}</span><span><span class="muted petit">N${i + 1} · ${esc(t.famille)}</span><strong>${esc(n.titre)}</strong>
          <span class="petit">${esc(r.synthese)}</span></span></a><span class="note-etat">${err ? `<span class="badge erreur">${err} erreur(s)</span>` : att ? `<span class="badge">${att} point(s) d'attention</span>` : '<span class="badge ok">Conforme</span>'}</span>
          <span class="note-actions"><button class="icone" data-monter="${i}" title="Monter" ${i ? '' : 'disabled'}>▲</button><button class="icone" data-descendre="${i}" title="Descendre" ${i < et.notes.length - 1 ? '' : 'disabled'}>▼</button></span></div>`; }).join('')}</div>`
        : '<p class="muted">Aucun calcul : ajoutez-en un ou versez un calcul rapide dans cette étude.</p>'}`;
  },
  bind: (root, [id, noteId]) => {
    const et = etudeDe(id);
    if (!et) return;
    if (noteId) return Vues.note.bind(root, et, noteId);
    root.querySelectorAll('[data-e]').forEach(el => {
      el.onchange = el.oninput = () => {
        et[el.dataset.e] = el.value;
        if (el.dataset.e === 'affaireId') { et.client = clientDe(affaireDe(el.value)) || et.client; enregistrer(et); return App.render(); }
        if (el.dataset.e === 'objet') root.querySelector('.titre-etude').textContent = el.value;
        if (String(et.objet).trim()) enregistrer(et);
      };
    });
    root.querySelector('#pdf').onclick = () => genererNoteCalcul(et);
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
      c.notes.forEach(n => { n.id = uidE(); });
      enregistrer(c); location.hash = `#/etude/${c.id}`;
    };
    root.querySelector('#supprimer').onclick = async () => {
      if (!(await confirmer(`Supprimer l'étude « ${et.objet} » et ses ${et.notes.length} calcul(s) ?`, 'Supprimer'))) return;
      await api('DELETE', `/api/etudes/${et.id}`).catch(e => toast(e.message));
      S.etudes = S.etudes.filter(x => x !== et); location.hash = '#/';
    };
    const deplacer = (i, j) => { const [n] = et.notes.splice(i, 1); et.notes.splice(j, 0, n); enregistrer(et); App.render(); };
    root.querySelectorAll('[data-monter]').forEach(b => b.onclick = () => deplacer(+b.dataset.monter, +b.dataset.monter - 1));
    root.querySelectorAll('[data-descendre]').forEach(b => b.onclick = () => deplacer(+b.dataset.descendre, +b.dataset.descendre + 1));
  },
};
const suivantIndice = i => (/^[A-Y]$/.test(i) ? String.fromCharCode(i.charCodeAt(0) + 1) : /^\d+$/.test(i) ? String(+i + 1) : `${i}'`);

// Note de calcul d'une étude
Vues.note = {
  html: (et, noteId) => {
    const n = et.notes.find(x => x.id === noteId);
    if (!n) return `<p class="erreur">Calcul introuvable.</p><p><a href="#/etude/${et.id}">Retour à l'étude</a></p>`;
    const t = Notes.TYPES[n.type], i = et.notes.indexOf(n);
    n.entrees = completer(n.type, n.entrees || {});
    return `<div class="barre"><a href="#/etude/${et.id}" class="secondaire btn petit">← ${esc(et.objet)}</a><span class="ico-titre">${t.icone}</span><span class="muted">N${i + 1}</span>
        <input class="titre-note" data-n="titre" value="${esc(n.titre)}" aria-label="Titre du calcul"><span class="muted petit" id="etat-enreg"></span></div>
      <p class="muted petit">${esc(t.description)}</p>
      ${calculateurHtml(n.type, n.entrees)}
      <div class="carte"><label class="champ-libre">Commentaire (repris dans la note de calcul)<textarea data-n="commentaire" rows="3">${esc(n.commentaire)}</textarea></label>
      <div class="actions-ligne"><button id="pdf-note">📄 PDF de ce calcul</button><button class="secondaire" id="defauts">Valeurs par défaut</button><button class="secondaire" id="dupliquer">Dupliquer</button><span class="espace"></span><button class="secondaire" id="supprimer">Supprimer ce calcul</button></div></div>`;
  },
  bind: (root, et, noteId) => {
    const n = et.notes.find(x => x.id === noteId);
    if (!n) return;
    lierCalculateur(root, n.type, n.entrees, redessin => { enregistrer(et); if (redessin) avecFocus(App.render); });
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
    if (!t) return '<p class="erreur">Calcul inconnu.</p>';
    return `<div class="barre"><a href="#/" class="secondaire btn petit">← Accueil</a><span class="ico-titre">${t.icone}</span><h1>${esc(t.titre)}</h1><span class="espace"></span>
      <button class="secondaire" id="defauts">Valeurs par défaut</button><button class="secondaire" id="pdf">📄 PDF</button><button id="verser">Enregistrer dans une étude…</button></div>
      <p class="muted petit">${esc(t.description)}</p>${calculateurHtml(type, entreesRapide(type))}`;
  },
  bind: (root, [type]) => {
    if (!Notes.TYPES[type]) return;
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
      <label>Couleur de la charte<input data-cfg="couleur" type="color" value="${esc(c.couleur)}" ${dis}></label></div></div>`; },
  bind: root => root.querySelectorAll('[data-cfg]').forEach(el => el.onchange = async () => { const c = copie(S.config); ecrireChemin(c, el.dataset.cfg, el.value); S.config = await api('PUT', '/api/config', c); toast('Réglages enregistrés'); }),
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
  App.render();
  window.addEventListener('hashchange', () => { Modal.close(); App.render(); });
}
document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
demarrer();
