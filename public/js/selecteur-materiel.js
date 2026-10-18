// Choix du matériel en plein écran (téléphone d'abord) : recherche, familles et sous-familles en pastilles,
// grandes lignes à toucher, quantités + / −, matériel hors bibliothèque. Renvoie la liste choisie (ou [] si annulé).
function choisirMateriel({ titre = 'Matériel utilisé', affaireId = '', prix = false } = {}) {
  return new Promise(resolve => {
    const articles = Store.all('articles');
    const dejaIci = new Set(affaireId ? Store.all('consommations').filter(c => c.affaireId === affaireId && c.articleId).map(c => c.articleId) : []);
    const st = { q: '', famille: '', sous: '', ici: false, panier: new Map(), libres: [] };
    const el = document.createElement('div');
    el.className = 'selecteur';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titre);
    el.innerHTML = `<div class="sel-tete"><button class="icon sel-fermer" aria-label="Fermer">✕</button><strong>${esc(titre)}</strong></div>
      <div class="sel-recherche"><input type="search" placeholder="Rechercher : coude 50, vanne, inox…" aria-label="Rechercher du matériel" autocomplete="off" enterkeyhint="search"></div>
      <div class="sel-familles"></div><div class="sel-sous"></div>
      <ul class="sel-liste"></ul>
      <div class="sel-pied"><button class="secondary" data-libre>+ Matériel hors bibliothèque</button><button class="big" data-ok>Valider</button></div>`;
    document.body.appendChild(el);
    document.body.classList.add('selecteur-ouvert');
    const $ = s => el.querySelector(s);
    const qteTxt = q => String(Math.round(q * 100) / 100).replace('.', ',');
    const total = () => [...st.panier.values()].filter(q => q > 0).length + st.libres.length;

    function pastilles() {
      const arbre = RechercheArticles.arbre(articles);
      const p = (k, v, lib, actif) => `<button class="pastille ${actif ? 'on' : ''}" data-${k}="${esc(v)}">${esc(lib)}</button>`;
      $('.sel-familles').innerHTML = (dejaIci.size ? p('ici', '1', '⭐ Déjà utilisé ici', st.ici) : '') + p('fam', '', 'Tout', !st.famille && !st.ici)
        + arbre.map(f => p('fam', f.nom, f.nom, st.famille === f.nom && !st.ici)).join('');
      const f = arbre.find(x => x.nom === st.famille);
      $('.sel-sous').innerHTML = f && f.sous.length && !st.ici ? p('sous', '', 'Toutes', !st.sous) + f.sous.map(s => p('sous', s.nom, s.nom, st.sous === s.nom)).join('') : '';
      $('.sel-sous').hidden = !$('.sel-sous').innerHTML;
    }
    function liste() {
      let l = RechercheArticles.filtrer(st.ici ? articles.filter(a => dejaIci.has(a.id)) : articles, { q: st.q, famille: st.ici ? '' : st.famille, sousFamille: st.ici ? '' : st.sous, fournisseurDe: a => (a.fournisseurId ? clientName(a.fournisseurId) : '') });
      const n = l.length; l = l.slice(0, 150);
      $('.sel-liste').innerHTML = (st.libres.map((m, i) => `<li class="choisi"><div class="sel-art"><strong>${esc(m.designation)}</strong><span class="small muted">hors bibliothèque · ${qteTxt(m.qte)} ${esc(m.unite)}</span></div><button class="icon" data-rmlibre="${i}" aria-label="Retirer">✕</button></li>`).join(''))
        + (l.map(a => { const q = st.panier.get(a.id) || 0;
          return `<li class="${q ? 'choisi' : ''}" data-art="${a.id}"><div class="sel-art"><strong>${esc(a.designation)}</strong><span class="small muted">${esc([a.ref, a.sousFamille || a.famille].filter(Boolean).join(' · '))}${prix && num(a.prixVente) ? ` · ${eur(a.prixVente)} / ${esc(a.unite || 'u')}` : ''}</span></div>
            ${q ? `<div class="stepper"><button data-moins="${a.id}" aria-label="Moins">−</button><input data-qte="${a.id}" value="${qteTxt(q)}" inputmode="decimal" aria-label="Quantité"><span class="small">${esc(a.unite || 'u')}</span><button data-plus="${a.id}" aria-label="Plus">+</button></div>` : `<button class="ajout" data-plus="${a.id}" aria-label="Ajouter ${esc(a.designation)}">+</button>`}</li>`; }).join('')
          || `<li class="vide muted">Rien trouvé${st.q ? ` pour « ${esc(st.q)} »` : ''}. Ajoutez-le en « matériel hors bibliothèque ».</li>`)
        + (n > l.length ? `<li class="vide muted small">${n - l.length} autres résultats : précisez la recherche.</li>` : '');
      const t = total();
      $('[data-ok]').textContent = t ? `Valider (${t} article${t > 1 ? 's' : ''})` : 'Valider';
    }
    const fermer = res => { el.remove(); document.body.classList.remove('selecteur-ouvert'); document.removeEventListener('keydown', clavier); resolve(res); };
    const clavier = ev => { if (ev.key === 'Escape') fermer([]); };
    document.addEventListener('keydown', clavier);

    $('.sel-fermer').onclick = () => fermer([]);
    $('.sel-recherche input').oninput = ev => { st.q = ev.target.value; liste(); };
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button, li[data-art]');
      if (!b) return;
      if (b.dataset.fam !== undefined) { st.famille = b.dataset.fam; st.sous = ''; st.ici = false; pastilles(); liste(); return; }
      if (b.dataset.sous !== undefined) { st.sous = b.dataset.sous; pastilles(); liste(); return; }
      if (b.dataset.ici) { st.ici = !st.ici; pastilles(); liste(); return; }
      if (b.dataset.plus) { st.panier.set(b.dataset.plus, (st.panier.get(b.dataset.plus) || 0) + 1); liste(); return; }
      if (b.dataset.moins) { const q = (st.panier.get(b.dataset.moins) || 0) - 1; if (q > 0) st.panier.set(b.dataset.moins, q); else st.panier.delete(b.dataset.moins); liste(); return; }
      if (b.dataset.rmlibre) { st.libres.splice(+b.dataset.rmlibre, 1); liste(); return; }
      // Toucher la ligne d'un article non choisi l'ajoute
      if (b.matches('li[data-art]') && !st.panier.get(b.dataset.art) && !ev.target.closest('input')) { st.panier.set(b.dataset.art, 1); liste(); }
    });
    el.addEventListener('change', ev => {
      const id = ev.target.dataset && ev.target.dataset.qte;
      if (!id) return;
      const q = num(String(ev.target.value).replace(',', '.'));
      if (q > 0) st.panier.set(id, q); else st.panier.delete(id);
      liste();
    });
    $('[data-libre]').onclick = async () => {
      const d = (await askValue('Matériel hors bibliothèque (désignation)', st.q) || '').trim();
      if (!d) return;
      const q = num(String(await askValue(`Quantité de « ${d} »`, '1', 'number') || '').replace(',', '.'));
      if (!q) return;
      const u = (await askValue('Unité (u, ml, m², kg, h…)', 'u') || 'u').trim();
      st.libres.push({ articleId: '', designation: d, unite: u, qte: q, pu: 0, cout: 0 });
      liste();
    };
    $('[data-ok]').onclick = () => fermer([
      ...[...st.panier.entries()].filter(([, q]) => q > 0).map(([id, qte]) => { const a = Store.get('articles', id) || {}; return { articleId: id, designation: a.designation, unite: a.unite || 'u', qte, pu: num(a.prixVente), cout: num(a.coutRevient) }; }),
      ...st.libres,
    ]);
    pastilles(); liste();
    setTimeout(() => { if (window.matchMedia('(min-width: 721px)').matches) $('.sel-recherche input').focus(); }, 50);
  });
}
