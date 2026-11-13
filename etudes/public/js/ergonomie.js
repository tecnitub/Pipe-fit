// Ergonomie de l'application Études, sur ordinateur et sur téléphone, sans toucher aux calculs :
// - libellés longs raccourcis (le texte complet passe en aide, au survol ou quand le champ a le focus) ;
// - groupes de saisie repliables (mémorisés sur ce poste) ;
// - tableaux de lignes : chaque cellule reçoit l'intitulé de sa colonne (lecteur d'écran, carte par ligne sur téléphone),
//   indice de défilement horizontal, Entrée / Maj+Entrée pour passer à la ligne suivante / précédente (même colonne) ;
// - schémas SVG zoomables (boutons, Ctrl + molette) et déplaçables à la souris ; lisibles d'emblée sur téléphone ;
// - sur téléphone, actions nombreuses d'un calcul regroupées dans un menu « Plus d'actions ».
(function (racine) {
  // Raccourci d'un libellé : partie avant la première précision (« (vide : … », « — … », « : … »), unité gardée
  function libelleCourt(l, max = 40) {
    const s = String(l ?? '').trim();
    if (s.length <= max) return { court: s, aide: '' };
    const coupes = [' (', ' — ', ' – ', ' : ', ' ; ', ', '].map(c => s.indexOf(c, 4))
      // jamais au milieu d'une citation « … »
      .filter(i => i > 0 && (s.slice(0, i).match(/«/g) || []).length <= (s.slice(0, i).match(/»/g) || []).length);
    const i = coupes.length ? Math.min(...coupes) : -1;
    if (i < 0 || i > 64) {
      // Pas de précision : libellé gardé entier s'il reste raisonnable, sinon coupé sur un espace
      if (s.length <= 70) return { court: s, aide: '' };
      const j = s.lastIndexOf(' ', 50);
      return { court: `${s.slice(0, j > 12 ? j : 50)}…`, aide: s };
    }
    let court = s.slice(0, i);
    if (s.slice(i, i + 2) === ' (') {
      // Unité en tête de la parenthèse (« (kPa ; vide : forfait) ») : gardée dans le libellé court
      const u = s.slice(i + 2).split(/[;,)]/)[0].trim();
      if (u && u.length <= 8 && !/\s/.test(u) && !/^(vide|ex\.?|si|«)/i.test(u)) court += ` (${u})`;
    }
    return { court, aide: s };
  }

  // Groupes repliés : « type|titre du groupe », gardés sur ce poste
  const CLE = 'etudes-groupes-replies';
  let replies;
  const lire = () => { if (!replies) { try { replies = new Set(JSON.parse(localStorage.getItem(CLE) || '[]')); } catch (e) { replies = new Set(); } } return replies; };
  const ecrire = () => { try { localStorage.setItem(CLE, JSON.stringify([...lire()])); } catch (e) { /* stockage indisponible */ } };
  const estReplie = (type, titre) => lire().has(`${type}|${titre}`);
  function replier(type, titre, oui) { const s = lire(), k = `${type}|${titre}`; if (oui) s.add(k); else s.delete(k); ecrire(); }

  if (typeof document === 'undefined') { racine.Ergonomie = { libelleCourt, estReplie, replier }; return; }

  const mobile = () => matchMedia('(max-width: 700px)').matches;

  // Intitulé de chaque colonne reporté sur ses cellules (carte sur téléphone) et sur les champs sans libellé
  function etiqueter(root) {
    root.querySelectorAll('table').forEach(t => {
      const tete = t.tHead && t.tHead.rows[0] ? t.tHead.rows[0] : (t.rows[0] && [...t.rows[0].cells].every(c => c.tagName === 'TH') ? t.rows[0] : null);
      if (!tete) return;
      const noms = [...tete.cells].map(th => (th.dataset.court || th.textContent || '').replace(/\s+/g, ' ').replace(/\s*ⓘ$/, '').trim());
      [...t.tBodies].forEach(tb => [...tb.rows].forEach((tr, i) => {
        if (tr === tete || tr.cells.length !== noms.length) return;
        const rep = (() => { const c = tr.cells[0]; if (!c) return ''; const x = c.querySelector('input, select'); return String(x ? x.value : c.textContent).trim().slice(0, 30); })();
        [...tr.cells].forEach((td, j) => {
          if (noms[j] && !td.dataset.col) td.dataset.col = noms[j];
          td.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
            if (el.getAttribute('aria-label') || el.closest('label') || (el.id && root.querySelector(`label[for="${el.id}"]`))) return;
            el.setAttribute('aria-label', `${noms[j] || el.placeholder || 'Valeur'}${rep && j ? ` — ${rep}` : ''} (ligne ${i + 1})`);
          });
        });
      }));
    });
  }

  // Indice de défilement horizontal : bord estompé du côté où il reste du contenu
  function majDefile(el) {
    const plus = el.scrollWidth - el.clientWidth > 2;
    el.classList.toggle('a-gauche', plus && el.scrollLeft > 2);
    el.classList.toggle('a-droite', plus && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }
  document.addEventListener('scroll', ev => { const el = ev.target; if (el && el.classList && el.classList.contains('defile-x')) majDefile(el); }, true);

  // Schémas : zoom mémorisé par écran et par position du schéma
  const zooms = new Map();
  const CONTENEURS = '.schema, .ensemble-svg, .schema-svg';
  const svgDe = c => [...c.children].find(x => x.tagName && x.tagName.toLowerCase() === 'svg');
  const largeurVb = svg => { const vb = svg.viewBox && svg.viewBox.baseVal; return vb && vb.width ? vb.width : (parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 0); };
  function appliquerZoom(c, z) {
    const svg = svgDe(c); if (!svg) return;
    const lb = largeurVb(svg), barre = c.previousElementSibling && c.previousElementSibling.classList.contains('zoom-barre') ? c.previousElementSibling : null;
    if (z === 'ajuste' || !lb) { svg.style.width = ''; svg.style.maxWidth = ''; svg.style.minWidth = ''; c.classList.remove('zoome'); }
    else { svg.style.width = `${Math.round(lb * z)}px`; svg.style.maxWidth = 'none'; svg.style.minWidth = '0'; svg.style.height = 'auto'; c.classList.add('zoome'); }
    c.dataset.zoom = z;
    if (barre) { const v = barre.querySelector('.zoom-val'); if (v) v.textContent = z === 'ajuste' ? 'Ajusté' : `${Math.round(z * 100)} %`; }
    majDefile(c);
  }
  const echelle = c => { const svg = svgDe(c), lb = svg && largeurVb(svg); return lb ? svg.getBoundingClientRect().width / lb : 1; };
  function zoomer(c, sens) {
    const e = echelle(c), z = sens === '+' ? Math.min(4, e * 1.25) : sens === '-' ? Math.max(0.2, e / 1.25) : sens;
    appliquerZoom(c, z);
    zooms.set(c.dataset.cleZoom, z);
  }
  function decorerSchemas(root) {
    root.querySelectorAll(CONTENEURS).forEach((c, i) => {
      const svg = svgDe(c);
      if (!svg || c.dataset.cleZoom || c.closest('.doe-doc') || largeurVb(svg) < 200) return;
      c.dataset.cleZoom = `${location.hash}|${i}`;
      c.classList.add('defile-x');
      const b = document.createElement('div');
      b.className = 'zoom-barre'; b.setAttribute('role', 'toolbar'); b.setAttribute('aria-label', 'Zoom du schéma');
      b.innerHTML = '<button type="button" class="secondaire petit" data-zoom="-" title="Réduire" aria-label="Réduire le schéma">−</button><span class="zoom-val petit muted" aria-live="polite">Ajusté</span>'
        + '<button type="button" class="secondaire petit" data-zoom="+" title="Agrandir" aria-label="Agrandir le schéma">+</button><button type="button" class="secondaire petit" data-zoom="ajuste" title="Schéma entier dans la largeur">Ajuster</button>'
        + '<button type="button" class="secondaire petit" data-zoom="1" title="Taille réelle du dessin">100 %</button><span class="petit muted zoom-aide">Ctrl + molette pour zoomer, glisser pour se déplacer</span>';
      c.parentNode.insertBefore(b, c);
      const memo = zooms.get(c.dataset.cleZoom);
      if (memo !== undefined) appliquerZoom(c, memo);
      // Téléphone : un grand schéma ramené à la largeur de l'écran est illisible ; affiché à 70 % au moins, à faire défiler
      else if (mobile() && echelle(c) < 0.6) appliquerZoom(c, 0.7);
      else majDefile(c);
    });
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.zoom-barre [data-zoom]'); if (!b) return;
    const c = b.parentElement.nextElementSibling; if (!c) return;
    const z = b.dataset.zoom; zoomer(c, z === '+' || z === '-' || z === 'ajuste' ? z : +z);
  });
  document.addEventListener('wheel', ev => {
    if (!ev.ctrlKey) return;
    const c = ev.target.closest && ev.target.closest(CONTENEURS); if (!c || !c.dataset.cleZoom) return;
    ev.preventDefault(); zoomer(c, ev.deltaY < 0 ? '+' : '-');
  }, { passive: false });
  // Glisser à la souris pour parcourir un schéma agrandi (au doigt, le défilement natif suffit)
  let glisse = null;
  document.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    const c = ev.target.closest && ev.target.closest(CONTENEURS);
    if (!c || !c.dataset.cleZoom || ev.target.closest('a, button, input, select, textarea') || c.scrollWidth <= c.clientWidth && c.scrollHeight <= c.clientHeight) return;
    glisse = { c, x: ev.clientX, y: ev.clientY, l: c.scrollLeft, t: c.scrollTop }; c.classList.add('glisse');
  });
  document.addEventListener('pointermove', ev => { if (!glisse) return; glisse.c.scrollLeft = glisse.l - (ev.clientX - glisse.x); glisse.c.scrollTop = glisse.t - (ev.clientY - glisse.y); });
  document.addEventListener('pointerup', () => { if (glisse) { glisse.c.classList.remove('glisse'); glisse = null; } });

  // Téléphone : au-delà des premiers boutons, actions rangées dans « Plus d'actions »
  function regrouper(root) {
    if (!mobile()) return;
    root.querySelectorAll('[data-plus]').forEach(z => {
      if (z.dataset.regroupe) return;
      const garder = +z.dataset.plus || 2, bs = [...z.children].filter(x => x.matches('button, a.btn') && !x.hidden);
      const autres = bs.slice(garder);
      if (autres.length < 2) return;
      const d = document.createElement('details');
      d.className = 'plus-actions';
      d.innerHTML = `<summary class="btn secondaire">⋯ Plus d'actions (${autres.length})</summary><div class="plus-liste" role="menu"></div>`;
      const l = d.querySelector('.plus-liste');
      autres.forEach(x => { x.setAttribute('role', 'menuitem'); l.appendChild(x); });
      z.querySelectorAll(':scope > .espace').forEach(x => x.remove());
      z.appendChild(d);
      z.dataset.regroupe = '1';
    });
  }
  document.addEventListener('click', ev => {
    document.querySelectorAll('details.plus-actions[open]').forEach(d => { if (!d.contains(ev.target) || ev.target.closest('.plus-liste button, .plus-liste a')) d.open = false; });
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') document.querySelectorAll('details.plus-actions[open]').forEach(d => { d.open = false; d.querySelector('summary').focus(); });
  });

  // Groupes de saisie repliables (légende cliquable) ; « tout replier / déplier »
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-replier]');
    if (b) {
      const f = b.closest('fieldset'), oui = !f.classList.contains('replie');
      f.classList.toggle('replie', oui); b.setAttribute('aria-expanded', String(!oui));
      replier(b.dataset.type, b.dataset.replier, oui);
      return;
    }
    const t = ev.target.closest('[data-replier-tout]');
    if (t) {
      const oui = t.dataset.replierTout === '1', zone = t.closest('.calc-saisie') || document;
      zone.querySelectorAll('[data-replier]').forEach(x => { x.closest('fieldset').classList.toggle('replie', oui); x.setAttribute('aria-expanded', String(!oui)); replier(x.dataset.type, x.dataset.replier, oui); });
    }
  });

  // Tableaux de saisie : Entrée → même colonne, ligne suivante ; Maj + Entrée → ligne précédente
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return;
    const el = ev.target; if (!el || el.tagName !== 'INPUT' || el.type === 'checkbox') return;
    const td = el.closest('table.edit td'); if (!td) return;
    const tr = td.parentElement, j = [...tr.cells].indexOf(td), dest = ev.shiftKey ? tr.previousElementSibling : tr.nextElementSibling;
    ev.preventDefault();
    const champ = dest && dest.cells[j] && dest.cells[j].querySelector('input:not([type=checkbox]):not([disabled]), select:not([disabled])');
    if (champ) { champ.focus(); if (champ.select) champ.select(); }
    else if (!ev.shiftKey) { const aj = tr.closest('.large, .defile-x') && tr.closest('.large') && tr.closest('.large').querySelector('[data-ajout-ligne]'); if (aj) aj.focus(); }
  });

  // Passage sur chaque rendu (écran, dialogue, résultats recalculés)
  let prevu = false;
  function decorer() {
    prevu = false;
    [document.getElementById('app'), document.getElementById('modal')].filter(Boolean).forEach(r => { etiqueter(r); decorerSchemas(r); regrouper(r); r.querySelectorAll('.defile-x').forEach(majDefile); });
  }
  const planifier = () => { if (!prevu) { prevu = true; requestAnimationFrame(decorer); } };
  const obs = new MutationObserver(planifier);
  const brancher = () => ['app', 'modal'].forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el, { childList: true, subtree: true }); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
  addEventListener('resize', () => document.querySelectorAll('.defile-x').forEach(majDefile));
  // Passage ordinateur ↔ téléphone (rotation, fenêtre redimensionnée) : barre d'actions refaite
  matchMedia('(max-width: 700px)').addEventListener('change', () => { if (document.querySelector('[data-plus]') && typeof App !== 'undefined' && !document.activeElement.matches('input, textarea, select')) App.render(); });

  racine.Ergonomie = { libelleCourt, estReplie, replier, decorer };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = globalThis.Ergonomie || window.Ergonomie;
