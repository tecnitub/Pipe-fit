// Recherche globale : une seule barre (🔍, Ctrl+K ou « / ») pour retrouver un chantier, un client ou un contact, un devis,
// une facture, une situation, une commande, une facture fournisseur, une fourniture, un PV, une personne, un matériel…
// Tous les mots tapés doivent se retrouver (sans accents ni majuscules) ; un n° ou un code exact passe en tête.
// Module commun navigateur / tests : index construit à partir des données déjà présentes dans l'appli.
const RechercheGlobale = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.+-]+/g, ' ').trim();
  const compact = s => norm(s).replace(/[\s.-]+/g, '');
  const TYPES = [['affaires', 'Chantiers'], ['entreprises', 'Clients et fournisseurs'], ['contacts', 'Contacts'], ['devis', 'Devis'], ['factures', 'Factures'], ['situations', 'Situations'],
    ['commandes', 'Commandes'], ['achats', 'Factures fournisseurs'], ['efactures', 'Factures reçues'], ['articles', 'Fournitures'], ['releves', 'Prises de cotes'], ['epreuves', 'PV d\'épreuve'], ['misesEnService', 'Mises en service'],
    ['equilibrages', 'Équilibrages'], ['users', 'Personnel'], ['materiels', 'Parc'], ['equipementsFrigo', 'Équipements frigorifiques']];
  // Route d'un type (pour l'affichage par accès)
  const ROUTE = { affaires: 'chantier', entreprises: 'entreprise', contacts: 'contacts', devis: 'devis', factures: 'facture', situations: 'situations', commandes: 'commandes', achats: 'achats',
    efactures: 'efactures', articles: 'articles', releves: 'releve', epreuves: 'epreuve', misesEnService: 'mes', equilibrages: 'equilibrage', users: 'rh', materiels: 'parc', equipementsFrigo: 'fluides' };

  // data : { col: [...] } ; nomDe(id) : nom d'une entreprise ; affaire(id) : chantier
  function indexer(data, { nomDe = () => '', affaire = () => ({}) } = {}) {
    const out = [], all = c => (data[c] || []).filter(x => x && !x.archive);
    const ajoute = (type, r, cles, titre, sous, lien) => out.push({ type, id: r.id, cles: cles.filter(Boolean).map(compact), titre, sous: sous.filter(Boolean).join(' · '), lien,
      texte: norm([titre, ...sous, ...cles].filter(Boolean).join(' ')) });
    const ch = id => { const a = affaire(id) || {}; return a.code ? `${a.code} ${a.nom || ''}`.trim() : ''; };
    all('affaires').forEach(a => ajoute('affaires', a, [a.code], `${a.code || ''} – ${a.nom || ''}`, [nomDe(a.clientId), a.statut, a.lieu], `#/chantier/${a.id}`));
    all('entreprises').forEach(e => ajoute('entreprises', e, [e.siret, e.compteComptable], e.nom, [e.categorie, e.secteur, ((e.adresses || [])[0] || {}).ville, e.email, e.tel], `#/entreprise/${e.id}`));
    all('contacts').forEach(c => ajoute('contacts', c, [c.email, c.mobile, c.tel], [c.prenom, c.nom].filter(Boolean).join(' '), [nomDe(c.entrepriseId), c.fonction, c.mobile || c.tel, c.email], c.entrepriseId ? `#/entreprise/${c.entrepriseId}` : '#/contacts'));
    all('devis').forEach(d => ajoute('devis', d, [d.numero], `${d.numero || 'Devis'} ${d.objet || ''}`.trim(), [nomDe(d.clientId) || nomDe((affaire(d.affaireId) || {}).clientId), d.statut, ch(d.affaireId)], `#/devis/${d.id}`));
    all('factures').forEach(f => ajoute('factures', f, [f.numero], `${f.type === 'avoir' ? 'Avoir' : 'Facture'} ${f.numero || '(brouillon)'}`, [nomDe(f.clientId) || nomDe((affaire(f.affaireId) || {}).clientId), f.objet, ch(f.affaireId), f.statut], `#/facture/${f.id}`));
    all('situations').forEach(s => ajoute('situations', s, [s.numero], `Situation ${s.numero || ''}`.trim(), [ch(s.affaireId), s.statut], `#/situations/${s.id}`));
    all('commandes').forEach(c => ajoute('commandes', c, [c.numero], `Commande ${c.numero || '(brouillon)'}`, [nomDe(c.fournisseurId), ch(c.affaireId), c.statut], `#/commandes/${c.id}`));
    all('achats').forEach(x => ajoute('achats', x, [x.ref, x.numeroFournisseur], `${x.ref || 'Facture fournisseur'} ${x.numeroFournisseur || ''}`.trim(), [nomDe(x.fournisseurId), x.statut], `#/achats/${x.id}`));
    all('efactures').forEach(x => ajoute('efactures', x, [x.numero], `Facture reçue ${x.numero || x.nomFichier || ''}`.trim(), [(x.vendeur || {}).nom, x.mail && x.mail.deEmail, x.statut], `#/efactures/${x.id}`));
    all('articles').forEach(a => ajoute('articles', a, [a.ref, a.refFournisseur], a.designation, [a.ref, a.famille, a.sousFamille], `#/articles?q=${encodeURIComponent(a.ref || a.designation)}`));
    all('releves').forEach(r => ajoute('releves', r, [r.numero], `Prise de cotes ${r.numero || ''} ${r.ligne || ''}`.trim(), [ch(r.affaireId), r.matiere, r.statut], `#/releve/${r.id}`));
    all('epreuves').forEach(e => ajoute('epreuves', e, [e.numero], `PV d'épreuve ${e.numero || ''} ${e.reseau || ''}`.trim(), [ch(e.affaireId), e.resultat], `#/epreuve/${e.id}`));
    all('misesEnService').forEach(m => ajoute('misesEnService', m, [m.numero, m.numeroSerie], `Mise en service ${m.numero || ''} ${m.equipement || ''}`.trim(), [ch(m.affaireId), m.marque, m.modele], `#/mes/${m.id}`));
    all('equilibrages').forEach(q => ajoute('equilibrages', q, [q.numero], `Équilibrage ${q.numero || ''} ${q.installation || ''}`.trim(), [ch(q.affaireId), q.type], `#/equilibrage/${q.id}`));
    all('users').forEach(u => ajoute('users', u, [], u.nom, [u.type === 'interimaire' ? 'intérimaire' : '', u.role === 'atelier' ? 'compagnon' : u.role === 'charge' ? 'chargé d\'affaires' : ''], '#/rh'));
    all('materiels').forEach(m => ajoute('materiels', m, [m.immat, m.numeroSerie], m.designation, [m.categorie, m.immat, m.marque], `#/parc?q=${encodeURIComponent(m.immat || m.designation)}`));
    all('equipementsFrigo').forEach(e => ajoute('equipementsFrigo', e, [e.numeroSerie], e.designation, [nomDe(e.clientId), e.fluide, e.marque, e.localisation], `#/fluides?q=${encodeURIComponent(e.numeroSerie || e.designation)}`));
    return out;
  }

  // Résultats : tous les mots présents ; score : code / n° exact, début de titre, mot entier
  function chercher(index, q, { max = 40, types = null } = {}) {
    const mots = norm(q).split(' ').filter(Boolean), c = compact(q);
    if (!mots.length) return [];
    // « DV-0007 » : même préfixe et même fin de n° que DV-2026-0007 (année omise)
    const pn = /^([a-z]+)(\d{2,})$/.exec(c), partiel = k => (c.length >= 3 && (k.includes(c) || k.endsWith(c))) || (pn && k.startsWith(pn[1]) && k.endsWith(pn[2]));
    const r = [];
    index.forEach(x => {
      if (types && !types.includes(x.type)) return;
      if (!mots.every(m => x.texte.includes(m)) && !x.cles.some(partiel)) return;
      const t = norm(x.titre);
      let s = 0;
      if (x.cles.some(k => k === c)) s += 100; else if (x.cles.some(k => (c.length >= 3 && (k.endsWith(c) || k.startsWith(c))) || (pn && k.startsWith(pn[1]) && k.endsWith(pn[2])))) s += 60;
      if (t.startsWith(mots[0])) s += 30;
      s += mots.filter(m => new RegExp(`(^| )${m.replace(/[.+]/g, '\\$&')}( |$)`).test(t)).length * 10;
      s -= TYPES.findIndex(([k]) => k === x.type) * 0.1; // à égalité : chantiers, clients, devis… d'abord
      r.push({ ...x, score: s });
    });
    return r.sort((a, b) => b.score - a.score).slice(0, max);
  }
  return { indexer, chercher, TYPES, ROUTE, norm };
})();
if (typeof module !== 'undefined') module.exports = RechercheGlobale;

/* ---------- Navigateur : palette de recherche ---------- */
if (typeof window !== 'undefined') {
  const RG = { index: null, cle: '', sel: 0, res: [] };
  const cleDonnees = () => RechercheGlobale.TYPES.map(([c]) => `${(Store.all(c) || []).length}:${Math.max(0, ...(Store.all(c) || []).map(x => x._v || 0))}`).join('|');
  const indexActuel = () => {
    const k = cleDonnees();
    if (RG.cle !== k) {
      const data = Object.fromEntries(RechercheGlobale.TYPES.map(([c]) => [c, Store.all(c)]));
      RG.index = RechercheGlobale.indexer(data, { nomDe: id => (id ? clientName(id) : ''), affaire: id => (id ? affaireOf(id) : {}) }); RG.cle = k;
    }
    return RG.index;
  };
  // Types affichés : ceux dont l'écran est accessible à ce compte
  const typesVisibles = () => { const m = accesMasques(); return RechercheGlobale.TYPES.map(([k]) => k).filter(k => !Acces.routeMasquee(RechercheGlobale.ROUTE[k], [], m, MENU_OF, Store.me.role)); };
  const libelleType = k => (RechercheGlobale.TYPES.find(([c]) => c === k) || [])[1] || k;

  function ouvrir(depart = '') {
    // Pas par-dessus une autre fenêtre (formulaire en cours), ni pour les compagnons
    if (!Store.me || Store.me.role === 'atelier' || !document.getElementById('modal').classList.contains('hidden')) return;
    const box = Modal.open(`<div class="rg"><input id="rg-q" type="search" autocomplete="off" placeholder="Chantier, client, n° de devis ou de facture, référence, personne…" aria-label="Recherche globale" value="${esc(depart)}">
      <div id="rg-res" class="rg-res" role="listbox"></div><div class="rg-aide"><span class="muted small">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</span><button class="small secondary" id="rg-fermer">Fermer</button></div></div>`);
    box.classList.add('rg-modal');
    const q = box.querySelector('#rg-q'), zone = box.querySelector('#rg-res');
    box.querySelector('#rg-fermer').onclick = () => Modal.close();
    // Fourniture, matériel, équipement : liste filtrée sur l'élément ; sinon sa fiche
    const aller = x => {
      Modal.close();
      const filtre = { articles: () => { biblioEtat.q = (Store.get('articles', x.id) || {}).ref || x.titre; }, materiels: () => { parcFiltre.q = x.titre; }, equipementsFrigo: () => { fluidesFiltre.q = x.titre; } }[x.type];
      const cible = filtre ? (filtre(), x.lien.split('?')[0]) : x.lien;
      if (location.hash === cible) App.render(); else location.hash = cible;
    };
    const dessiner = () => {
      RG.res = q.value.trim() ? RechercheGlobale.chercher(indexActuel(), q.value, { types: typesVisibles() }) : [];
      RG.sel = Math.min(RG.sel, Math.max(0, RG.res.length - 1));
      let dernier = '';
      zone.innerHTML = !q.value.trim() ? '<p class="muted small">Tapez quelques lettres : CH-2026-001, Laiterie, DV-0007, inox DN50, Kevin…</p>'
        : RG.res.length ? RG.res.map((x, i) => { const t = x.type !== dernier ? `<div class="rg-type">${esc(libelleType(x.type))}</div>` : ''; dernier = x.type;
          return `${t}<a href="${esc(x.lien)}" class="rg-item ${i === RG.sel ? 'sel' : ''}" data-rg="${i}" role="option"><strong>${esc(x.titre)}</strong>${x.sous ? `<span class="small muted">${esc(x.sous)}</span>` : ''}</a>`; }).join('')
          : '<p class="muted small">Aucun résultat.</p>';
      zone.querySelectorAll('[data-rg]').forEach(a => a.onclick = ev => { ev.preventDefault(); aller(RG.res[+a.dataset.rg]); });
      const s = zone.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    };
    let t = null;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { RG.sel = 0; dessiner(); }, 80); };
    q.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); RG.sel = Math.min(RG.sel + 1, RG.res.length - 1); dessiner(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); RG.sel = Math.max(RG.sel - 1, 0); dessiner(); }
      else if (e.key === 'Enter' && RG.res[RG.sel]) { e.preventDefault(); aller(RG.res[RG.sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); Modal.close(); }
    };
    dessiner(); q.focus(); q.select();
  }
  window.ouvrirRechercheGlobale = ouvrir;
  document.addEventListener('keydown', e => {
    const champ = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target && e.target.isContentEditable);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !champ)) { e.preventDefault(); ouvrir(); }
  });
  document.addEventListener('click', e => { if (e.target.closest('#recherche-globale')) { e.preventDefault(); ouvrir(); } });
}
