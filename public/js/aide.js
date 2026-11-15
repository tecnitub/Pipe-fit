// Guide d'utilisation intégré, commun au CRM, à Études et au DOE (servi aux deux dernières par /shared/aide.js) :
// - aide de l'écran courant dans un panneau latéral (plein écran sur téléphone) : à quoi sert l'écran, actions
//   principales, pièges fréquents, écrans liés ; ouverte par le bouton « ? Aide » de l'en-tête, F1 ou « ? » ;
// - recherche en texte intégral dans toute l'aide de l'application (sans accents ni majuscules) ;
// - parcours de démarrage par profil : élément de l'écran mis en évidence et bulle (suivante, précédente, passer),
//   relançable depuis l'aide, mémorisé comme vu par utilisateur (navigateur, et préférences du compte si l'application
//   en fournit), proposé une fois à la première connexion — jamais sous un navigateur piloté (tests de bout en bout,
//   navigator.webdriver), ni dans un cadre, ni avec window.AIDE_SANS_PARCOURS, « ?aide=0 » ou pf-aide-auto = 0.
// Le contenu est propre à chaque application (aide-contenu.js, AideContenu) ; ce moteur n'en connaît que la structure :
//   { app, nom, rubriques: [{ id, titre, route?, but, actions: [], pieges: [], liens: [id], motsCles? }],
//     ecran(hash, { modale }) → id de rubrique, parcours: [{ id, titre, profil, acces?(utilisateur), etapes: [{ route?, cible?, titre, texte }] }],
//     profil(utilisateur) → id du parcours proposé, utilisateur() → { id, role } | null, prefs?: { lire(), ecrire(etat) } }
// Fonctions pures (normaliser, rechercher, rubriqueDe) testées sous Node.
const Aide = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normaliser = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  const textes = r => [r.titre, r.but, ...(r.actions || []), ...(r.pieges || []), r.motsCles || ''];

  /* ---------- Recherche (fonction pure) ---------- */
  // Tous les mots (2 lettres et plus) doivent figurer dans la rubrique ; le titre et les mots-clés comptent davantage.
  // Extrait : la première phrase de la rubrique qui contient un des mots.
  function rechercher(contenu, q) {
    const mots = [...new Set(normaliser(q).split(/[^a-z0-9]+/).filter(m => m.length >= 2))];
    if (!mots.length || !contenu) return [];
    return (contenu.rubriques || []).map(r => {
      const morceaux = textes(r).filter(Boolean), corps = normaliser(morceaux.join(' \n '));
      if (!mots.every(m => corps.includes(m))) return null;
      const titre = normaliser(r.titre), cles = normaliser(r.motsCles || '');
      const score = mots.reduce((s, m) => s + (titre.includes(m) ? 10 : 0) + (cles.includes(m) ? 4 : 0) + corps.split(m).length - 1, 0);
      const extrait = morceaux.slice(1).find(t => mots.some(m => normaliser(t).includes(m))) || r.but || '';
      return { id: r.id, titre: r.titre, score, extrait: extrait.length > 180 ? `${extrait.slice(0, 177)}…` : extrait };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.titre.localeCompare(b.titre, 'fr'));
  }
  // Rubrique de l'écran : celle donnée par le contenu, sinon la première
  function rubriqueDe(contenu, hash, ctx = {}) {
    if (!contenu) return null;
    let id = '';
    try { id = contenu.ecran(String(hash || ''), ctx) || ''; } catch (e) { id = ''; }
    return (contenu.rubriques || []).find(r => r.id === id) || (contenu.rubriques || [])[0] || null;
  }

  if (typeof document === 'undefined') return { normaliser, rechercher, rubriqueDe, configurer() {} };

  /* ---------- Navigateur ---------- */
  let C = null, panneau = null, ouvreur = null, rubriqueVue = '', parcours = null, proposeA = '';
  const mobile = () => matchMedia('(max-width: 720px)').matches;
  const $ = id => document.getElementById(id);
  const rubrique = id => ((C && C.rubriques) || []).find(r => r.id === id);
  const essai = (f, d) => { try { return f(); } catch (e) { return d; } };
  const utilisateur = () => (C ? essai(() => C.utilisateur(), null) : null);
  const modaleOuverte = () => {
    const m = $('modal');
    if (!m || m.hidden || m.classList.contains('hidden')) return '';
    const h = m.querySelector('h2'); return h ? h.textContent.trim() : '';
  };
  const ecranCourant = () => rubriqueDe(C, location.hash, { modale: modaleOuverte() });

  // État « vu » : navigateur (par application et par compte), plus les préférences du compte quand elles existent
  const cleEtat = () => { const u = utilisateur(); return `pf-aide:${C ? C.app : ''}:${u ? u.id || u.login || '' : ''}`; };
  function lireEtat() {
    let e = {};
    try { e = JSON.parse(localStorage.getItem(cleEtat()) || '{}') || {}; } catch (er) { e = {}; }
    const s = C && C.prefs ? essai(() => C.prefs.lire(), null) : null;
    return { vus: [...new Set([...(e.vus || []), ...((s && s.vus) || [])])], propose: !!(e.propose || (s && s.propose)) };
  }
  function ecrireEtat(maj) {
    const e = { ...lireEtat(), ...maj };
    try { localStorage.setItem(cleEtat(), JSON.stringify(e)); } catch (er) { /* navigation privée : gardé pour la session */ }
    if (C && C.prefs) essai(() => C.prefs.ecrire(e));
    return e;
  }
  const marquerVu = id => ecrireEtat({ vus: [...new Set([...lireEtat().vus, id])] });
  const autoDesactive = () => !!(navigator.webdriver || window.AIDE_SANS_PARCOURS || window.parent !== window || /[?&]aide=0\b/.test(location.search)
    || essai(() => localStorage.getItem('pf-aide-auto') === '0', false));

  /* ---------- Panneau d'aide ---------- */
  function creerPanneau() {
    if (panneau) return panneau;
    panneau = document.createElement('aside');
    panneau.id = 'aide-panneau';
    panneau.className = 'aide-panneau no-print';
    panneau.setAttribute('role', 'dialog');
    panneau.setAttribute('aria-labelledby', 'aide-titre');
    panneau.hidden = true;
    panneau.innerHTML = `<div class="aide-tete"><h2 id="aide-titre" tabindex="-1">❓ Aide</h2><button type="button" class="aide-fermer" id="aide-fermer" aria-label="Fermer l'aide" title="Fermer (Échap)">✕</button></div>
      <div class="aide-cherche"><input type="search" id="aide-q" placeholder="Rechercher dans l'aide…" aria-label="Rechercher dans l'aide" autocomplete="off"></div>
      <p class="aide-nb" id="aide-nb" aria-live="polite"></p>
      <div class="aide-corps" id="aide-corps"></div>`;
    document.body.appendChild(panneau);
    panneau.querySelector('#aide-fermer').onclick = () => fermer();
    const q = panneau.querySelector('#aide-q');
    q.oninput = () => rendre();
    q.onkeydown = e => { if (e.key === 'Enter') { const b = panneau.querySelector('[data-aide-rub]'); if (b) b.click(); } };
    panneau.addEventListener('click', e => {
      const r = e.target.closest('[data-aide-rub]');
      if (r) { rubriqueVue = r.dataset.aideRub; panneau.querySelector('#aide-q').value = ''; rendre(); panneau.querySelector('#aide-corps').scrollTop = 0; focusTitre(); return; }
      if (e.target.closest('[data-aide-retour]')) { rubriqueVue = ''; rendre(); focusTitre(); return; }
      const p = e.target.closest('[data-aide-parcours]');
      if (p) { lancerParcours(p.dataset.aideParcours); return; }
      // Lien vers un écran : sur téléphone, l'aide se ferme pour laisser voir l'écran
      if (e.target.closest('a[href^="#"]') && mobile()) fermer(false);
    });
    panneau.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); return; }
      // Plein écran (téléphone) : le focus reste dans l'aide
      if (e.key === 'Tab' && mobile()) {
        const f = [...panneau.querySelectorAll('button, a[href], input, [tabindex="0"]')].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    return panneau;
  }
  const focusTitre = () => { const t = panneau && panneau.querySelector('#aide-titre'); if (t) t.focus({ preventScroll: true }); };
  const liste = (titre, l, cls) => (l && l.length ? `<h4>${titre}</h4><ul class="${cls}">${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  function rubriqueHtml(r, courante) {
    const liens = (r.liens || []).map(rubrique).filter(Boolean);
    return `<article class="aide-rub" aria-labelledby="aide-rub-titre">
      ${courante ? '<p class="aide-sur">Cet écran</p>' : '<button type="button" class="aide-lien" data-aide-retour>← Aide de cet écran</button>'}
      <h3 id="aide-rub-titre">${esc(r.titre)}</h3>
      ${r.but ? `<p class="aide-but">${esc(r.but)}</p>` : ''}
      ${!courante && r.route ? `<p><a class="aide-aller" href="${esc(r.route)}">Ouvrir cet écran →</a></p>` : ''}
      ${liste('Actions principales', r.actions, 'aide-actions')}
      ${liste('⚠️ Pièges fréquents', r.pieges, 'aide-pieges')}
      ${liens.length ? `<h4>Écrans liés</h4><ul class="aide-liens">${liens.map(x => `<li><button type="button" class="aide-lien" data-aide-rub="${esc(x.id)}">${esc(x.titre)}</button>${x.route ? ` <a href="${esc(x.route)}" class="aide-aller" aria-label="Ouvrir l'écran ${esc(x.titre)}">ouvrir →</a>` : ''}</li>`).join('')}</ul>` : ''}
    </article>`;
  }
  function parcoursHtml() {
    const l = (C && C.parcours) || [];
    if (!l.length) return '';
    const u = utilisateur(), reco = u ? essai(() => C.profil(u), '') : '', vus = lireEtat().vus;
    // Parcours ouverts à ce compte (ex. : « Mettre en place » réservé à l'administrateur), le conseillé en premier
    const tri = l.filter(p => !p.acces || !u || essai(() => p.acces(u), true)).sort((a, b) => (b.id === reco) - (a.id === reco));
    return `<section class="aide-decouvrir" aria-labelledby="aide-dec-titre"><h4 id="aide-dec-titre">🧭 Parcours de démarrage</h4>
      <ul class="aide-parcours">${tri.map(p => `<li><button type="button" class="aide-lien" data-aide-parcours="${esc(p.id)}">▶ ${esc(p.titre)}</button>
        <span class="aide-meta">${esc(p.profil)} · ${p.etapes.length} étapes${p.id === reco ? ' · <strong>conseillé pour vous</strong>' : ''}${vus.includes(p.id) ? ' · ✓ déjà vu' : ''}</span></li>`).join('')}</ul></section>`;
  }
  function rendre() {
    if (!panneau || panneau.hidden || !C) return;
    const q = panneau.querySelector('#aide-q').value.trim(), corps = panneau.querySelector('#aide-corps'), nb = panneau.querySelector('#aide-nb');
    panneau.querySelector('#aide-titre').textContent = `❓ Aide · ${C.nom}`;
    if (q) {
      const r = rechercher(C, q);
      nb.textContent = r.length ? `${r.length} rubrique${r.length > 1 ? 's' : ''} trouvée${r.length > 1 ? 's' : ''}` : 'Aucune rubrique ne contient ces mots.';
      corps.innerHTML = r.length ? `<ul class="aide-resultats">${r.map(x => `<li><button type="button" class="aide-resultat" data-aide-rub="${esc(x.id)}"><strong>${esc(x.titre)}</strong><span>${esc(x.extrait)}</span></button></li>`).join('')}</ul>`
        : '<p class="aide-vide">Essayez un autre mot (ex. : « devis », « réserve », « QR », « armoire »).</p>';
      return;
    }
    nb.textContent = '';
    const cour = ecranCourant(), r = (rubriqueVue && rubrique(rubriqueVue)) || cour;
    const autres = (C.rubriques || []).filter(x => x !== r);
    corps.innerHTML = `${r ? rubriqueHtml(r, r === cour) : ''}${parcoursHtml()}
      <details class="aide-index"><summary>Toutes les rubriques (${C.rubriques.length})</summary><ul>${autres.map(x => `<li><button type="button" class="aide-lien" data-aide-rub="${esc(x.id)}">${esc(x.titre)}</button></li>`).join('')}</ul></details>`;
  }
  function ouvrir(id) {
    if (!C) return;
    creerPanneau();
    if (panneau.hidden) ouvreur = document.activeElement;
    rubriqueVue = id && rubrique(id) ? id : '';
    panneau.hidden = false;
    panneau.setAttribute('aria-modal', mobile() ? 'true' : 'false');
    document.body.classList.add('aide-ouverte');
    const b = $('aide-bouton'); if (b) b.setAttribute('aria-expanded', 'true');
    rendre();
    focusTitre();
  }
  function fermer(rendreFocus = true) {
    if (!panneau || panneau.hidden) return;
    panneau.hidden = true;
    document.body.classList.remove('aide-ouverte');
    const b = $('aide-bouton'); if (b) b.setAttribute('aria-expanded', 'false');
    if (rendreFocus) { const o = ouvreur && document.contains(ouvreur) ? ouvreur : b; if (o && o.focus) o.focus(); }
    ouvreur = null;
  }
  const basculer = () => (panneau && !panneau.hidden ? fermer() : ouvrir());

  /* ---------- Parcours de démarrage ---------- */
  const visible = el => { if (!el || !el.getClientRects().length) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const trouver = sel => { if (!sel) return null; for (const s of [].concat(sel)) { const el = essai(() => [...document.querySelectorAll(s)].find(visible), null); if (el) return el; } return null; };
  const attendre = (sel, ms) => new Promise(res => {
    const t0 = Date.now();
    const tour = () => { const el = trouver(sel); if (el || Date.now() - t0 > ms) res(el); else setTimeout(tour, 80); };
    tour();
  });
  function lancerParcours(id) {
    const p = ((C && C.parcours) || []).find(x => x.id === id);
    if (!p || !p.etapes.length) return false;
    terminerParcours(false);
    fermer(false);
    const dejaOuvreur = document.activeElement;
    const bloc = document.createElement('div'); bloc.className = 'aide-bloc no-print';
    const cible = document.createElement('div'); cible.className = 'aide-cible no-print'; cible.setAttribute('aria-hidden', 'true');
    const bulle = document.createElement('div'); bulle.className = 'aide-bulle no-print';
    bulle.setAttribute('role', 'dialog'); bulle.setAttribute('aria-modal', 'true'); bulle.setAttribute('aria-labelledby', 'aide-bulle-titre'); bulle.setAttribute('aria-describedby', 'aide-bulle-texte');
    document.body.append(bloc, cible, bulle);
    parcours = { p, i: 0, bloc, cible, bulle, el: null, ouvreur: dejaOuvreur, jeton: 0 };
    bloc.onclick = cible.onclick = () => { const b = bulle.querySelector('#aide-suiv'); if (b) b.focus(); };
    bulle.addEventListener('click', e => {
      const a = e.target.closest('[data-aide-pas]'); if (!a) return;
      const k = a.dataset.aidePas;
      if (k === 'passer') terminerParcours(true);
      else if (k === 'prec') etape(parcours.i - 1);
      else if (parcours.i >= parcours.p.etapes.length - 1) terminerParcours(true);
      else etape(parcours.i + 1);
    });
    bulle.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); terminerParcours(true); return; }
      if (e.key === 'ArrowRight' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); bulle.querySelector('#aide-suiv').click(); return; }
      if (e.key === 'ArrowLeft' && parcours.i > 0) { e.preventDefault(); etape(parcours.i - 1); return; }
      if (e.key === 'Tab') { // focus gardé dans la bulle
        const f = [...bulle.querySelectorAll('button')]; if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    etape(0);
    return true;
  }
  async function etape(i) {
    if (!parcours) return;
    const P = parcours, e = P.p.etapes[i]; if (!e) return;
    P.i = i; const jeton = ++P.jeton;
    const route = typeof e.route === 'function' ? essai(() => e.route(), '') : e.route;
    if (route && location.hash !== route && !(route === '#/' && !location.hash)) location.hash = route;
    P.bulle.innerHTML = `<p class="aide-pas">Étape ${i + 1} / ${P.p.etapes.length} · ${esc(P.p.titre)}</p><p class="muted">…</p>`;
    const el = e.cible ? await attendre(e.cible, route ? 2500 : 600) : null;
    if (!parcours || parcours !== P || jeton !== P.jeton) return;
    P.el = el;
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const dernier = i === P.p.etapes.length - 1;
    P.bulle.innerHTML = `<p class="aide-pas">Étape ${i + 1} / ${P.p.etapes.length} · ${esc(P.p.titre)}</p>
      <h2 id="aide-bulle-titre">${esc(e.titre)}</h2><p id="aide-bulle-texte">${esc(e.texte)}</p>
      <div class="aide-bulle-actions"><button type="button" class="aide-passer" data-aide-pas="passer">Passer</button><span class="aide-esp"></span>
        ${i ? '<button type="button" class="aide-prec" data-aide-pas="prec">← Précédente</button>' : ''}<button type="button" class="aide-suiv" id="aide-suiv" data-aide-pas="suiv">${dernier ? 'Terminer ✓' : 'Suivante →'}</button></div>`;
    placer();
    P.bulle.querySelector('#aide-suiv').focus({ preventScroll: true });
  }
  function placer() {
    if (!parcours) return;
    const { el, cible, bulle } = parcours, vw = innerWidth, vh = innerHeight, m = 8;
    bulle.classList.toggle('aide-centre', !el);
    cible.hidden = !el;
    bulle.style.cssText = '';
    parcours.bloc.style.clipPath = '';
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 6;
    const x1 = r.left - pad, y1 = r.top - pad, x2 = r.right + pad, y2 = r.bottom + pad;
    Object.assign(cible.style, { top: `${y1}px`, left: `${x1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    // Voile sombre percé à l'emplacement de l'élément (la cible, au-dessus, garde les clics bloqués)
    parcours.bloc.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${y1}px)`;
    const b = bulle.getBoundingClientRect(), w = Math.min(b.width, vw - 2 * m), h = b.height;
    // Sous l'élément s'il y a la place, sinon au-dessus, sinon en bas de l'écran
    let top = r.bottom + pad + 10 + h <= vh - m ? r.bottom + pad + 10 : r.top - pad - 10 - h >= m ? r.top - pad - 10 - h : vh - h - m;
    top = Math.max(m, top);
    const left = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), vw - w - m);
    Object.assign(bulle.style, { top: `${top}px`, left: `${left}px` });
  }
  function terminerParcours(vu) {
    if (!parcours) return;
    const P = parcours; parcours = null;
    [P.bloc, P.cible, P.bulle].forEach(x => x.remove());
    if (vu) marquerVu(P.p.id);
    const b = $('aide-bouton'), o = P.ouvreur && document.contains(P.ouvreur) && P.ouvreur !== document.body ? P.ouvreur : b;
    if (o && o.focus) o.focus({ preventScroll: true });
  }

  /* ---------- Proposition à la première connexion ---------- */
  function proposer(opts = {}) {
    if (!C || !(C.parcours || []).length) return false;
    const u = utilisateur(); if (!u) return false;
    if (!opts.forcer && (autoDesactive() || lireEtat().propose)) return false;
    const id = essai(() => C.profil(u), '') || C.parcours[0].id, p = C.parcours.find(x => x.id === id) || C.parcours[0];
    ecrireEtat({ propose: true });
    const anc = $('aide-propose'); if (anc) anc.remove();
    const d = document.createElement('div');
    d.id = 'aide-propose'; d.className = 'aide-propose no-print';
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Découvrir l\'application');
    d.innerHTML = `<p><strong>Bienvenue dans ${esc(C.nom)} !</strong><br>Découvrez l'essentiel en ${p.etapes.length} étapes : <em>${esc(p.titre)}</em>. Vous pourrez relancer ce parcours depuis le bouton « ? Aide ».</p>
      <div class="aide-bulle-actions"><button type="button" class="aide-passer" id="aide-propose-non">Plus tard</button><span class="aide-esp"></span><button type="button" class="aide-suiv" id="aide-propose-oui">▶ Commencer</button></div>`;
    document.body.appendChild(d);
    d.querySelector('#aide-propose-non').onclick = () => d.remove();
    d.querySelector('#aide-propose-oui').onclick = () => { d.remove(); lancerParcours(p.id); };
    d.addEventListener('keydown', e => { if (e.key === 'Escape') d.remove(); });
    return true;
  }
  // Connexion repérée (classe « déconnecté » retirée du corps de la page, utilisateur connu) : proposition une fois
  function surveillerConnexion() {
    const verifier = () => {
      const u = utilisateur(); if (!u) return;
      const k = cleEtat(); if (proposeA === k) return;
      proposeA = k;
      setTimeout(() => proposer(), 1800);
    };
    new MutationObserver(verifier).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setTimeout(verifier, 500);
  }

  function demarrer() {
    const b = $('aide-bouton');
    if (b) { b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'aide-panneau'); b.addEventListener('click', basculer); }
    document.addEventListener('keydown', e => {
      if (parcours) return;
      const champ = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      if (e.key === 'F1' || (e.key === '?' && !champ && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        if (!utilisateur()) return;
        e.preventDefault(); basculer();
      } else if (e.key === 'Escape' && panneau && !panneau.hidden && !modaleOuverte()) fermer();
    });
    // Nouvel écran : l'aide ouverte suit l'écran (sauf recherche en cours)
    addEventListener('hashchange', () => { if (panneau && !panneau.hidden && !panneau.querySelector('#aide-q').value) { rubriqueVue = ''; setTimeout(rendre, 60); } });
    addEventListener('resize', () => { if (parcours) placer(); if (panneau && !panneau.hidden) panneau.setAttribute('aria-modal', mobile() ? 'true' : 'false'); });
    addEventListener('scroll', () => { if (parcours) placer(); }, true);
    surveillerConnexion();
  }
  function configurer(contenu) {
    const premier = !C;
    C = contenu;
    if (premier) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer(); }
  }

  return { normaliser, rechercher, rubriqueDe, configurer, ouvrir, fermer, basculer, lancerParcours, terminerParcours, proposer,
    etat: () => lireEtat(), parcoursEnCours: () => (parcours ? { id: parcours.p.id, etape: parcours.i } : null), rubriqueCourante: () => (ecranCourant() || {}).id || '' };
})();
if (typeof module !== 'undefined') module.exports = Aide;
