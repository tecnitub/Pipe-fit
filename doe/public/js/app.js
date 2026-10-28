// Pipe-Fit DOE : tableau de bord des dossiers, éditeur section par section (plan de classement TECNITUB),
// pièces jointes, reprise des informations du chantier depuis Pipe-Fit, génération du DOE complet en PDF.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = iso => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : '');
const uidD = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
const vide = v => v === undefined || v === null || String(v).trim() === '';
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { status: r.status, data: j });
  return j;
}
const fichierUrl = f => (window.FICHIER_URL ? window.FICHIER_URL(f) : f.src === 'pf' ? `/api/pf/fichier/${encodeURIComponent(f.id)}` : `/api/fichiers/${encodeURIComponent(f.id)}`);
async function envoyerFichier(file) {
  if (window.ENVOI_FICHIER) return window.ENVOI_FICHIER(file);
  const r = await fetch('/api/fichiers', { method: 'POST', body: file, headers: { 'X-Doe-Upload': '1', 'X-Filename': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Envoi impossible (${r.status})`);
  return { src: 'doe', id: j.id, nom: j.nom, mime: j.mime };
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

/* ---------- Données : dossiers DOE ---------- */
const S = { me: null, config: null, does: [], enCours: new Map() };
const doeDe = affaireId => S.does.find(d => d.affaireId === affaireId);
// Enregistrement différé (une requête à la fois par dossier, contrôle de version)
function enregistrer(doe) {
  const st = S.enCours.get(doe.id) || {};
  clearTimeout(st.t);
  st.t = setTimeout(async () => {
    if (st.vol) { st.encore = true; return; }
    st.vol = true;
    try {
      const r = await api('PUT', `/api/does/${doe.id}`, { data: doe, version: doe._v });
      Object.assign(doe, { _v: r._v, _at: r._at, _by: r._by });
      majEtatEnregistrement('Enregistré');
    } catch (e) {
      if (e.status === 409 && e.data.record) { Object.assign(doe, e.data.record); toast(`${e.message} : version la plus récente rechargée.`, 5000); App.render(); }
      else { majEtatEnregistrement('Non enregistré'); toast(e.message, 5000); }
    }
    st.vol = false;
    if (st.encore) { st.encore = false; enregistrer(doe); }
  }, 350);
  S.enCours.set(doe.id, st);
  majEtatEnregistrement('Enregistrement…');
}
const majEtatEnregistrement = t => { const e = document.getElementById('etat-enreg'); if (e) e.textContent = t; };

/* ---------- Ce qui reste à compléter ---------- */
const familleDe = id => TRAME.familles.find(f => f.id === id);
// Pièce de liste de contrôle fournie : cochée, jointe, ou couverte par un PV signé dans Pipe-Fit
const presentCtl = (doe, k, it) => !!(it.present || (it.fichiers || []).length || couvertParPF(doe, k, it.libelle));
function controlesActifs(doe) {
  return Object.entries(TRAME.controles).filter(([k, c]) => k !== '8.2' && (!c.familles.length || c.familles.some(f => doe.familles.includes(f)))).map(([k]) => k);
}
function manquesDOE(doe) {
  const m = [], ok = [];
  const verif = (section, cond, libelle) => (cond ? ok : m).push({ section, libelle });
  ['lot', 'discipline', 'operation', 'adresse'].forEach(k => verif('garde', !vide(doe[k]), { lot: 'N° de lot', discipline: 'Discipline', operation: 'Opération', adresse: 'Adresse du chantier' }[k]));
  ['mo', 'moe', 'bet', 'controle'].forEach(k => { const i = doe.intervenants[k] || {}, lib = TRAME.intervenants.find(x => x[0] === k)[1]; verif('garde', !vide(i.raison), `${lib} : raison sociale`); if (!vide(i.raison)) ['interlocuteur', 'tel', 'mail'].forEach(c => verif('garde', !vide(i[c]), `${lib} : ${{ interlocuteur: 'interlocuteur', tel: 'téléphone', mail: 'e-mail' }[c]}`)); });
  verif('garde', !vide(doe.cctp.indice) && !vide(doe.cctp.date), 'Indice CCTP (indice et date)');
  ['debut', 'fin', 'reception'].forEach(k => verif('s1', !vide(doe.dates[k]), { debut: 'Date de début de chantier', fin: 'Date de fin de travaux', reception: 'Date de réception' }[k]));
  verif('s1', !vide(doe.cctp.dossier), 'Référence CCTP : n° de dossier BET');
  verif('s2', doe.plans.length > 0, 'Aucun plan de recollement');
  doe.plans.forEach(p => { verif('s2', !vide(p.numero), `Plan « ${p.designation} » : n° de plan`); verif('s2', !!p.fichier, `Plan « ${p.designation} » : fichier`); });
  verif('s3', doe.familles.length > 0, 'Choisir les familles d\'équipements du chantier');
  doe.familles.forEach(fid => {
    const f = familleDe(fid), eqs = doe.equipements.filter(e => e.famille === fid);
    verif('s3', eqs.length > 0, `${fid} ${f.titre} : aucun équipement`);
    eqs.forEach(e => ['repere', 'marque', 'reference', 'serie'].forEach(k => verif('s3', !vide(e[k]), `${e.repere || e.designation || 'Équipement'} : ${{ repere: 'repère', marque: 'marque', reference: 'référence', serie: 'n° de série' }[k]}`)));
    verif('s3', doe.fiches.some(x => x.famille === fid), `${fid} : aucune fiche technique jointe`);
  });
  controlesActifs(doe).forEach(k => (doe.controles[k] || TRAME.controles[k].items.map(l => ({ libelle: l }))).forEach(it => verif(k[0] === '5' ? 's5' : 's6', presentCtl(doe, k, it), `${k} ${it.libelle}`)));
  verif('s7', doe.maintenance.length > 0, 'Carnet de maintenance vide');
  verif('s7', doe.notices.length > 0, 'Aucune notice d\'exploitation');
  doe.formation.forEach(f => verif('s8', !vide(f[3]), `Formation « ${f[0]} » : formateur`));
  (doe.controles['8.2'] || TRAME.controles['8.2'].items.map(l => ({ libelle: l }))).forEach(it => verif('s8', it.present || (it.fichiers || []).length, `8.2 ${it.libelle}`));
  doe.equipements.filter(e => doe.familles.includes(e.famille)).forEach(e => { verif('s9', !vide(e.garantie), `${e.repere || e.designation} : durée de garantie`); verif('s9', !vide(e.sav), `${e.repere || e.designation} : contact SAV`); });
  verif('signatures', !vide(doe.signatures.date), 'Date de remise (« Fait à …, le … »)');
  if (typeof manquesEtude === 'function') manquesEtude(doe, verif);
  return { manques: m, total: m.length + ok.length, pct: Math.round(ok.length / Math.max(1, m.length + ok.length) * 100) };
}

/* ---------- Écrans ---------- */
const Vues = {};
const App = {
  render() {
    const root = document.getElementById('app');
    if (!S.me) return;
    const [chemin] = (location.hash.replace(/^#\/?/, '') || '').split('?');
    const [nom, ...p] = chemin.split('/');
    const vue = Vues[nom] || Vues.accueil;
    root.innerHTML = vue.html(p);
    if (vue.bind) vue.bind(root, p);
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('actif', (a.getAttribute('href') || '').slice(2) === (nom || 'accueil')));
  },
};

Vues.connexion = {
  html: err => `<form class="carte connexion" id="f-login"><img src="logo-tecnitub.png" alt="TECNITUB" class="logo-connexion"><h1>Dossiers des ouvrages exécutés</h1>
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

// Tableau de bord : dossiers en cours, chantiers à doter d'un DOE
Vues.accueil = {
  html: () => {
    const q = (sessionStorage.getItem('doe-q') || '').toLowerCase();
    const dossiers = S.does.map(d => ({ d, a: PF.get('affaires', d.affaireId) || {}, m: manquesDOE(d) })).filter(x => !q || `${x.a.code} ${x.a.nom} ${x.d.operation}`.toLowerCase().includes(q));
    const sans = chantiersPF().filter(x => !doeDe(x.a.id) && (!q || `${x.a.code} ${x.a.nom}`.toLowerCase().includes(q)));
    return `<div class="barre"><h1>Dossiers des ouvrages exécutés</h1><input type="search" id="q" placeholder="Rechercher un chantier…" value="${esc(q)}"></div>
    <section><h2>Dossiers <span class="compte">${dossiers.length}</span></h2>
      ${dossiers.length ? `<div class="grille">${dossiers.map(({ d, a, m }) => `<a class="carte dossier" href="#/doe/${d.id}/${d.statut === 'Étude' ? 'etude' : 'garde'}">
        <div class="anneau" style="--p:${m.pct}"><span>${m.pct}%</span></div>
        <div><strong>${esc(a.code || '')}</strong> ${esc(d.operation || a.nom || '')}<div class="muted petit">${esc((d.intervenants.mo || {}).raison || '')}</div>
          <div class="petit">Lot ${esc(d.lot || '?')} · indice ${esc(d.indice)} · ${d.statut === 'Remis' ? `<span class="badge ok">Remis le ${dateFr(d.dateRemise)}</span>` : `${d.statut === 'Étude' ? '<span class="badge pf">Étude</span> ' : ''}<span class="badge">${m.manques.length} à compléter</span>`}</div>
          <div class="muted petit">Modifié ${d._at ? new Date(d._at).toLocaleDateString('fr-FR') : ''} par ${esc(d._by || '')}</div></div></a>`).join('')}</div>`
        : '<p class="muted">Aucun dossier pour l\'instant. Créez-en un à partir d\'un chantier ci-dessous.</p>'}</section>
    <section><h2>Chantiers Pipe-Fit sans dossier <span class="compte">${sans.length}</span></h2>
      ${sans.length ? `<table class="liste"><tr><th>Chantier</th><th>Client</th><th>Statut</th><th>Réception</th><th></th></tr>
        ${sans.map(({ a, reception }) => `<tr><td><strong>${esc(a.code || '')}</strong> ${esc(a.nom || '')}</td><td>${esc(entrepriseDe(a.clientId).nom || '')}</td><td>${esc(a.statut || '')}</td>
          <td>${reception ? `<span class="badge ok">${dateFr(reception)}</span>` : '<span class="muted">—</span>'}</td><td class="nowrap"><button class="petit" data-etude="${a.id}">Démarrer l'étude</button> <button class="petit secondaire" data-creer="${a.id}">Créer le DOE</button></td></tr>`).join('')}</table>`
        : '<p class="muted">Tous les chantiers ont leur DOE.</p>'}</section>`;
  },
  bind: root => {
    const q = root.querySelector('#q');
    q.oninput = () => { sessionStorage.setItem('doe-q', q.value); const pos = q.selectionStart; App.render(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); };
    root.querySelectorAll('[data-creer]').forEach(b => b.onclick = () => creerDOE(b.dataset.creer));
    root.querySelectorAll('[data-etude]').forEach(b => b.onclick = () => creerEtude(b.dataset.etude));
  },
};
async function creerDOE(affaireId) {
  const doe = { ...doeVide(affaireId, S.config), id: uidD() };
  const n = prefillDepuisPF(doe);
  const r = await api('PUT', `/api/does/${doe.id}`, { data: doe });
  S.does.unshift(r);
  toast(`DOE créé : ${n} information(s) reprises du chantier`);
  location.hash = `#/doe/${r.id}/garde`;
}
// Lien direct depuis Pipe-Fit : #/chantier/<id> ouvre (ou propose de créer) le DOE du chantier
Vues.chantier = {
  html: p => { const d = doeDe(p[0]), a = PF.get('affaires', p[0]); if (d) { setTimeout(() => { location.hash = `#/doe/${d.id}/${d.statut === 'Étude' ? 'etude' : 'garde'}`; }); return ''; }
    return a ? `<div class="carte"><h1>${esc(a.code || '')} ${esc(a.nom || '')}</h1><p>Ce chantier n'a pas encore de dossier.</p>
      <p class="muted petit">L'étude d'exécution (CCTP lu, équipements repérés, fiches techniques visées) devient le DOE à la fin des travaux.</p>
      <div class="actions-ligne"><button id="etude">Démarrer l'étude</button><button class="secondaire" id="creer">Créer directement le DOE</button> <a href="#/">Retour</a></div></div>` : '<p>Chantier introuvable dans Pipe-Fit.</p>'; },
  bind: (root, p) => { const b = root.querySelector('#creer'), e = root.querySelector('#etude'); if (b) b.onclick = () => creerDOE(p[0]); if (e) e.onclick = () => creerEtude(p[0]); },
};

// Depuis la fiche chantier du CRM : #/etude/<id> ouvre l'étude du chantier, ou la démarre
let etudeEnCreation = '';
Vues.etude = {
  html: p => {
    const d = doeDe(p[0]);
    if (d) { setTimeout(() => { location.hash = `#/doe/${d.id}/${enEtude(d) || d.statut === 'Étude' ? 'etude' : 'garde'}`; }); return ''; }
    if (!PF.get('affaires', p[0])) return '<p>Chantier introuvable dans Pipe-Fit.</p>';
    if (etudeEnCreation !== p[0]) { etudeEnCreation = p[0]; setTimeout(() => creerEtude(p[0]).catch(e => toast(e.message, 6000))); }
    return '<p class="muted">Création de l\'étude du chantier…</p>';
  },
};

/* ---------- Éditeur d'un dossier ---------- */
const champ = (lib, chemin, val, opts = {}) => `<label class="${opts.large ? 'large' : ''}">${esc(lib)}${opts.zone ? `<textarea data-ch="${chemin}" rows="${opts.rows || 3}">${esc(val)}</textarea>`
  : `<input data-ch="${chemin}" value="${esc(val)}" ${opts.type ? `type="${opts.type}"` : ''} placeholder="${esc(opts.ph || A_COMPLETER)}">`}</label>`;
const lireChemin = (o, ch) => ch.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function ecrireChemin(o, ch, v) { const ks = ch.split('.'); let x = o; ks.slice(0, -1).forEach(k => { if (x[k] == null) x[k] = /^\d+$/.test(k) ? [] : {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }
const lienFichier = f => (f ? `<a href="${fichierUrl(f)}" target="_blank" rel="noopener" class="fichier">${/pdf/.test(f.mime || f.nom) ? '📄' : /image/.test(f.mime || '') ? '🖼️' : '📁'} ${esc(f.nom || 'fichier')}</a>${f.src === 'pf' ? ' <span class="badge pf" title="Fichier du chantier dans Pipe-Fit">Pipe-Fit</span>' : ''}` : '<span class="manque">aucun fichier</span>');

Vues.doe = {
  html: p => {
    const doe = S.does.find(d => d.id === p[0]);
    if (!doe) return '<p>Dossier introuvable. <a href="#/">Retour</a></p>';
    const sec = p[1] || 'garde', a = PF.get('affaires', doe.affaireId) || {}, m = manquesDOE(doe);
    const parSection = k => m.manques.filter(x => x.section === k || (k === 's5' && x.section === 's5')).length;
    return `<div class="barre"><a href="#/" class="btn secondaire">← Dossiers</a><div class="titre-doe"><strong>${esc(a.code || '')}</strong> ${esc(doe.operation || a.nom || '')}<div class="muted petit">Lot ${esc(doe.lot || '?')} — ${esc(doe.discipline)} · indice ${esc(doe.indice)} · <span id="etat-enreg">${doe._by ? `modifié par ${esc(doe._by)}` : ''}</span></div></div>
      <span class="espace"></span><button class="secondaire" id="maj-pf" title="Reprendre les informations du chantier dans Pipe-Fit (les champs déjà saisis ne sont pas modifiés)">🔄 Reprendre depuis Pipe-Fit</button>
      <button id="generer">📄 Générer le DOE (PDF)</button></div>
      <div class="editeur"><nav class="sections">${TRAME.sections.map(([k, l]) => { const n = parSection(k); return `<a href="#/doe/${doe.id}/${k}" class="${k === sec ? 'actif' : ''}"><span>${esc(l)}</span>${n ? `<i class="pastille">${n}</i>` : '<i class="ok">✓</i>'}</a>`; }).join('')}
        <div class="progression"><div class="anneau grand" style="--p:${m.pct}"><span>${m.pct}%</span></div><div class="petit">${m.manques.length} élément(s) à compléter</div><a href="#/doe/${doe.id}/manques" class="petit">Voir la liste</a></div></nav>
      <div class="contenu">${(SECTIONS[sec] || SECTIONS.garde).html(doe, a, m)}</div></div>`;
  },
  bind: (root, p) => {
    const doe = S.does.find(d => d.id === p[0]);
    if (!doe) return;
    const sec = p[1] || 'garde';
    root.querySelectorAll('[data-ch]').forEach(el => el.onchange = () => {
      ecrireChemin(doe, el.dataset.ch, el.type === 'checkbox' ? el.checked : el.value);
      // Fin de GPA : un an après la réception, sauf si elle a été saisie à la main
      if (el.dataset.ch === 'dates.gpa') doe.dates.gpaManuel = !vide(el.value);
      if (el.dataset.ch === 'dates.reception' && !doe.dates.gpaManuel) { doe.dates.gpa = ajouterAns(el.value, 1); el.dataset.rendu = ''; }
      enregistrer(doe); if (el.dataset.rendu !== undefined) App.render();
    });
    root.querySelector('#maj-pf').onclick = async () => { await PF.charger(true); const n = prefillDepuisPF(doe); enregistrer(doe); App.render(); toast(n ? `${n} information(s) reprise(s) de Pipe-Fit` : 'Rien de nouveau dans Pipe-Fit'); };
    root.querySelector('#generer').onclick = () => genererDOE(doe);
    if (SECTIONS[sec] && SECTIONS[sec].bind) SECTIONS[sec].bind(root, doe);
  },
};

// Lignes de tableau éditables : [{ cle, lib, large }] sur un tableau d'objets ou de tableaux
function tableEditable(id, lignes, cols, opts = {}) {
  return `<table class="edit" data-table="${id}"><tr>${cols.map(c => `<th>${esc(c.lib)}</th>`).join('')}${opts.extra ? `<th>${esc(opts.extra)}</th>` : ''}<th></th></tr>
    ${lignes.map((l, i) => `<tr>${cols.map((c, j) => `<td><input data-cell="${id}.${i}.${c.cle ?? j}" value="${esc(c.cle !== undefined ? l[c.cle] : l[j])}" placeholder="${esc(c.ph || '')}"></td>`).join('')}${opts.extra ? `<td>${opts.extra2(l, i)}</td>` : ''}<td><button class="icone" data-suppr="${id}.${i}" aria-label="Retirer">✕</button></td></tr>`).join('')}</table>
    <button class="secondaire petit" data-ajout="${id}">+ Ligne</button>`;
}
function bindTables(root, doe, defs) {
  root.querySelectorAll('[data-cell]').forEach(el => el.onchange = () => { const [id, i, k] = el.dataset.cell.split('.'); defs[id]()[+i][k] = el.value; enregistrer(doe); });
  root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => { const [id, i] = b.dataset.suppr.split('.'); defs[id]().splice(+i, 1); enregistrer(doe); App.render(); });
  root.querySelectorAll('[data-ajout]').forEach(b => b.onclick = () => { const l = defs[b.dataset.ajout](); l.push(Array.isArray(l[0]) || !l.length && defs[b.dataset.ajout].tableau ? ['', '', '', ''] : {}); enregistrer(doe); App.render(); });
}
// Envoi de pièces jointes : renvoie la liste des fichiers envoyés
async function choisirFichiers(multiple = true, accept = '.pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.ifc,.xlsx,.docx,.zip') {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = multiple; inp.accept = accept;
    inp.onchange = async () => {
      const out = [];
      for (const f of inp.files) { try { toast(`Envoi de ${f.name}…`, 1500); out.push(await envoyerFichier(f)); } catch (e) { toast(`${f.name} : ${e.message}`, 6000); } }
      res(out);
    };
    inp.click();
  });
}

const SECTIONS = {};
SECTIONS.garde = {
  html: doe => `<h2>Page de garde et intervenants</h2>
    <div class="grille-champs">${champ('N° de lot', 'lot', doe.lot, { ph: 'ex. 14' })}${champ('Discipline', 'discipline', doe.discipline)}${champ('Opération', 'operation', doe.operation, { large: true })}${champ('Adresse du chantier', 'adresse', doe.adresse, { large: true })}</div>
    <h3>Intervenants</h3><div class="intervenants">${TRAME.intervenants.map(([k, l]) => { const i = doe.intervenants[k] || {}; return `<fieldset><legend>${esc(l)}${k === 'acoustique' ? ' <span class="muted petit">(si présent)</span>' : ''}</legend>
      ${champ('Raison sociale', `intervenants.${k}.raison`, i.raison)}${champ('Adresse', `intervenants.${k}.adresse`, i.adresse)}${champ('Interlocuteur', `intervenants.${k}.interlocuteur`, i.interlocuteur)}
      <div class="deux">${champ('Téléphone', `intervenants.${k}.tel`, i.tel)}${champ('E-mail', `intervenants.${k}.mail`, i.mail)}</div></fieldset>`; }).join('')}
      <fieldset class="invariant"><legend>Entreprise CVC</legend><strong>${esc(S.config.societe.raison)}</strong><div class="petit">${esc(S.config.societe.adresse)}<br>Tél. ${esc(S.config.societe.tel)} · SIRET ${esc(S.config.societe.siret)}</div><div class="muted petit">Modifiable dans Réglages.</div></fieldset></div>
    <h3>Références</h3><div class="grille-champs">${champ('Affaire BET (n° de dossier)', 'affaireBet', doe.affaireBet)}${champ('Indice CCTP', 'cctp.indice', doe.cctp.indice)}${champ('Date du CCTP', 'cctp.date', doe.cctp.date, { type: 'date' })}
      ${champ('Date de réception', 'dates.reception', doe.dates.reception, { type: 'date' })}${champ('Indice du DOE', 'indice', doe.indice)}${champ('Libellé de l\'indice', 'indiceLib', doe.indiceLib)}</div>
    <div class="actions-ligne"><button class="secondaire" id="nouvel-indice">Nouvel indice (${esc(String.fromCharCode((doe.indice || 'A').charCodeAt(0) + 1))})</button>
      ${doe.historique.length ? `<span class="muted petit">Indices précédents : ${doe.historique.map(h => `${esc(h.indice)} (${dateFr(h.date)})`).join(', ')}</span>` : ''}
      <label class="case"><input type="checkbox" data-ch="remis" ${doe.statut === 'Remis' ? 'checked' : ''}> Dossier remis au maître d'ouvrage</label></div>`,
  bind: (root, doe) => {
    root.querySelector('#nouvel-indice').onclick = async () => {
      const suiv = String.fromCharCode((doe.indice || 'A').charCodeAt(0) + 1);
      if (!await confirmer(`Passer le DOE à l'indice ${suiv} ? (l'indice ${doe.indice} est conservé dans l'historique)`, `Indice ${suiv}`)) return;
      doe.historique.push({ indice: doe.indice, libelle: doe.indiceLib, date: new Date().toISOString().slice(0, 10) });
      Object.assign(doe, { indice: suiv, indiceLib: 'Mise à jour', statut: 'En cours' }); enregistrer(doe); App.render();
    };
    const r = root.querySelector('[data-ch="remis"]');
    r.onchange = () => { Object.assign(doe, r.checked ? { statut: 'Remis', dateRemise: new Date().toISOString().slice(0, 10) } : { statut: 'En cours', dateRemise: '' }); delete doe.remis; enregistrer(doe); App.render(); };
  },
};
SECTIONS.s1 = {
  html: doe => `<h2>1. Documents administratifs</h2><h3>1.1 Identification de l'opération</h3>
    <div class="grille-champs">${champ('Phase', 'phase', doe.phase)}${champ('Date de début de chantier', 'dates.debut', doe.dates.debut, { type: 'date' })}${champ('Date de fin de travaux', 'dates.fin', doe.dates.fin, { type: 'date' })}
      ${champ('Date de réception', 'dates.reception', doe.dates.reception, { type: 'date' })}${champ('Fin de GPA (1 an)', 'dates.gpa', doe.dates.gpa, { type: 'date' })}
      ${champ('CCTP : n° de dossier', 'cctp.dossier', doe.cctp.dossier)}${champ('CCTP : BET', 'cctp.bet', doe.cctp.bet || (doe.intervenants.bet || {}).raison || '')}</div>
    <p class="muted petit">Les dates de début, de fin et de réception sont reprises de Pipe-Fit (premier et dernier pointage, PV de réception signé).</p>
    <h3>1.2 Phasage des travaux</h3>${champ('Phasage', 'phasage', doe.phasage, { zone: true, large: true })}`,
};
SECTIONS.s2 = {
  html: doe => `<h2>2. Plans de recollement</h2>
    <p class="muted">Plans des ouvrages tels qu'exécutés (PDF, DWG, IFC). Les plans déposés sur le chantier dans Pipe-Fit sont repris automatiquement ; ajoutez ici les plans de recollement définitifs.</p>
    <div class="actions-ligne"><button id="plans-ajout">+ Ajouter des plans</button></div>
    ${TRAME.sousPlans.map(([k, l]) => { const ps = doe.plans.filter(p => p.section === k); return ps.length ? `<h3>${k} ${esc(l)}</h3><table class="edit"><tr><th>N° de plan</th><th>Désignation</th><th>Échelle</th><th>Indice</th><th>Fichier</th><th>Sous-section</th><th></th></tr>
      ${ps.map(p => { const i = doe.plans.indexOf(p); return `<tr><td><input data-ch="plans.${i}.numero" value="${esc(p.numero)}" placeholder="${A_COMPLETER}" class="${vide(p.numero) ? 'a-completer' : ''}"></td><td><input data-ch="plans.${i}.designation" value="${esc(p.designation)}"></td>
        <td><input data-ch="plans.${i}.echelle" value="${esc(p.echelle)}" placeholder="1/50" style="width:70px"></td><td><input data-ch="plans.${i}.indice" value="${esc(p.indice || '')}" style="width:50px"></td><td>${lienFichier(p.fichier)}</td>
        <td><select data-ch="plans.${i}.section" data-rendu>${TRAME.sousPlans.map(([s]) => `<option ${s === p.section ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><button class="icone" data-retirer="plans.${i}">✕</button></td></tr>`; }).join('')}</table>` : ''; }).join('') || '<p class="muted">Aucun plan.</p>'}`,
  bind: (root, doe) => {
    root.querySelector('#plans-ajout').onclick = async () => { const fs = await choisirFichiers(true, '.pdf,.dwg,.dxf,.ifc,.jpg,.jpeg,.png'); fs.forEach(f => doe.plans.push({ id: uidD(), section: sousPlanDe(f.nom), numero: '', designation: f.nom.replace(/\.[a-z0-9]+$/i, ''), echelle: '', indice: '', fichier: f })); if (fs.length) { enregistrer(doe); App.render(); } };
    bindRetirer(root, doe);
  },
};
function bindRetirer(root, doe) {
  root.querySelectorAll('[data-retirer]').forEach(b => b.onclick = async () => { const [k, i] = b.dataset.retirer.split('.'); if (await confirmer('Retirer cet élément du DOE ?', 'Retirer')) { doe[k].splice(+i, 1); enregistrer(doe); App.render(); } });
}
SECTIONS.s3 = {
  html: doe => `<h2>3. Fiches techniques des équipements</h2>
    <p class="muted">Cochez les familles d'équipements réellement présentes sur le chantier (seules celles-ci figurent dans le DOE).</p>
    <div class="familles">${TRAME.familles.map(f => `<label class="case"><input type="checkbox" data-famille="${f.id}" ${doe.familles.includes(f.id) ? 'checked' : ''}> <strong>${f.id}</strong> ${esc(f.titre)}</label>`).join('')}</div>
    <div class="actions-ligne"><button class="secondaire" id="import-pf">Importer le matériel du chantier (Pipe-Fit)</button><button class="secondaire" id="fiches-ajout">+ Joindre des fiches techniques</button></div>
    ${doe.familles.slice().sort().map(fid => { const f = familleDe(fid), eqs = doe.equipements.map((e, i) => ({ e, i })).filter(x => x.e.famille === fid), fiches = doe.fiches.map((x, i) => ({ x, i })).filter(y => y.x.famille === fid);
      return `<div class="famille"><h3>${fid} ${esc(f.titre)}</h3>
        ${eqs.map(({ e, i }) => `<details class="equipement" ${vide(e.repere) || vide(e.serie) ? 'open' : ''}><summary><strong>${esc(e.repere || 'Repère ?')}</strong> ${esc(e.designation || '')} ${esc([e.marque, e.reference].filter(Boolean).join(' '))}${e.quantite ? ` <span class="muted">× ${esc(e.quantite)}</span>` : ''}${['repere', 'marque', 'reference', 'serie'].some(k => vide(e[k])) ? ' <span class="badge">à compléter</span>' : ''}</summary>
          <div class="grille-champs">${champ('Repère', `equipements.${i}.repere`, e.repere)}${champ('Désignation', `equipements.${i}.designation`, e.designation)}${champ('Marque', `equipements.${i}.marque`, e.marque)}${champ('Référence', `equipements.${i}.reference`, e.reference)}
            ${champ('N° de série', `equipements.${i}.serie`, e.serie)}${champ('Quantité', `equipements.${i}.quantite`, e.quantite, { ph: '' })}${champ('Localisation', `equipements.${i}.localisation`, e.localisation)}
            ${f.champs.map((c, j) => champ(c, `equipements.${i}.champs.${j}`, (e.champs || [])[j])).join('')}
            ${champ('Durée de garantie constructeur', `equipements.${i}.garantie`, e.garantie, { ph: 'ex. 2 ans' })}${champ('Contact SAV', `equipements.${i}.sav`, e.sav)}</div>
          <div class="actions-ligne"><span class="muted petit">${esc((e.origines || []).join(', '))}</span><span class="espace"></span><button class="icone" data-retirer="equipements.${i}">Retirer</button></div></details>`).join('') || '<p class="muted">Aucun équipement.</p>'}
        <button class="secondaire petit" data-eq-ajout="${fid}">+ Équipement</button>
        <h4>Fiches techniques jointes (annexe B)</h4><ul class="pieces">${fiches.map(({ x, i }) => `<li>${lienFichier(x.fichier)} <input data-ch="fiches.${i}.designation" value="${esc(x.designation)}"><button class="icone" data-retirer="fiches.${i}">✕</button></li>`).join('') || '<li class="manque">Aucune fiche technique</li>'}</ul></div>`; }).join('')}
    ${doe.fiches.some(x => !x.famille || !doe.familles.includes(x.famille)) ? `<h3>Fiches techniques à classer</h3><ul class="pieces">${doe.fiches.map((x, i) => ({ x, i })).filter(y => !y.x.famille || !doe.familles.includes(y.x.famille)).map(({ x, i }) => `<li>${lienFichier(x.fichier)} ${esc(x.designation)} <select data-ch="fiches.${i}.famille" data-rendu><option value="">Famille…</option>${doe.familles.map(f => `<option>${f}</option>`).join('')}</select></li>`).join('')}</ul>` : ''}`,
  bind: (root, doe) => {
    root.querySelectorAll('[data-famille]').forEach(cb => cb.onchange = () => { const f = cb.dataset.famille; doe.familles = cb.checked ? [...new Set([...doe.familles, f])] : doe.familles.filter(x => x !== f); enregistrer(doe); App.render(); });
    root.querySelectorAll('[data-eq-ajout]').forEach(b => b.onclick = () => { doe.equipements.push({ id: uidD(), famille: b.dataset.eqAjout, repere: '', designation: '', marque: '', reference: '', serie: '', quantite: '', localisation: '', champs: [], garantie: '', sav: '' }); enregistrer(doe); App.render(); });
    root.querySelector('#fiches-ajout').onclick = async () => { const fs = await choisirFichiers(true, '.pdf,.jpg,.jpeg,.png'); fs.forEach(f => doe.fiches.push({ id: uidD(), famille: doe.familles.length === 1 ? doe.familles[0] : '', designation: f.nom.replace(/\.[a-z0-9]+$/i, ''), fichier: f })); if (fs.length) { enregistrer(doe); App.render(); } };
    root.querySelector('#import-pf').onclick = () => importerMateriel(doe);
    bindRetirer(root, doe);
  },
};
// Import du matériel prévu / commandé du chantier vers la section 3
function importerMateriel(doe) {
  const liste = fournituresPF(doe.affaireId), deja = new Set(doe.equipements.map(e => e.cle).filter(Boolean));
  const box = Modal.open(`<h2>Matériel du chantier dans Pipe-Fit</h2><p class="muted petit">Fournitures du devis accepté et des commandes. Cochez les équipements à décrire dans le DOE (robinetterie, pompes, appareils…), puis choisissez leur famille.</p>
    <div class="defile"><table class="liste"><tr><th></th><th>Fourniture</th><th>Origine</th><th>Famille DOE</th></tr>
    ${liste.map((x, i) => `<tr class="${deja.has(x.cle) ? 'muted' : ''}"><td><input type="checkbox" data-imp="${i}" ${deja.has(x.cle) ? 'disabled' : x.familleDOE && x.familleDOE !== '3.8' ? 'checked' : ''}></td><td>${esc(x.designation)} <span class="muted petit">${esc(x.ref)}</span>${x.qte ? `<div class="petit">${String(Math.round(x.qte * 100) / 100).replace('.', ',')} ${esc(x.unite || '')}</div>` : ''}</td>
      <td class="petit">${esc(x.origines.join(', '))}${x.fournisseur ? `<br>${esc(x.fournisseur)}` : ''}</td><td><select data-fam="${i}">${TRAME.familles.map(f => `<option value="${f.id}" ${f.id === (x.familleDOE || '3.7') ? 'selected' : ''}>${f.id} ${esc(f.titre.slice(0, 32))}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucune fourniture dans Pipe-Fit pour ce chantier.</td></tr>'}</table></div>
    <div class="actions"><button class="secondaire" id="imp-x">Annuler</button><button id="imp-ok">Importer</button></div>`);
  box.querySelector('#imp-x').onclick = Modal.close;
  box.querySelector('#imp-ok').onclick = () => {
    let n = 0;
    box.querySelectorAll('[data-imp]:checked').forEach(cb => {
      const x = liste[+cb.dataset.imp], fam = box.querySelector(`[data-fam="${cb.dataset.imp}"]`).value;
      doe.equipements.push({ id: uidD(), cle: x.cle, famille: fam, repere: '', designation: x.designation, marque: '', reference: x.ref, serie: '', quantite: x.qte ? String(Math.round(x.qte * 100) / 100).replace('.', ',') + (x.unite ? ` ${x.unite}` : '') : '', localisation: '', champs: [], garantie: '', sav: '', origines: x.origines.map(o => `Pipe-Fit : ${o}`).concat(x.fournisseur ? [`fournisseur ${x.fournisseur}`] : []) });
      if (!doe.familles.includes(fam)) doe.familles.push(fam);
      n++;
    });
    Modal.close(); enregistrer(doe); App.render(); toast(`${n} équipement(s) importé(s)`);
  };
}
// Listes de contrôle (5, 6, 8.2) : N° · Document · Présent, avec pièces jointes
function controlesHtml(doe, cles) {
  return cles.map(k => { const c = TRAME.controles[k], items = itemsControle(doe, k);
    return `<h3>${k} ${esc(c.titre)} <span class="muted petit">annexe ${c.annexe}</span></h3><table class="edit controle"><tr><th>N°</th><th>Document / pièce</th><th>Présent</th><th>Pièces jointes</th><th></th></tr>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td><input data-ctl="${k}.${i}.libelle" value="${esc(it.libelle)}"></td><td><input type="checkbox" data-ctl="${k}.${i}.present" ${presentCtl(doe, k, it) ? 'checked' : ''} ${(it.fichiers || []).length || couvertParPF(doe, k, it.libelle) ? 'disabled' : ''} title="Cochez si la pièce est fournie (papier) sans fichier">${couvertParPF(doe, k, it.libelle) ? ' <span class="muted petit">Pipe-Fit</span>' : ''}</td>
        <td>${(it.fichiers || []).map((f, j) => `<div>${lienFichier(f)} <button class="icone" data-ctl-sup="${k}.${i}.${j}">✕</button></div>`).join('')}<button class="secondaire petit" data-ctl-joindre="${k}.${i}">Joindre</button></td><td><button class="icone" data-ctl-ret="${k}.${i}">✕</button></td></tr>`).join('')}</table>
      <button class="secondaire petit" data-ctl-ajout="${k}">+ Pièce</button>`; }).join('');
}
const itemsControle = (doe, k) => { if (!doe.controles[k]) doe.controles[k] = TRAME.controles[k].items.map(l => ({ libelle: l, present: false, fichiers: [] })); return doe.controles[k]; };
function bindControles(root, doe) {
  root.querySelectorAll('[data-ctl]').forEach(el => el.onchange = () => { const [k, k2, i, c] = el.dataset.ctl.split('.'); itemsControle(doe, `${k}.${k2}`)[+i][c] = el.type === 'checkbox' ? el.checked : el.value; enregistrer(doe); App.render(); });
  root.querySelectorAll('[data-ctl-joindre]').forEach(b => b.onclick = async () => { const [k, k2, i] = b.dataset.ctlJoindre.split('.'); const fs = await choisirFichiers(true, '.pdf,.jpg,.jpeg,.png,.xlsx,.docx'); const it = itemsControle(doe, `${k}.${k2}`)[+i]; it.fichiers = [...(it.fichiers || []), ...fs]; if (fs.length) { enregistrer(doe); App.render(); } });
  root.querySelectorAll('[data-ctl-sup]').forEach(b => b.onclick = () => { const [k, k2, i, j] = b.dataset.ctlSup.split('.'); itemsControle(doe, `${k}.${k2}`)[+i].fichiers.splice(+j, 1); enregistrer(doe); App.render(); });
  root.querySelectorAll('[data-ctl-ret]').forEach(b => b.onclick = () => { const [k, k2, i] = b.dataset.ctlRet.split('.'); itemsControle(doe, `${k}.${k2}`).splice(+i, 1); enregistrer(doe); App.render(); });
  root.querySelectorAll('[data-ctl-ajout]').forEach(b => b.onclick = () => { itemsControle(doe, b.dataset.ctlAjout).push({ libelle: '', present: false, fichiers: [] }); enregistrer(doe); App.render(); });
}
SECTIONS.s5 = { html: doe => `<h2>5. Rapports de mise en service</h2><p class="muted">Joignez les PV signés par le technicien et le responsable de chantier. Une pièce jointe coche « Présent » automatiquement.</p>${controlesHtml(doe, controlesActifs(doe).filter(k => k[0] === '5'))}`, bind: bindControles };
SECTIONS.s6 = { html: doe => `<h2>6. Essais, contrôles et mesures</h2>${controlesHtml(doe, controlesActifs(doe).filter(k => k[0] === '6'))}`, bind: bindControles };
SECTIONS.s7 = {
  html: doe => `<h2>7. Maintenance et exploitation</h2><h3>7.1 Carnet de maintenance préventive</h3>
    ${tableEditable('maintenance', doe.maintenance, [{ lib: 'Équipement' }, { lib: 'Opération' }, { lib: 'Fréquence' }, { lib: 'Intervenant' }])}
    <button class="secondaire petit" id="maint-auto">Proposer selon les familles d'équipements</button>
    <h3>7.2 Notices d'exploitation</h3><ul class="pieces">${doe.notices.map((n, i) => `<li>${lienFichier(n.fichier)} <input data-ch="notices.${i}.libelle" value="${esc(n.libelle)}"><button class="icone" data-retirer="notices.${i}">✕</button></li>`).join('') || '<li class="manque">Aucune notice</li>'}</ul>
    <button class="secondaire petit" id="notice-ajout">+ Joindre des notices</button>
    <h3>7.3 Pièces de rechange recommandées</h3>${tableEditable('pieces', doe.pieces, [{ lib: 'Équipement' }, { lib: 'Pièce' }, { lib: 'Référence constructeur' }, { lib: 'Qté min.' }])}`,
  bind: (root, doe) => {
    bindTables(root, doe, { maintenance: Object.assign(() => doe.maintenance, { tableau: true }), pieces: Object.assign(() => doe.pieces, { tableau: true }) });
    root.querySelector('#maint-auto').onclick = () => { const deja = new Set(doe.maintenance.map(l => `${l[0]}|${l[1]}`)); let n = 0; doe.familles.forEach(f => (TRAME.maintenance[f] || []).forEach(l => { if (!deja.has(`${l[0]}|${l[1]}`)) { doe.maintenance.push([...l]); n++; } })); enregistrer(doe); App.render(); toast(`${n} opération(s) ajoutée(s)`); };
    root.querySelector('#notice-ajout').onclick = async () => { const fs = await choisirFichiers(true, '.pdf,.docx'); fs.forEach(f => doe.notices.push({ id: uidD(), libelle: f.nom.replace(/\.[a-z0-9]+$/i, ''), fichier: f })); if (fs.length) { enregistrer(doe); App.render(); } };
    bindRetirer(root, doe);
  },
};
SECTIONS.s8 = {
  html: doe => `<h2>8. Formation des exploitants</h2><h3>8.1 Programme de formation</h3>${tableEditable('formation', doe.formation, [{ lib: 'Module' }, { lib: 'Contenu' }, { lib: 'Durée' }, { lib: 'Formateur', ph: A_COMPLETER }])}${controlesHtml(doe, ['8.2'])}`,
  bind: (root, doe) => { bindTables(root, doe, { formation: Object.assign(() => doe.formation, { tableau: true }) }); bindControles(root, doe); },
};
SECTIONS.s9 = {
  html: doe => { const rec = doe.dates.reception;
    return `<h2>9. Garanties et assurances</h2><h3>9.1 Garanties contractuelles</h3>${rec ? '' : '<p class="manque">Renseignez la date de réception (section 1) pour calculer les échéances.</p>'}
      <table class="liste"><tr><th>Type</th><th>Durée</th><th>Début</th><th>Fin</th><th>Prestataire</th></tr>${TRAME.garanties.map(([t, n]) => `<tr><td>${esc(t)}</td><td>${n} an${n > 1 ? 's' : ''}</td><td>${dateFr(rec) || A_COMPLETER}</td><td>${dateFr(ajouterAns(rec, n)) || A_COMPLETER}</td><td>${esc(S.config.societe.raison)}</td></tr>`).join('')}</table>
      <h3>9.2 Garanties constructeurs</h3><p class="muted petit">Reprises des équipements (section 3).</p>
      <table class="edit"><tr><th>Équipement</th><th>Marque / référence</th><th>N° de série</th><th>Durée de garantie</th><th>Contact SAV</th></tr>
      ${doe.equipements.map((e, i) => ({ e, i })).filter(x => doe.familles.includes(x.e.famille)).map(({ e, i }) => `<tr><td>${esc(e.repere || e.designation)}</td><td>${esc([e.marque, e.reference].filter(Boolean).join(' '))}</td><td>${esc(e.serie || A_COMPLETER)}</td>
        <td><input data-ch="equipements.${i}.garantie" value="${esc(e.garantie)}" placeholder="${A_COMPLETER}"></td><td><input data-ch="equipements.${i}.sav" value="${esc(e.sav)}" placeholder="${A_COMPLETER}"></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun équipement.</td></tr>'}</table>`; },
};
SECTIONS.s10 = {
  html: doe => { const ann = annexesDOE(doe);
    return `<h2>10. Annexes</h2><p class="muted">Calculées d'après les pièces jointes du dossier. Les PDF et images sont intégrés au DOE assemblé ; les autres formats (DWG, IFC, Excel…) sont listés et fournis en fichiers numériques.</p>
      ${ann.map(a => `<h3>Annexe ${a.lettre} — ${esc(a.titre)}</h3><table class="liste"><tr><th>N°</th><th>Document / pièce</th><th>Présent</th><th>Intégré au PDF</th></tr>${a.pieces.map((p, i) => `<tr><td>${a.lettre}${String(i + 1).padStart(2, '0')}</td><td>${p.fichier ? lienFichier(p.fichier) : esc(p.libelle)}</td><td>${p.present ? '☒' : '☐'}</td><td>${p.fichier ? (integrable(p.fichier) ? 'oui' : '<span class="muted">fichier numérique</span>') : p.genere ? 'page générée' : '—'}</td></tr>`).join('')}</table>`).join('')}
      <label class="case"><input type="checkbox" data-ch="sansPV" ${doe.sansPV ? 'checked' : ''} data-rendu> Ne pas joindre le PV de réception et la levée des réserves (annexe R)</label>`; },
};
SECTIONS.signatures = {
  html: doe => `<h2>Signatures de remise du DOE</h2><div class="grille-champs">${champ(`Fait à ${S.config.lieu}, le`, 'signatures.date', doe.signatures.date, { type: 'date' })}</div>
    <table class="liste"><tr><th>Signataire</th><th>Nom, cachet, signature, date</th></tr>${signatairesDOE(doe).map(s => `<tr><td>${esc(s)}</td><td class="muted">(sur le document imprimé)</td></tr>`).join('')}</table>`,
};
SECTIONS.manques = {
  html: (doe, a, m) => `<h2>À compléter <span class="compte">${m.manques.length}</span></h2>${m.manques.length ? `<ul class="manques">${TRAME.sections.map(([k, l]) => { const ms = m.manques.filter(x => x.section === k); return ms.length ? `<li><a href="#/doe/${doe.id}/${k}"><strong>${esc(l)}</strong></a><ul>${ms.map(x => `<li>${esc(x.libelle)}</li>`).join('')}</ul></li>` : ''; }).join('')}</ul>` : '<p>🎉 Rien à compléter : le dossier est prêt à être généré.</p>'}`,
};
const signatairesDOE = doe => [`Entreprise CVC lot n° ${doe.lot || '…'} — ${S.config.societe.raison}`, 'Maître d\'ouvrage', 'BET Fluides', 'Maître d\'œuvre', 'Bureau de contrôle (visa de contrôle)'];
const integrable = f => /pdf|image\/(jpeg|png)/.test(f.mime || '') || /\.(pdf|jpe?g|png)$/i.test(f.nom || '');

// Annexes : lettre, titre, pièces (fichier ou page générée)
function annexesDOE(doe) {
  // Pièce couverte seulement par Pipe-Fit : remplacée par les PV générés (listés plus bas dans la même annexe)
  const piecesCtl = lettre => [...controlesActifs(doe), '8.2'].filter(k => TRAME.controles[k].annexe === lettre)
    .map(k => [k, doe.controles[k] || TRAME.controles[k].items.map(l => ({ libelle: l, present: false, fichiers: [] }))])
    .flatMap(([k, items]) => items.flatMap(it => ((it.fichiers || []).length ? it.fichiers.map(f => ({ libelle: it.libelle, fichier: f, present: true }))
      : !it.present && couvertParPF(doe, k, it.libelle) ? [] : [{ libelle: it.libelle, present: !!it.present }])));
  const pf = piecesPF(doe);
  const coupeFeu = piecesCtl('G').filter(p => /coupe-feu/i.test(p.libelle));
  const out = [
    { lettre: 'A', titre: 'Plans de recollement', pieces: doe.plans.map(p => ({ libelle: `${p.numero || ''} ${p.designation}`, fichier: p.fichier, present: !!p.fichier })) },
    { lettre: 'B', titre: 'Fiches techniques constructeurs et notices', pieces: [...doe.fiches.filter(f => f.visa !== 'Refusée').slice().sort((x, y) => (x.famille || '9').localeCompare(y.famille || '9')).map(f => ({ libelle: f.designation, fichier: f.fichier, present: true })), ...doe.notices.map(n => ({ libelle: n.libelle, fichier: n.fichier, present: true }))] },
    { lettre: 'C', titre: 'Notes de calcul', pieces: (doe.notesCalcul || []).map(x => ({ libelle: x.libelle, fichier: x.fichier, present: true })) },
    { lettre: 'F', titre: 'Rapports de mise en service', pieces: [...piecesCtl('F'), ...pf.F] },
    { lettre: 'G', titre: 'Essais, contrôles et mesures', pieces: [...piecesCtl('G').filter(p => !coupeFeu.includes(p)), ...pf.G] },
    { lettre: 'H', titre: 'Formation des exploitants', pieces: piecesCtl('H') },
    { lettre: 'O', titre: 'Attestation de rebouchage coupe-feu', pieces: coupeFeu },
  ];
  const r = receptionPF(doe.affaireId);
  if (!doe.sansPV && (r.pv.length || r.reserves.length)) out.push({ lettre: 'R', titre: 'PV de réception et levée des réserves', pieces: [{ libelle: `PV de réception ${r.pv.map(p => p.numero).join(', ')} et état des réserves (${r.reserves.length})`, present: true, genere: true }] });
  return out.filter(a => a.pieces.length);
}

/* ---------- Réglages ---------- */
Vues.reglages = {
  html: () => { const c = S.config, admin = S.me.role === 'admin', dis = admin ? '' : 'disabled';
    return `<h1>Réglages</h1>${admin ? '' : '<p class="muted">Réservé à l\'administrateur.</p>'}
    <div class="carte"><h2>Entreprise (pièces du DOE)</h2><div class="grille-champs">${[['raison', 'Raison sociale'], ['activite', 'Activité'], ['adresse', 'Adresse'], ['tel', 'Téléphone'], ['siret', 'SIRET'], ['ape', 'Code APE'], ['qualibat', 'Qualibat'], ['email', 'E-mail']]
      .map(([k, l]) => `<label>${l}<input data-cfg="societe.${k}" value="${esc(c.societe[k])}" ${dis} placeholder="${A_COMPLETER}"></label>`).join('')}
      <label>Lieu de signature (« Fait à … »)<input data-cfg="lieu" value="${esc(c.lieu)}" ${dis}></label><label>Couleur de la charte<input data-cfg="couleur" type="color" value="${esc(c.couleur)}" ${dis}></label>
      <label>Lot par défaut<input data-cfg="lotDefaut" value="${esc(c.lotDefaut)}" ${dis}></label><label>Discipline par défaut<input data-cfg="disciplineDefaut" value="${esc(c.disciplineDefaut)}" ${dis}></label></div>
      <div class="actions-ligne"><img src="${c.logoFichierId ? fichierUrl({ src: 'doe', id: c.logoFichierId }) : 'logo-tecnitub.png'}" alt="Logo" class="logo-apercu">${admin ? '<button class="secondaire" id="logo">Changer le logo</button>' : ''}</div></div>`; },
  bind: root => {
    root.querySelectorAll('[data-cfg]').forEach(el => el.onchange = async () => { const c = JSON.parse(JSON.stringify(S.config)); ecrireChemin(c, el.dataset.cfg, el.value); S.config = await api('PUT', '/api/config', c); toast('Réglages enregistrés'); });
    const l = root.querySelector('#logo');
    if (l) l.onclick = async () => { const [f] = await choisirFichiers(false, '.png,.jpg,.jpeg'); if (f) { S.config = await api('PUT', '/api/config', { ...S.config, logoFichierId: f.id }); App.render(); } };
  },
};

/* ---------- Démarrage ---------- */
async function demarrer() {
  try { S.me = await api('GET', '/api/me'); } catch (e) { return ecranConnexion(e.status === 401 ? '' : e.message); }
  document.body.classList.remove('deconnecte');
  document.getElementById('qui').textContent = S.me.nom || S.me.login;
  document.getElementById('deconnexion').onclick = async () => { await api('POST', '/api/logout', {}).catch(() => {}); location.reload(); };
  const pf = S.me.pipefit || (!window.PIPEFIT_CRM_KEY && /^https?:$/.test(location.protocol) ? `${location.protocol}//${location.hostname}:3000` : '');
  if (pf) { const a = document.getElementById('lien-pf'); a.href = pf; a.hidden = false; if (window.PIPEFIT_CRM_URL) a.removeAttribute('target'); }
  document.getElementById('app').innerHTML = '<p class="muted">Chargement des chantiers Pipe-Fit…</p>';
  try { [S.config, S.does] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/does'), PF.charger()]); }
  catch (e) { document.getElementById('app').innerHTML = `<p class="erreur">${esc(e.message)}</p>`; return; }
  App.render();
  window.addEventListener('hashchange', () => { Modal.close(); App.render(); });
}
document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
demarrer();
