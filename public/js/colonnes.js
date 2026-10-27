// Colonnes des tableaux de gestion, propres à chaque compte (sur tous ses appareils) : barre « Colonnes » au-dessus du
// tableau, une pastille par colonne pour l'afficher ou la masquer, largeur réglée en tirant le bord droit d'un en-tête.
// Un tableau y participe avec l'attribut data-colonnes="<nom de l'écran>".
const Colonnes = (() => {
  const ouverts = new Set();
  let attente = null;
  // Clé d'une colonne : data-col de l'en-tête, sinon son libellé (stable d'un affichage à l'autre)
  const cle = (th, i) => th.dataset.col || normRecherche(th.textContent).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `c${i}`;
  const toutes = () => (Store.me && Store.me.prefs && Store.me.prefs.colonnes) || {};
  function enregistrer(ecran, conf) {
    const colonnes = { ...toutes() };
    if (conf) colonnes[ecran] = conf; else delete colonnes[ecran];
    Store.me.prefs = { ...(Store.me.prefs || {}), colonnes };
    clearTimeout(attente);
    attente = setTimeout(() => api('PUT', '/api/me/preferences', Store.me.prefs).catch(() => { /* hors connexion : gardé pour cette session */ }), 500);
  }

  function appliquer(root) {
    root.querySelectorAll('table[data-colonnes]').forEach(table => {
      const ecran = table.dataset.colonnes, conf = toutes()[ecran] || {}, cachees = new Set(conf.cachees || []), largeurs = conf.largeurs || {};
      const tete = table.querySelector('tr');
      if (!tete) return;
      const ths = [...tete.children];
      const cols = ths.map((th, i) => ({ th, i, cle: cle(th, i), lib: th.textContent.trim() }));
      const lignes = [...table.querySelectorAll('tr')].filter(tr => tr.children.length === ths.length);
      cols.forEach(c => {
        if (cachees.has(c.cle) && c.lib) lignes.forEach(tr => { tr.children[c.i].style.display = 'none'; });
        if (largeurs[c.cle]) Object.assign(c.th.style, { width: `${largeurs[c.cle]}px`, minWidth: `${largeurs[c.cle]}px` });
        if (!c.lib) return;
        // Poignée de largeur sur le bord droit de l'en-tête
        const p = document.createElement('span');
        p.className = 'col-poignee'; p.title = 'Tirer pour régler la largeur (double-clic : largeur automatique)';
        c.th.classList.add('col-th'); c.th.appendChild(p);
        p.addEventListener('click', e => e.stopPropagation());
        p.addEventListener('dblclick', e => { e.stopPropagation(); const l = { ...largeurs }; delete l[c.cle]; enregistrer(ecran, { ...conf, largeurs: l }); App.render(); });
        p.addEventListener('pointerdown', e => {
          e.preventDefault(); e.stopPropagation(); p.setPointerCapture(e.pointerId);
          const x0 = e.clientX, w0 = c.th.getBoundingClientRect().width;
          const bouge = ev => { const w = Math.max(40, Math.round(w0 + ev.clientX - x0)); Object.assign(c.th.style, { width: `${w}px`, minWidth: `${w}px` }); };
          const fin = () => { p.removeEventListener('pointermove', bouge); enregistrer(ecran, { ...conf, largeurs: { ...largeurs, [c.cle]: Math.round(c.th.getBoundingClientRect().width) } }); };
          p.addEventListener('pointermove', bouge);
          p.addEventListener('pointerup', fin, { once: true });
        });
      });
      // Barre des colonnes : pastilles à allumer / éteindre
      const choix = cols.filter(c => c.lib), ouvert = ouverts.has(ecran), nb = choix.filter(c => cachees.has(c.cle)).length;
      const barre = document.createElement('div');
      barre.className = 'col-barre no-print';
      barre.innerHTML = `<button type="button" class="small secondary col-ouvrir" aria-expanded="${ouvert}">☰ Colonnes${nb ? ` <span class="count">${nb} masquée${nb > 1 ? 's' : ''}</span>` : ''}</button>
        <span class="col-puces" ${ouvert ? '' : 'hidden'}>${choix.map(c => `<button type="button" class="col-puce ${cachees.has(c.cle) ? '' : 'on'}" data-cle="${esc(c.cle)}" aria-pressed="${!cachees.has(c.cle)}">${esc(c.lib)}</button>`).join('')}
        ${nb || Object.keys(largeurs).length ? '<button type="button" class="small secondary" data-col-raz>Tout réafficher</button>' : ''}
        <span class="muted small">Touchez une colonne pour l'afficher ou la masquer ; tirez le bord d'un en-tête pour sa largeur.</span></span>`;
      (table.closest('.table-wrap') || table).before(barre);
      barre.querySelector('.col-ouvrir').onclick = () => { if (ouverts.has(ecran)) ouverts.delete(ecran); else ouverts.add(ecran); App.render(); };
      barre.querySelectorAll('.col-puce').forEach(b => b.onclick = () => {
        const s = new Set(cachees);
        if (s.has(b.dataset.cle)) s.delete(b.dataset.cle); else s.add(b.dataset.cle);
        if (s.size >= choix.length) return App.toast('Gardez au moins une colonne.');
        enregistrer(ecran, { ...conf, cachees: [...s] }); App.render();
      });
      const raz = barre.querySelector('[data-col-raz]');
      if (raz) raz.onclick = () => { enregistrer(ecran, null); App.render(); };
    });
  }
  return { appliquer };
})();
