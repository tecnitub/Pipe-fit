// Ergonomie commune à tous les écrans (affichage seulement, aucune donnée modifiée) :
// - téléphone : barre de navigation en bas de l'écran (au pouce) et menu complet en volet ;
// - champs sans libellé relié : libellé repris du libellé voisin, de l'en-tête de colonne ou de l'indication ;
// - champs numériques : clavier numérique du téléphone (inputmode) ;
// - tableaux qui tiennent dans la largeur (ordinateur) : en-tête collant pendant le défilement de la page.
const Ergonomie = (() => {
  const mobile = () => matchMedia('(max-width: 720px)').matches;
  let n = 0;

  /* ---------- Navigation du téléphone ---------- */
  // Raccourcis de la barre du bas : bureau → écrans du quotidien ; compagnon → sa journée de chantier
  const BUREAU = [['#/dashboard', '🏠', 'Accueil'], ['#/chantiers', '🏗️', 'Chantiers'], ['#/devis', '📝', 'Devis'], ['#/planning', '🗓️', 'Planning']];
  const TERRAIN = [['#/pointage', '⏱️', 'Heures'], ['#/pointage/chantiers', '🏗️', 'Chantiers'], ['#/pointage/planning', '🗓️', 'Planning'], ['#/scan', '📷', 'Stock']];
  const TERRAIN_MENU = [['#/pointage/rapports', 'Rapports'], ['#/pointage/frais', 'Notes de frais'], ['#/pointage/comptoir', 'Comptoir'], ['#/pointage/calculs', 'Calculs'], ['#/notifications', 'Notifications']];

  function lienVisible(href) {
    const a = [...document.querySelectorAll('#nav a')].find(x => x.getAttribute('href') === href);
    return a ? !a.hidden : true;
  }
  function fermerMenu() {
    document.body.classList.remove('menu-ouvert');
    const b = document.getElementById('navbas-menu'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  function ouvrirMenu() {
    const v = document.getElementById('menu-mobile');
    if (!v) return;
    const atelier = Store.me && Store.me.role === 'atelier';
    const liens = [...document.querySelectorAll('#nav a')].filter(a => !a.hidden).map(a => [a.getAttribute('href'), a.textContent.trim(), a.classList.contains('active')]);
    if (atelier) TERRAIN_MENU.forEach(([h, t]) => { if (!liens.some(l => l[0] === h)) liens.unshift([h, t, location.hash.split('?')[0] === h]); });
    v.innerHTML = `<div class="mm-tete"><strong>${esc(document.getElementById('whoami').textContent)}</strong><button type="button" class="secondary" id="mm-fermer" aria-label="Fermer le menu">✕</button></div>
      <div class="mm-liens">${liens.map(([h, t, on]) => `<a href="${esc(h)}" class="${on ? 'active' : ''}">${esc(t)}</a>`).join('')}</div>
      <div class="mm-pied"><button type="button" class="secondary" id="mm-logout">Déconnexion</button></div>`;
    v.querySelector('#mm-fermer').onclick = fermerMenu;
    v.querySelector('#mm-logout').onclick = () => { fermerMenu(); document.getElementById('logout').click(); };
    v.querySelectorAll('a').forEach(a => { a.onclick = fermerMenu; });
    document.body.classList.add('menu-ouvert');
    document.getElementById('navbas-menu').setAttribute('aria-expanded', 'true');
    const premier = v.querySelector('a.active') || v.querySelector('a'); if (premier) premier.focus();
  }
  function navMobile() {
    const bar = document.getElementById('navbas');
    if (!bar || !Store.me) return;
    const atelier = Store.me.role === 'atelier';
    const h = location.hash.split('?')[0] || (atelier ? '#/pointage' : '#/dashboard');
    const section = (document.querySelector('#nav a.active') || {}).getAttribute ? document.querySelector('#nav a.active').getAttribute('href') : '';
    const raccourcis = (atelier ? TERRAIN : BUREAU).filter(([href]) => atelier || lienVisible(href));
    const actif = href => atelier ? (href === '#/pointage' ? h === '#/pointage' : h.startsWith(href)) : href === section;
    bar.innerHTML = raccourcis.map(([href, ic, t]) => `<a href="${href}" class="${actif(href) ? 'active' : ''}" ${actif(href) ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span>${esc(t)}</a>`).join('')
      + `<button type="button" id="navbas-menu" aria-expanded="false" aria-controls="menu-mobile"><span aria-hidden="true">☰</span>Menu</button>`;
    bar.querySelector('#navbas-menu').onclick = () => (document.body.classList.contains('menu-ouvert') ? fermerMenu() : ouvrirMenu());
    fermerMenu();
  }

  /* ---------- Champs : libellés, clavier numérique ---------- */
  function texte(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : ''; }
  function enteteColonne(cell) {
    const table = cell.closest('table'); if (!table) return '';
    const tete = table.tHead ? table.tHead.rows[0] : [...table.rows].find(r => r.cells.length && [...r.cells].every(c => c.tagName === 'TH'));
    if (!tete || tete === cell.parentElement) return '';
    let col = 0; for (const c of cell.parentElement.cells) { if (c === cell) break; col += c.colSpan || 1; }
    let k = 0; for (const c of tete.cells) { if (col < k + (c.colSpan || 1)) return texte(c); k += c.colSpan || 1; }
    return '';
  }
  function libeller(el) {
    if ((el.labels && el.labels.length) || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.title) return;
    // Libellé posé juste au-dessus dans le même bloc (.field) : relié au champ (le toucher place le curseur)
    const bloc = el.closest('.field, .grid2 > div, .form-row');
    const lab = bloc && bloc.querySelector(':scope > label:not(:has(input, select, textarea))');
    if (lab && !lab.htmlFor && bloc.querySelectorAll('input:not([type=hidden]), select, textarea').length === 1) {
      if (!el.id) el.id = `ergo-champ-${++n}`;
      lab.htmlFor = el.id; return;
    }
    let t = el.placeholder || '';
    const cell = !t && el.closest('td, th');
    if (cell) t = enteteColonne(cell) || (cell.dataset.l || '');
    if (!t && lab) t = texte(lab);
    if (!t && el.tagName === 'SELECT' && el.options.length && el.options[0].value === '') t = el.options[0].text.replace(/^—\s*$/, '');
    if (!t) { const p = el.previousElementSibling; if (p && /^(SPAN|STRONG|B|LABEL)$/.test(p.tagName)) t = texte(p); }
    if (!t && el.parentElement && el.parentElement.tagName === 'SPAN') t = texte(el.parentElement);
    if (t) el.setAttribute('aria-label', t.replace(/\s*[:*]\s*$/, ''));
  }
  function clavier(el) {
    if (el.hasAttribute('inputmode')) return;
    if (el.type === 'number') { const s = el.getAttribute('step'); el.setAttribute('inputmode', s && /^\d+$/.test(s) && !(+el.min < 0) ? 'numeric' : 'decimal'); }
    else if (el.type === 'text' && el.matches('.num-in, [data-num], .dc-q')) el.setAttribute('inputmode', 'decimal');
  }
  function champs(racine) {
    racine.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]), select, textarea').forEach(el => { libeller(el); clavier(el); });
  }

  /* ---------- Tableaux : en-tête collant quand le tableau tient dans la largeur ---------- */
  function tableaux(racine) {
    if (mobile()) { racine.querySelectorAll('.table-wrap.tw-plein').forEach(w => w.classList.remove('tw-plein')); return; }
    racine.querySelectorAll('.table-wrap').forEach(w => {
      if (w.closest('.modal, .dp-preview')) return;
      w.classList.remove('tw-plein');
      // Largeur du tableau lui-même (la poignée de largeur des colonnes dépasse de quelques pixels)
      const t = w.querySelector(':scope > table');
      if (t && t.offsetWidth <= w.clientWidth + 1) w.classList.add('tw-plein');
    });
  }

  /* ---------- Barres d'actions du téléphone : actions secondaires repliées derrière « Plus d'actions » ---------- */
  const SEUIL_ACTIONS = 4;
  function barres(racine) {
    if (!mobile()) return;
    racine.querySelectorAll('.toolbar:not(.tb-vue)').forEach(tb => {
      tb.classList.add('tb-vue');
      const actions = [...tb.children].filter(x => x.matches('button, a.btn') && !x.hidden && !x.classList.contains('tb-plus'));
      if (actions.length <= SEUIL_ACTIONS) return;
      // Gardés en vue : le retour (« ← … »), puis les actions principales (boutons pleins), au plus trois en tout
      let gardes = 0;
      actions.forEach((x, i) => {
        const garde = (i === 0 && /^\s*←/.test(x.textContent)) || (!x.classList.contains('secondary') && !x.classList.contains('danger') && gardes < 3);
        if (garde) { gardes++; x.classList.add('tb-garde'); }
      });
      const caches = actions.filter(x => !x.classList.contains('tb-garde')).length;
      if (caches < 2) { actions.forEach(x => x.classList.add('tb-garde')); return; }
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'secondary tb-plus'; plus.setAttribute('aria-expanded', 'false');
      plus.innerHTML = `⋯ Plus d'actions <span class="count">${caches}</span>`;
      plus.onclick = () => { const o = tb.classList.toggle('tb-ouvert'); plus.setAttribute('aria-expanded', String(o)); plus.firstChild.textContent = o ? '▴ Moins d\'actions ' : '⋯ Plus d\'actions '; };
      tb.classList.add('tb-repli');
      tb.appendChild(plus);
    });
  }

  /* ---------- Passage après chaque affichage (écran, dialogue, partie réaffichée) ---------- */
  let prevu = 0;
  function passer() { prevu = 0; champs(document.body); barres(document.getElementById('app') || document.body); tableaux(document.getElementById('app') || document.body); }
  function planifier() { if (!prevu) prevu = requestAnimationFrame(passer); }

  function demarrer() {
    new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
    addEventListener('resize', planifier);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-ouvert')) { fermerMenu(); document.getElementById('navbas-menu').focus(); } });
    const fond = document.getElementById('menu-fond'); if (fond) fond.onclick = fermerMenu;
    planifier();
  }

  return { navMobile, fermerMenu, ouvrirMenu, demarrer, champs, tableaux, libeller };
})();
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => Ergonomie.demarrer());
