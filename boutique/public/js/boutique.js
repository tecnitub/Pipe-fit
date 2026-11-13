// Boutique TECNITUB : pages, configurateurs, panier et commande (application d'une page, navigation par #).
(function () {
  'use strict';
  const C = window.Catalogue, D = window.Dessins;
  const app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (+n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const num = n => String(n).replace('.', ',');
  const $ = (s, r = app) => r.querySelector(s);
  const $$ = (s, r = app) => [...r.querySelectorAll(s)];

  /* ---------- Stockage local (panier, coordonnées) ---------- */
  const stock = {
    lire(k, def) { try { const v = localStorage.getItem('tecnitub-' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    ecrire(k, v) { try { localStorage.setItem('tecnitub-' + k, JSON.stringify(v)); } catch (e) { /* navigation privée : le panier reste en mémoire */ } },
  };
  let panier = stock.lire('panier', []);
  const sauverPanier = () => { stock.ecrire('panier', panier); majBadge(); };
  function majBadge() {
    const n = panier.reduce((s, l) => s + l.qte, 0);
    document.getElementById('badge-panier').textContent = n;
    document.getElementById('badge-panier').classList.toggle('vide', !n);
  }

  function toast(msg, type = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = `toast visible ${type}`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3200);
  }
  async function appel(url, corps) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    return j;
  }

  /* ---------- Configuration commune (série, diamètre, épaisseur, nuance, finition) ---------- */
  const configDefaut = (p = {}) => ({ serie: p.serie || 'iso', dn: p.serie === 'din' ? 'DN50' : 'DN50', ep: p.serie === 'din' ? 1.5 : 2, nuance: '316L', finition: p.finitionImposee || 'decape' });
  function corrigerConfig(c, p = {}) {
    if (p.serie) c.serie = p.serie;
    const dims = C.SERIES[c.serie].dims;
    let d = dims.find(x => x.dn === c.dn);
    if (!d || (p.reduction && dims.indexOf(d) < 1)) { d = dims.find(x => x.dn === 'DN50') || dims[Math.min(4, dims.length - 1)]; c.dn = d.dn; }
    if (!d.ep.includes(+c.ep)) c.ep = d.ep[0];
    c.ep = +c.ep;
    if (p.finitionImposee && c.finition === 'decape') c.finition = p.finitionImposee;
    return c;
  }
  const options = (liste, val) => liste.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  function champsConfig(c, p = {}) {
    const dims = C.SERIES[c.serie].dims, d = C.dimension(c.serie, c.dn);
    const dispo = p.reduction ? dims.slice(1) : dims;
    return `
      <label class="champ"><span>Série</span><select name="serie"${p.serie ? ' disabled' : ''}>${options(Object.entries(C.SERIES).map(([k, s]) => [k, s.nom]), c.serie)}</select></label>
      <label class="champ"><span>Diamètre${p.reduction ? ' (grand côté)' : ''}</span><select name="dn">${options(dispo.map((x, i) => [x.dn, `${x.dn} — Ø ${num(x.de)} mm${p.reduction ? ` → ${dims[dims.indexOf(x) - 1].dn}` : ''}`]), c.dn)}</select></label>
      <label class="champ"><span>Épaisseur</span><select name="ep">${options(d.ep.map(e => [e, `${num(e)} mm`]), c.ep)}</select></label>
      <label class="champ"><span>Nuance</span><select name="nuance">${options(Object.entries(C.NUANCES).map(([k, n]) => [k, n.nom]), c.nuance)}</select></label>
      ${p.sansFinition ? '' : `<label class="champ"><span>État de surface</span><select name="finition">${options(Object.entries(C.FINITIONS).filter(([k]) => !(p.finitionImposee && k === 'decape')).map(([k, f]) => [k, f.nom]), c.finition)}</select></label>`}`;
  }
  function lireConfig(form, c) {
    ['serie', 'dn', 'ep', 'nuance', 'finition'].forEach(k => { const el = form.elements[k]; if (el && !el.disabled) c[k] = k === 'ep' ? +el.value : el.value; });
    return c;
  }
  function champsOptions(sel = []) {
    return `<fieldset class="options"><legend>Options qualité</legend>${Object.entries(C.OPTIONS).map(([k, o]) =>
      `<label class="case"><input type="checkbox" name="opt" value="${k}"${sel.includes(k) ? ' checked' : ''}> ${esc(o.nom)} <em>+ ${eur(o.prix)} ${o.par === 'piece' ? '/ pièce' : '/ commande'}</em></label>`).join('')}</fieldset>`;
  }
  const lireOptions = form => [...form.querySelectorAll('input[name="opt"]:checked')].map(i => i.value);

  // Prix « à partir de » : la configuration la moins chère de la série de l'article
  function prixMini(p) {
    if (p.configurateur) return null;
    const serie = p.serie || 'iso', dims = C.SERIES[serie].dims;
    const c = { serie, dn: (p.reduction ? dims[1] : dims[0]).dn, nuance: '304L', finition: p.finitionImposee || 'decape' };
    c.ep = C.dimension(serie, c.dn).ep[0];
    if (p.longueur) return C.prixTubeM(c);
    try { return C.prixLigne({ produit: p.id, config: c, options: [] }); } catch (e) { return null; }
  }

  /* ---------- Pages ---------- */
  const ECHANTILLON = { serie: 'iso', dn: 'DN80', ep: 2, nuance: '316L', finition: 'decape', de: 88.9,
    troncons: [{ dir: 'E', l: 1400 }, { dir: 'H', l: 900 }, { dir: 'E', l: 1000 }, { dir: 'S', l: 800 }], ext: { a: 'collerette', b: 'collerette' } };

  function accueil() {
    return `
    <section class="hero">
      <div class="hero-int">
        <div class="hero-texte">
          <p class="surtitre">Atelier de préfabrication · Davézieux (07)</p>
          <h1>Tuyauterie inox préfabriquée,<br>livrée prête à poser.</h1>
          <p class="hero-chapo">Dessinez votre spool en ligne ou envoyez votre isométrique : nous le soudons en atelier en 304L ou 316L, le contrôlons et l'expédions repéré, bouchonné, avec ses certificats.</p>
          <div class="hero-actions">
            <a class="btn btn-primaire" href="#/spool">Configurer un spool</a>
            <a class="btn btn-secondaire" href="#/devis">Envoyer un plan</a>
          </div>
          <ul class="hero-preuves">
            <li><strong>10 j</strong> ouvrés pour un spool</li>
            <li><strong>3.1</strong> certificats EN 10204</li>
            <li><strong>${eur(C.FRANCO).replace(',00', '')}</strong> franco de port</li>
          </ul>
        </div>
        <div class="hero-visuel">${D.isometrique(ECHANTILLON, { largeur: 560, hauteur: 420, legende: false })}</div>
      </div>
    </section>

    <section class="bloc">
      <div class="bloc-int">
        <h2>Le catalogue</h2>
        <p class="bloc-chapo">Tous les éléments sont disponibles en 304L et 316L, de DN15 à DN200, en séries industrielle et agroalimentaire.</p>
        <div class="grille-familles">
          ${C.FAMILLES.map(f => `<a class="carte-famille" href="${['spool', 'collecteur'].includes(f.id) ? `#/${f.id}` : `#/catalogue/${f.id}`}">
            ${D.picto(f.icone)}<h3>${esc(f.nom)}</h3><p>${esc(f.texte)}</p></a>`).join('')}
        </div>
      </div>
    </section>

    <section class="bloc bloc-gris">
      <div class="bloc-int">
        <h2>Comment ça marche</h2>
        <ol class="etapes">
          <li><span class="etape-num">1</span><h3>Vous dessinez</h3><p>Tracé, diamètre, nuance et extrémités dans le configurateur, ou isométrique PDF, DWG, STEP ou PCF envoyé pour devis.</p></li>
          <li><span class="etape-num">2</span><h3>Nous vérifions</h3><p>Un technicien relit chaque commande sous 24 h et vous confirme le délai. Rien n'est lancé sans votre accord.</p></li>
          <li><span class="etape-num">3</span><h3>Nous fabriquons</h3><p>Débit, chanfreinage, soudure orbitale TIG sous inertage, décapage-passivation, contrôles et épreuve sur demande.</p></li>
          <li><span class="etape-num">4</span><h3>Vous posez</h3><p>Spools repérés selon vos plans, extrémités bouchonnées, livrés sur chantier avec certificats et PV.</p></li>
        </ol>
      </div>
    </section>

    <section class="bloc">
      <div class="bloc-int deux-col">
        <div>
          <h2>Pour quels réseaux</h2>
          <ul class="secteurs">
            <li><strong>Agroalimentaire et boissons</strong> — DIN 11850, poli Ra ≤ 0,8 µm, raccords DIN 11851 et clamp</li>
            <li><strong>Pharmacie et cosmétique</strong> — 316L électropoli, traçabilité des coulées</li>
            <li><strong>Génie climatique et eau</strong> — eau glacée, eau chaude sanitaire, eau de process</li>
            <li><strong>Industrie et chimie</strong> — air comprimé, vapeur basse pression, fluides corrosifs</li>
          </ul>
        </div>
        <div class="encart">
          <h3>Un projet plus important ?</h3>
          <p>Réseaux complets, collecteurs, skids, nourrices : envoyez vos plans, nous chiffrons sous 48 h ouvrées et pouvons assurer la pose avec nos équipes.</p>
          <a class="btn btn-primaire" href="#/devis">Demander un devis</a>
        </div>
      </div>
    </section>`;
  }

  function catalogue(famille) {
    const f = C.FAMILLES.find(x => x.id === famille);
    const produits = C.PRODUITS.filter(p => !f || p.famille === f.id);
    return `
    <section class="bloc"><div class="bloc-int">
      <nav class="fil"><a href="#/">Accueil</a> › ${f ? `<a href="#/catalogue">Catalogue</a> › ${esc(f.nom)}` : 'Catalogue'}</nav>
      <h1>${f ? esc(f.nom) : 'Catalogue'}</h1>
      <div class="catalogue">
        <aside class="filtres">
          <a href="#/catalogue" class="${!f ? 'actif' : ''}">Tous les produits</a>
          ${C.FAMILLES.map(x => `<a href="#/catalogue/${x.id}" class="${f && f.id === x.id ? 'actif' : ''}">${esc(x.nom)}</a>`).join('')}
        </aside>
        <div class="grille-produits">
          ${produits.map(p => { const pm = prixMini(p); return `
            <a class="carte-produit" href="${p.configurateur ? `#/${p.configurateur}` : `#/produit/${p.id}`}">
              <div class="carte-visuel">${D.picto(C.FAMILLES.find(x => x.id === p.famille).icone)}</div>
              <h3>${esc(p.nom)}</h3>
              <p>${esc(p.texte)}</p>
              <div class="carte-pied"><span class="prix">${pm != null ? `dès <strong>${eur(pm)}</strong> HT${p.longueur ? ' / m' : ''}` : '<strong>Prix calculé en ligne</strong>'}</span><span class="delai">${p.delai} j</span></div>
            </a>`; }).join('')}
        </div>
      </div>
    </div></section>`;
  }

  /* --- Fiche produit avec configuration --- */
  function produit(id) {
    const p = C.PRODUITS.find(x => x.id === id);
    if (!p || p.configurateur) { location.hash = p ? `#/${p.configurateur}` : '#/catalogue'; return ''; }
    const fam = C.FAMILLES.find(x => x.id === p.famille);
    const etat = { c: corrigerConfig(configDefaut(p), p), qte: 1, longueur: 3000 };
    setTimeout(() => {
      const form = $('#form-produit');
      const maj = () => {
        lireConfig(form, etat.c); corrigerConfig(etat.c, p);
        $('#champs-config').innerHTML = champsConfig(etat.c, p);
        calcul();
      };
      const calcul = () => {
        etat.qte = Math.max(1, Math.min(999, Math.floor(+form.elements.qte.value || 1)));
        const l = { produit: p.id, qte: etat.qte, config: { ...etat.c, longueur: p.longueur ? +form.elements.longueur.value : undefined, repere: form.elements.repere.value.trim() }, options: lireOptions(form) };
        try {
          const pu = C.prixLigne(l), r = C.remiseQte(etat.qte);
          const d = C.dimension(etat.c.serie, etat.c.dn);
          $('#prix-produit').innerHTML = `<div class="prix-grand">${eur(pu)} <small>HT / pièce</small></div>
            ${r ? `<div class="remise">Remise quantité −${r * 100} % : ${eur(pu * etat.qte * (1 - r))} HT</div>` : `<div class="remise discret">Remises dès 10 pièces (−5 %), 20 (−8 %) et 50 (−12 %)</div>`}
            <dl class="carac"><dt>Masse linéique</dt><dd>${num(C.masseM(d.de, etat.c.ep).toFixed(2))} kg/m</dd>
            ${p.longueur ? `<dt>Prix au mètre</dt><dd>${eur(C.prixTubeM(etat.c))} HT</dd>` : ''}
            <dt>Délai</dt><dd>${p.delai} jours ouvrés</dd></dl>`;
          form.querySelector('button[type=submit]').disabled = false;
          etat.ligne = l;
        } catch (e) { $('#prix-produit').innerHTML = `<p class="erreur">${esc(e.message)}</p>`; form.querySelector('button[type=submit]').disabled = true; }
      };
      form.addEventListener('change', e => (['serie', 'dn'].includes(e.target.name) ? maj() : (lireConfig(form, etat.c), calcul())));
      form.addEventListener('input', e => { if (['qte', 'longueur'].includes(e.target.name)) calcul(); });
      form.addEventListener('submit', e => { e.preventDefault(); calcul(); if (etat.ligne) ajouter(etat.ligne); });
      calcul();
    });
    return `
    <section class="bloc"><div class="bloc-int">
      <nav class="fil"><a href="#/">Accueil</a> › <a href="#/catalogue/${fam.id}">${esc(fam.nom)}</a> › ${esc(p.nom)}</nav>
      <div class="fiche">
        <div class="fiche-visuel">${D.picto(fam.icone, 'picto picto-grand')}</div>
        <form id="form-produit" class="fiche-form" novalidate>
          <h1>${esc(p.nom)}</h1>
          <p class="fiche-texte">${esc(p.texte)}</p>
          <div class="grille-champs" id="champs-config">${champsConfig(etat.c, p)}</div>
          <div class="grille-champs">
            ${p.longueur ? '<label class="champ"><span>Longueur de coupe (mm)</span><input type="number" name="longueur" min="100" max="6000" step="1" value="3000" inputmode="numeric"></label>' : ''}
            <label class="champ"><span>Quantité</span><input type="number" name="qte" min="1" max="999" value="1" inputmode="numeric"></label>
            <label class="champ"><span>Repère (facultatif)</span><input name="repere" maxlength="40" placeholder="ex. EG-12"></label>
          </div>
          ${champsOptions()}
          <div class="fiche-prix" id="prix-produit"></div>
          <button type="submit" class="btn btn-primaire btn-large">Ajouter au panier</button>
        </form>
      </div>
    </div></section>`;
  }

  /* --- Configurateur de spool --- */
  const MODELES = {
    z: { nom: 'Dévoiement en Z', troncons: [{ dir: 'E', l: 800 }, { dir: 'N', l: 600 }, { dir: 'E', l: 800 }] },
    piquage: { nom: 'Descente sur équipement', troncons: [{ dir: 'E', l: 1500 }, { dir: 'B', l: 1200 }, { dir: 'N', l: 400 }] },
    lyre: { nom: 'Lyre de dilatation', troncons: [{ dir: 'E', l: 1000 }, { dir: 'N', l: 800 }, { dir: 'E', l: 600 }, { dir: 'S', l: 800 }, { dir: 'E', l: 1000 }] },
    colonne: { nom: 'Colonne montante', troncons: [{ dir: 'N', l: 500 }, { dir: 'H', l: 2500 }, { dir: 'E', l: 700 }] },
  };
  let spool = stock.lire('spool', null) || { ...configDefaut(), troncons: MODELES.z.troncons.map(t => ({ ...t })), ext: { a: 'collerette', b: 'chanfrein' }, qte: 1, options: [], repere: '' };

  function pageSpool() {
    setTimeout(() => {
      const form = $('#form-spool');
      const rendreTroncons = () => {
        $('#troncons').innerHTML = spool.troncons.map((t, i) => `
          <div class="troncon" data-i="${i}">
            <span class="troncon-num">${i + 1}</span>
            <select data-champ="dir" aria-label="Direction du tronçon ${i + 1}">${options(Object.entries(C.NOM_DIR), t.dir)}</select>
            <label class="troncon-l"><input type="number" data-champ="l" min="50" max="6000" step="10" value="${t.l}" inputmode="numeric" aria-label="Longueur du tronçon ${i + 1} en mm"><span>mm</span></label>
            <button type="button" class="btn-icone" data-action="haut" title="Monter"${i ? '' : ' disabled'}>↑</button>
            <button type="button" class="btn-icone" data-action="suppr" title="Supprimer"${spool.troncons.length > 1 ? '' : ' disabled'}>✕</button>
          </div>`).join('');
      };
      const maj = (tout) => {
        lireConfig(form, spool); corrigerConfig(spool, {});
        if (tout) $('#champs-config').innerHTML = champsConfig(spool, {});
        spool.ext = { a: form.elements.extA.value, b: form.elements.extB.value };
        spool.qte = Math.max(1, Math.min(999, Math.floor(+form.elements.qte.value || 1)));
        spool.options = lireOptions(form);
        spool.repere = form.elements.repere.value.trim();
        stock.ecrire('spool', spool);
        const d = C.dimension(spool.serie, spool.dn);
        $('#vue-iso').innerHTML = D.isometrique({ ...spool, de: d.de });
        const btn = form.querySelector('button[type=submit]');
        try {
          const r = C.prixSpool(spool);
          const pu = C.prixLigne(ligneSpool()), rem = C.remiseQte(spool.qte);
          $('#devis-spool').innerHTML = `
            <table class="detail">${r.lignes.filter(l => l.montant).map(l => `<tr><td>${esc(l.lib)}</td><td>${eur(l.montant)}</td></tr>`).join('')}
            ${pu > r.total ? `<tr><td>Options par pièce</td><td>${eur(pu - r.total)}</td></tr>` : ''}
            <tr class="total"><td>Prix unitaire HT</td><td>${eur(pu)}</td></tr>
            ${rem ? `<tr><td>× ${spool.qte} avec remise −${rem * 100} %</td><td>${eur(pu * spool.qte * (1 - rem))}</td></tr>` : spool.qte > 1 ? `<tr><td>× ${spool.qte}</td><td>${eur(pu * spool.qte)}</td></tr>` : ''}
            </table>
            <p class="discret">${r.coudes} coude(s), ${r.soudures} soudure(s), ${num(r.longueurTube.toFixed(2))} m de tube · rayon de cintrage ${Math.round(r.rayon)} mm · masse ≈ ${num((r.longueurTube * C.masseM(d.de, spool.ep) * 1.1).toFixed(1))} kg</p>`;
          btn.disabled = false;
        } catch (e) { $('#devis-spool').innerHTML = `<p class="erreur">${esc(e.message)}</p>`; btn.disabled = true; }
      };
      const ligneSpool = () => ({ produit: 'spool-sur-mesure', qte: spool.qte, options: spool.options,
        config: { serie: spool.serie, dn: spool.dn, ep: spool.ep, nuance: spool.nuance, finition: spool.finition, troncons: spool.troncons.map(t => ({ ...t })), ext: { ...spool.ext }, repere: spool.repere } });

      form.addEventListener('change', e => {
        const tr = e.target.closest('.troncon');
        if (tr) { spool.troncons[+tr.dataset.i][e.target.dataset.champ] = e.target.dataset.champ === 'l' ? Math.round(+e.target.value) : e.target.value; }
        maj(['serie', 'dn'].includes(e.target.name));
      });
      form.addEventListener('input', e => {
        const tr = e.target.closest('.troncon');
        if (tr && e.target.dataset.champ === 'l') { spool.troncons[+tr.dataset.i].l = Math.round(+e.target.value); maj(); }
        else if (['qte', 'repere'].includes(e.target.name)) maj();
      });
      form.addEventListener('click', e => {
        const b = e.target.closest('button[data-action]');
        if (!b) return;
        const tr = b.closest('.troncon'), i = tr ? +tr.dataset.i : -1, a = b.dataset.action;
        if (a === 'suppr') spool.troncons.splice(i, 1);
        else if (a === 'haut' && i > 0) [spool.troncons[i - 1], spool.troncons[i]] = [spool.troncons[i], spool.troncons[i - 1]];
        else if (a === 'ajout') {
          if (spool.troncons.length >= 30) return toast('30 tronçons au maximum', 'erreur');
          const der = spool.troncons[spool.troncons.length - 1];
          const suivante = { E: 'N', N: 'E', O: 'N', S: 'E', H: 'E', B: 'E' }[der ? der.dir : 'H'];
          spool.troncons.push({ dir: suivante, l: 500 });
        } else if (a === 'modele') spool.troncons = MODELES[b.dataset.modele].troncons.map(t => ({ ...t }));
        else return;
        rendreTroncons(); maj();
      });
      form.addEventListener('submit', e => { e.preventDefault(); maj(); try { C.prixLigne(ligneSpool()); ajouter(ligneSpool()); } catch (err) { toast(err.message, 'erreur'); } });
      rendreTroncons(); maj();
    });
    const extOpts = v => options(Object.entries(C.EXTREMITES).map(([k, x]) => [k, x.nom]), v);
    return `
    <section class="bloc"><div class="bloc-int">
      <nav class="fil"><a href="#/">Accueil</a> › <a href="#/catalogue/spool">Spools préfabriqués</a> › Configurateur</nav>
      <h1>Spool sur mesure</h1>
      <p class="bloc-chapo">Décrivez le tracé tronçon par tronçon : longueurs entre axes, de l'extrémité A vers l'extrémité B. Un coude 90° 3D est posé à chaque changement de direction. Pour les piquages, tés et angles particuliers, <a href="#/devis">envoyez votre isométrique</a>.</p>
      <form id="form-spool" class="configurateur" novalidate>
        <div class="config-gauche">
          <fieldset><legend>Tube</legend><div class="grille-champs" id="champs-config">${champsConfig(spool, {})}</div></fieldset>
          <fieldset><legend>Tracé (cotes entre axes)</legend>
            <div class="modeles">Exemples : ${Object.entries(MODELES).map(([k, m]) => `<button type="button" class="puce" data-action="modele" data-modele="${k}">${esc(m.nom)}</button>`).join('')}</div>
            <div id="troncons"></div>
            <button type="button" class="btn btn-secondaire btn-petit" data-action="ajout">+ Ajouter un tronçon</button>
            <p class="discret">Un départ avec des piquages ? <a href="#/collecteur">Configurer un collecteur (1 à 5 piquages)</a></p>
          </fieldset>
          <fieldset><legend>Extrémités</legend><div class="grille-champs">
            <label class="champ"><span>Extrémité A (départ)</span><select name="extA">${extOpts(spool.ext.a)}</select></label>
            <label class="champ"><span>Extrémité B (arrivée)</span><select name="extB">${extOpts(spool.ext.b)}</select></label>
          </div></fieldset>
          ${champsOptions(spool.options)}
        </div>
        <div class="config-droite">
          <div class="vue-iso" id="vue-iso"></div>
          <div class="grille-champs">
            <label class="champ"><span>Quantité</span><input type="number" name="qte" min="1" max="999" value="${spool.qte}" inputmode="numeric"></label>
            <label class="champ"><span>Repère du spool</span><input name="repere" maxlength="40" value="${esc(spool.repere)}" placeholder="ex. ISO-04 / SP-2"></label>
          </div>
          <div id="devis-spool" class="devis-spool"></div>
          <button type="submit" class="btn btn-primaire btn-large">Ajouter au panier</button>
          <p class="discret">Chaque spool est relu par un technicien avant fabrication. Délai : 10 jours ouvrés après confirmation.</p>
        </div>
      </form>
    </div></section>`;
  }

  /* --- Configurateur de collecteur (corps droit + 1 à 5 piquages) --- */
  // Modèles métier : corps, extrémités et piquages complets
  const MODELES_COLLECTEUR = {
    nourrice: { nom: 'Nourrice chaufferie 4 départs + vidange', serie: 'iso', dn: 'DN100', ep: 2, finition: 'decape', longueur: 1600, ext: { a: 'collerette', b: 'fond' },
      piquages: [300, 600, 900, 1200].map(pos => ({ dn: 'DN50', orient: 'H', pos, h: 300, ext: 'collerette' })).concat([{ dn: 'DN15', orient: 'B', pos: 1450, h: 150, ext: 'chanfrein' }]) },
    air: { nom: 'Collecteur air comprimé 3 descentes', serie: 'iso', dn: 'DN50', ep: 2, finition: 'decape', longueur: 2400, ext: { a: 'chanfrein', b: 'fond' },
      piquages: [500, 1200, 1900].map(pos => ({ dn: 'DN20', orient: 'H', pos, h: 150, ext: 'chanfrein' })) },
    nep: { nom: 'Collecteur NEP 5 vannes (DIN, poli)', serie: 'din', dn: 'DN65', ep: 2, finition: 'poli', longueur: 2000, ext: { a: 'clamp', b: 'fond' },
      piquages: [300, 650, 1000, 1350, 1700].map(pos => ({ dn: 'DN40', orient: 'B', pos, h: 180, ext: 'clamp' })) },
    instrum: { nom: "Manchette d'instrumentation", serie: 'iso', dn: 'DN80', ep: 2, finition: 'decape', longueur: 500, ext: { a: 'collerette', b: 'collerette' },
      piquages: [{ dn: 'DN15', orient: 'H', pos: 170, h: 120, ext: 'chanfrein' }, { dn: 'DN15', orient: 'N', pos: 330, h: 120, ext: 'chanfrein' }] },
    eau: { nom: 'Collecteur eau glacée 2 départs', serie: 'iso', dn: 'DN150', ep: 2.6, finition: 'decape', longueur: 1400, ext: { a: 'collerette', b: 'fond' },
      piquages: [{ dn: 'DN80', orient: 'H', pos: 400, h: 350, ext: 'collerette' }, { dn: 'DN80', orient: 'H', pos: 900, h: 350, ext: 'collerette' }] },
  };
  // Modèle générique à n piquages sur le corps choisi : piquages deux diamètres en dessous, répartis régulièrement sur le dessus
  function modeleN(co, n) {
    const dims = C.SERIES[co.serie].dims, iC = dims.findIndex(x => x.dn === co.dn), dp = dims[Math.max(0, iC - 2)];
    const pas = Math.ceil(Math.max(250, dp.de + 150) / 50) * 50;
    co.longueur = Math.max(500, pas * (n + 1));
    const ext = (co.piquages && co.piquages[0] && co.piquages[0].ext) || 'collerette';
    co.piquages = Array.from({ length: n }, (_, i) => ({ dn: dp.dn, orient: 'H', pos: pas * (i + 1), h: Math.ceil((C.dimension(co.serie, co.dn).de / 2 + 200) / 10) * 10, ext }));
  }
  const repartir = co => co.piquages.forEach((p, i) => { p.pos = Math.round(co.longueur * (i + 1) / (co.piquages.length + 1) / 10) * 10; });
  const copieModele = m => ({ ...m, piquages: m.piquages.map(p => ({ ...p })), ext: { ...m.ext } });
  let collecteur = stock.lire('collecteur', null) || { ...copieModele(MODELES_COLLECTEUR.nourrice), nuance: '316L', qte: 1, options: [], repere: '' };

  function pageCollecteur() {
    setTimeout(() => {
      const form = $('#form-collecteur');
      const co = collecteur;
      const dimsPiq = () => { const dims = C.SERIES[co.serie].dims; return dims.slice(0, dims.findIndex(x => x.dn === co.dn) + 1); };
      // Diamètres de piquages ramenés dans ce que permet le corps
      const corrigerPiquages = () => { const ok = dimsPiq(); co.piquages.forEach(p => { if (!ok.some(x => x.dn === p.dn)) p.dn = ok[Math.max(0, ok.length - 3)].dn; }); };
      const rendrePiquages = () => {
        const ok = dimsPiq();
        $('#piquages').innerHTML = co.piquages.map((p, i) => `
          <div class="piquage" data-i="${i}">
            <span class="troncon-num">${i + 1}</span>
            <div class="piquage-champs">
            <label class="champ"><span>Diamètre</span><select data-champ="dn">${options(ok.map(x => [x.dn, x.dn]), p.dn)}</select></label>
            <label class="champ"><span>Orientation</span><select data-champ="orient">${options(Object.entries(C.ORIENTATIONS), p.orient)}</select></label>
            <label class="champ"><span>Position depuis A</span><input type="number" data-champ="pos" min="0" max="6000" step="10" value="${p.pos}" inputmode="numeric"></label>
            <label class="champ"><span>Hauteur (axe → bout)</span><input type="number" data-champ="h" min="50" max="2000" step="10" value="${p.h}" inputmode="numeric"></label>
            <label class="champ champ-large"><span>Raccordement</span><select data-champ="ext">${options(Object.entries(C.EXTREMITES).map(([k, x]) => [k, x.nom]), p.ext)}</select></label>
            </div>
            <button type="button" class="btn-icone" data-action="suppr" title="Supprimer le piquage"${co.piquages.length > 1 ? '' : ' disabled'}>✕</button>
          </div>`).join('');
        form.querySelector('[data-action="ajout"]').disabled = co.piquages.length >= 5;
        $$('[data-n]').forEach(b => b.classList.toggle('actif', +b.dataset.n === co.piquages.length));
      };
      const ligneCollecteur = () => ({ produit: 'collecteur-sur-mesure', qte: co.qte, options: co.options,
        config: { serie: co.serie, dn: co.dn, ep: co.ep, nuance: co.nuance, finition: co.finition, longueur: co.longueur, ext: { ...co.ext }, piquages: co.piquages.map(p => ({ ...p })), repere: co.repere } });
      const maj = tout => {
        lireConfig(form, co); corrigerConfig(co, {});
        if (tout) { $('#champs-config').innerHTML = champsConfig(co, {}); corrigerPiquages(); rendrePiquages(); }
        co.longueur = Math.round(+form.elements.longueur.value || 0);
        co.ext = { a: form.elements.extA.value, b: form.elements.extB.value };
        co.qte = Math.max(1, Math.min(999, Math.floor(+form.elements.qte.value || 1)));
        co.options = lireOptions(form);
        co.repere = form.elements.repere.value.trim();
        stock.ecrire('collecteur', co);
        const d = C.dimension(co.serie, co.dn);
        $('#vue-iso').innerHTML = D.isometriqueCollecteur({ ...co, de: d.de, piquages: co.piquages.map(p => ({ ...p, de: (C.dimension(co.serie, p.dn) || {}).de })) });
        const btn = form.querySelector('button[type=submit]');
        try {
          const r = C.prixCollecteur(co), pu = C.prixLigne(ligneCollecteur()), rem = C.remiseQte(co.qte);
          $('#devis-collecteur').innerHTML = `
            <table class="detail">${r.lignes.filter(l => l.montant).map(l => `<tr><td>${esc(l.lib)}</td><td>${eur(l.montant)}</td></tr>`).join('')}
            ${pu > r.total ? `<tr><td>Options par pièce</td><td>${eur(pu - r.total)}</td></tr>` : ''}
            <tr class="total"><td>Prix unitaire HT</td><td>${eur(pu)}</td></tr>
            ${rem ? `<tr><td>× ${co.qte} avec remise −${rem * 100} %</td><td>${eur(pu * co.qte * (1 - rem))}</td></tr>` : co.qte > 1 ? `<tr><td>× ${co.qte}</td><td>${eur(pu * co.qte)}</td></tr>` : ''}
            </table>
            <p class="discret">${r.piquages.length} piquage(s), ${r.soudures} soudure(s) · masse ≈ ${num((co.longueur / 1000 * C.masseM(d.de, co.ep) * 1.15).toFixed(1))} kg</p>`;
          btn.disabled = false;
        } catch (e) { $('#devis-collecteur').innerHTML = `<p class="erreur">${esc(e.message)}</p>`; btn.disabled = true; }
      };
      const champPiquage = e => {
        const row = e.target.closest('.piquage'); if (!row) return false;
        const k = e.target.dataset.champ, p = co.piquages[+row.dataset.i];
        p[k] = ['pos', 'h'].includes(k) ? Math.round(+e.target.value) : e.target.value;
        return true;
      };
      form.addEventListener('change', e => { champPiquage(e); maj(['serie', 'dn'].includes(e.target.name)); });
      form.addEventListener('input', e => { if ((e.target.type === 'number' && champPiquage(e)) || ['qte', 'repere', 'longueur'].includes(e.target.name)) maj(); });
      form.addEventListener('click', e => {
        const b = e.target.closest('button[data-action]'); if (!b) return;
        const a = b.dataset.action, row = b.closest('.piquage');
        if (a === 'suppr') co.piquages.splice(+row.dataset.i, 1);
        else if (a === 'ajout') {
          if (co.piquages.length >= 5) return;
          const der = co.piquages[co.piquages.length - 1] || { dn: dimsPiq()[0].dn, orient: 'H', h: 250, ext: 'collerette' };
          co.piquages.push({ ...der }); repartir(co);
        } else if (a === 'repartir') repartir(co);
        else if (a === 'n') { modeleN(co, +b.dataset.n); form.elements.longueur.value = co.longueur; }
        else if (a === 'modele') {
          const m = copieModele(MODELES_COLLECTEUR[b.dataset.modele]);
          Object.assign(co, m);
          form.elements.longueur.value = co.longueur; form.elements.extA.value = co.ext.a; form.elements.extB.value = co.ext.b;
          $('#champs-config').innerHTML = champsConfig(co, {});
        } else return;
        rendrePiquages(); maj();
      });
      form.addEventListener('submit', e => { e.preventDefault(); maj(); try { C.prixLigne(ligneCollecteur()); ajouter(ligneCollecteur()); } catch (err) { toast(err.message, 'erreur'); } });
      corrigerPiquages(); rendrePiquages(); maj();
    });
    const extOpts = v => options(Object.entries(C.EXTREMITES_CORPS).map(([k, x]) => [k, x.nom]), v);
    return `
    <section class="bloc"><div class="bloc-int">
      <nav class="fil"><a href="#/">Accueil</a> › <a href="#/catalogue/collecteur">Collecteurs et nourrices</a> › Configurateur</nav>
      <h1>Collecteur sur mesure</h1>
      <p class="bloc-chapo">Un corps droit de l'extrémité A vers l'extrémité B, et de 1 à 5 piquages perpendiculaires. Partez d'un modèle, puis ajustez diamètres, positions (axe du piquage depuis l'extrémité A) et hauteurs (de l'axe du corps au bout du piquage).</p>
      <form id="form-collecteur" class="configurateur" novalidate>
        <div class="config-gauche">
          <fieldset><legend>Modèles</legend>
            <div class="modeles">Nombre de piquages : ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="puce" data-action="n" data-n="${n}">${n}</button>`).join('')}</div>
            <div class="modeles">${Object.entries(MODELES_COLLECTEUR).map(([k, m]) => `<button type="button" class="puce" data-action="modele" data-modele="${k}">${esc(m.nom)}</button>`).join('')}</div>
          </fieldset>
          <fieldset><legend>Corps</legend>
            <div class="grille-champs" id="champs-config">${champsConfig(collecteur, {})}</div>
            <div class="grille-champs">
              <label class="champ"><span>Longueur du corps (mm)</span><input type="number" name="longueur" min="200" max="6000" step="10" value="${collecteur.longueur}" inputmode="numeric"></label>
              <label class="champ"><span>Extrémité A</span><select name="extA">${extOpts(collecteur.ext.a)}</select></label>
              <label class="champ"><span>Extrémité B</span><select name="extB">${extOpts(collecteur.ext.b)}</select></label>
            </div>
          </fieldset>
          <fieldset><legend>Piquages</legend>
            <div id="piquages"></div>
            <div class="modeles">
              <button type="button" class="btn btn-secondaire btn-petit" data-action="ajout">+ Ajouter un piquage</button>
              <button type="button" class="btn btn-lien btn-petit" data-action="repartir">Répartir régulièrement</button>
            </div>
          </fieldset>
          ${champsOptions(collecteur.options)}
        </div>
        <div class="config-droite">
          <div class="vue-iso" id="vue-iso"></div>
          <div class="grille-champs">
            <label class="champ"><span>Quantité</span><input type="number" name="qte" min="1" max="999" value="${collecteur.qte}" inputmode="numeric"></label>
            <label class="champ"><span>Repère</span><input name="repere" maxlength="40" value="${esc(collecteur.repere)}" placeholder="ex. COL-01"></label>
          </div>
          <div id="devis-collecteur" class="devis-spool"></div>
          <button type="submit" class="btn btn-primaire btn-large">Ajouter au panier</button>
          <p class="discret">Plus de 5 piquages, piquages inclinés ou réduits sur té ? <a href="#/devis">Envoyez votre plan</a>. Délai : 10 jours ouvrés après confirmation.</p>
        </div>
      </form>
    </div></section>`;
  }

  function ajouter(l) {
    panier.push({ ...l, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
    sauverPanier();
    toast('Ajouté au panier');
  }

  /* --- Panier --- */
  function miniIso(p, c) {
    const o = { largeur: 160, hauteur: 110, cotes: false, legende: false }, de = C.dimension(c.serie, c.dn).de;
    if (p.configurateur === 'collecteur') return D.isometriqueCollecteur({ ...c, de, piquages: c.piquages.map(q => ({ ...q, de: C.dimension(c.serie, q.dn).de })) }, o);
    return D.isometrique({ ...c, de }, o);
  }
  function pagePanier() {
    if (!panier.length) return `<section class="bloc"><div class="bloc-int vide-panier">
      <h1>Panier</h1><p>Votre panier est vide.</p><p><a class="btn btn-primaire" href="#/catalogue">Voir le catalogue</a> <a class="btn btn-secondaire" href="#/spool">Configurer un spool</a></p></div></section>`;
    let t;
    try { t = C.totaliser(panier); } catch (e) {
      // Ligne devenue invalide (catalogue modifié) : retirée
      panier = panier.filter(l => { try { C.prixLigne(l); return true; } catch (er) { return false; } }); sauverPanier();
      return pagePanier();
    }
    setTimeout(() => {
      $('#table-panier').addEventListener('change', e => {
        const tr = e.target.closest('[data-id]'); if (!tr) return;
        const l = panier.find(x => x.id === tr.dataset.id);
        l.qte = Math.max(1, Math.min(999, Math.floor(+e.target.value || 1)));
        sauverPanier(); route();
      });
      $('#table-panier').addEventListener('click', e => {
        const b = e.target.closest('button[data-action="retirer"]'); if (!b) return;
        panier = panier.filter(x => x.id !== b.closest('[data-id]').dataset.id); sauverPanier(); route();
      });
    });
    const manque = C.FRANCO - t.sousTotal;
    return `
    <section class="bloc"><div class="bloc-int">
      <h1>Panier</h1>
      <div class="panier">
        <div class="table-defile"><table class="table-panier" id="table-panier">
          <thead><tr><th>Article</th><th>Prix unitaire HT</th><th>Qté</th><th>Montant HT</th><th></th></tr></thead>
          <tbody>${t.lignes.map((l, i) => { const p = C.PRODUITS.find(x => x.id === l.produit); return `
            <tr data-id="${esc(panier[i].id)}">
              <td class="art">${p.configurateur ? `<div class="mini-iso">${miniIso(p, l.config)}</div>` : D.picto(C.FAMILLES.find(f => f.id === p.famille).icone, 'picto picto-mini')}
                <div><strong>${esc(p.nom)}</strong><br><span class="discret">${esc(C.designation(l).split(' · ').slice(1).join(' · '))}</span>
                ${l.options.length ? `<br><span class="discret">Options : ${l.options.map(o => esc(C.OPTIONS[o].nom)).join(', ')}</span>` : ''}</div></td>
              <td data-titre="Prix unitaire">${eur(l.pu)}</td>
              <td data-titre="Quantité"><input type="number" min="1" max="999" value="${l.qte}" aria-label="Quantité" class="qte"></td>
              <td data-titre="Montant">${eur(l.montant)}${l.remise ? `<br><span class="remise">−${l.remise * 100} %</span>` : ''}</td>
              <td><button type="button" class="btn-icone" data-action="retirer" title="Retirer">✕</button></td>
            </tr>`; }).join('')}</tbody>
        </table></div>
        <aside class="recap">
          ${recap(t)}
          ${manque > 0 ? `<p class="franco">Plus que <strong>${eur(manque)}</strong> HT pour la livraison offerte.</p>` : '<p class="franco ok">Livraison offerte.</p>'}
          <a class="btn btn-primaire btn-large" href="#/commande">Commander</a>
          <a class="btn btn-lien" href="#/catalogue">Continuer mes achats</a>
        </aside>
      </div>
    </div></section>`;
  }
  const recap = t => `<table class="totaux">
    <tr><td>Sous-total HT</td><td>${eur(t.sousTotal)}</td></tr>
    ${t.certificats ? `<tr><td>Certificats matière 3.1</td><td>${eur(t.certificats)}</td></tr>` : ''}
    <tr><td>Transport</td><td>${t.port ? eur(t.port) : 'offert'}</td></tr>
    <tr class="sep"><td>Total HT</td><td>${eur(t.ht)}</td></tr>
    <tr><td>TVA 20 %</td><td>${eur(t.tva)}</td></tr>
    <tr class="total"><td>Total TTC</td><td>${eur(t.ttc)}</td></tr></table>
    <p class="discret">Expédition prévue sous ${t.delai} jours ouvrés après confirmation.</p>`;

  /* --- Commande --- */
  const champ = (nom, lib, val = '', attrs = '') => `<label class="champ"><span>${lib}</span><input name="${nom}" value="${esc(val)}" ${attrs}></label>`;
  function pageCommande() {
    if (!panier.length) { location.hash = '#/panier'; return ''; }
    const t = C.totaliser(panier), cl = stock.lire('client', {});
    setTimeout(() => {
      const form = $('#form-commande');
      form.elements.autreAdresse.addEventListener('change', e => { $('#bloc-livraison').hidden = !e.target.checked; });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const f = form.elements, v = k => f[k].value.trim();
        const client = { societe: v('societe'), siret: v('siret'), tva: v('tvaintra'), nom: v('nom'), email: v('email'), tel: v('tel'), adresse: v('adresse'), cp: v('cp'), ville: v('ville') };
        const livraison = f.autreAdresse.checked ? { adresse: v('liv_adresse'), cp: v('liv_cp'), ville: v('liv_ville'), contact: v('liv_contact'), creneau: v('liv_creneau') } : { contact: v('liv_contact'), creneau: v('liv_creneau') };
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Envoi…';
        try {
          const r = await appel('api/commandes', { client, livraison, paiement: f.paiement.value, reference: v('reference'), message: v('message'), cgv: f.cgv.checked,
            lignes: panier.map(({ produit, qte, config, options }) => ({ produit, qte, config, options })) });
          stock.ecrire('client', client);
          stock.ecrire('derniere', { ...r, email: client.email });
          panier = []; sauverPanier();
          location.hash = `#/confirmation/${r.numero}`;
        } catch (err) { toast(err.message, 'erreur'); btn.disabled = false; btn.textContent = 'Valider la commande'; }
      });
    });
    return `
    <section class="bloc"><div class="bloc-int">
      <nav class="fil"><a href="#/panier">Panier</a> › Commande</nav>
      <h1>Commande</h1>
      <form id="form-commande" class="commande">
        <div>
          <fieldset><legend>Société</legend><div class="grille-champs">
            ${champ('societe', 'Raison sociale *', cl.societe, 'required autocomplete="organization"')}
            ${champ('siret', 'SIRET', cl.siret, 'inputmode="numeric" maxlength="17" placeholder="14 chiffres"')}
            ${champ('tvaintra', 'N° TVA intracommunautaire', cl.tva)}
            ${champ('nom', 'Contact *', cl.nom, 'required autocomplete="name"')}
            ${champ('email', 'E-mail *', cl.email, 'required type="email" autocomplete="email"')}
            ${champ('tel', 'Téléphone', cl.tel, 'type="tel" autocomplete="tel"')}
          </div></fieldset>
          <fieldset><legend>Adresse de facturation</legend><div class="grille-champs">
            ${champ('adresse', 'Adresse *', cl.adresse, 'required autocomplete="street-address" class="large"')}
            ${champ('cp', 'Code postal *', cl.cp, 'required inputmode="numeric" maxlength="5" autocomplete="postal-code"')}
            ${champ('ville', 'Ville *', cl.ville, 'required autocomplete="address-level2"')}
          </div></fieldset>
          <fieldset><legend>Livraison</legend>
            <label class="case"><input type="checkbox" name="autreAdresse"> Livrer à une autre adresse (chantier)</label>
            <div class="grille-champs" id="bloc-livraison" hidden>
              ${champ('liv_adresse', 'Adresse du chantier')}${champ('liv_cp', 'Code postal', '', 'inputmode="numeric" maxlength="5"')}${champ('liv_ville', 'Ville')}
            </div>
            <div class="grille-champs">${champ('liv_contact', 'Contact sur place (nom, téléphone)')}${champ('liv_creneau', 'Créneau / contraintes d\'accès', '', 'placeholder="ex. hayon, 7 h – 12 h"')}</div>
          </fieldset>
          <fieldset><legend>Paiement</legend>
            <label class="case"><input type="radio" name="paiement" value="virement" checked> Virement à la commande <em>— fabrication lancée à réception</em></label>
            <label class="case"><input type="radio" name="paiement" value="compte"> Sur compte client, 30 jours fin de mois <em>— après ouverture de compte (SIRET obligatoire)</em></label>
          </fieldset>
          <fieldset><legend>Informations</legend><div class="grille-champs">
            ${champ('reference', 'Votre référence / n° de bon de commande', '', 'maxlength="60"')}
            <label class="champ large"><span>Message</span><textarea name="message" rows="3" maxlength="2000" placeholder="Précisions pour l'atelier, plan de repérage…"></textarea></label>
          </div></fieldset>
        </div>
        <aside class="recap">
          <h2>Récapitulatif</h2>
          <p class="discret">${t.lignes.length} ligne(s), ${t.lignes.reduce((s, l) => s + l.qte, 0)} pièce(s)</p>
          ${recap(t)}
          <label class="case"><input type="checkbox" name="cgv" required> J'accepte les <a href="#/cgv" target="_blank">conditions générales de vente</a></label>
          <button type="submit" class="btn btn-primaire btn-large">Valider la commande</button>
          <p class="discret">Vous recevrez l'accusé de réception par e-mail. Un technicien relit la commande avant fabrication.</p>
        </aside>
      </form>
    </div></section>`;
  }

  function confirmation(numero) {
    const d = stock.lire('derniere', {});
    return `<section class="bloc"><div class="bloc-int message-fin">
      <div class="coche">✓</div>
      <h1>Merci, commande ${esc(numero)} enregistrée</h1>
      ${d.numero === numero ? `<p>Montant : <strong>${eur(d.ht)} HT</strong> (${eur(d.ttc)} TTC) · expédition sous ${d.delai} jours ouvrés après confirmation.</p>` : ''}
      <p>Un technicien relit votre commande et vous confirme le délai sous 24 h ouvrées. En cas de paiement par virement, les coordonnées bancaires figurent sur l'accusé de réception.</p>
      <p><a class="btn btn-primaire" href="#/suivi/${esc(numero)}">Suivre la commande</a> <a class="btn btn-secondaire" href="#/">Retour à l'accueil</a></p>
    </div></section>`;
  }

  /* --- Devis sur plan --- */
  function pageDevis() {
    const cl = stock.lire('client', {});
    let fichiers = [];
    setTimeout(() => {
      const form = $('#form-devis'), zone = $('#zone-fichiers'), input = form.elements.fichiers;
      const afficher = () => {
        $('#liste-fichiers').innerHTML = fichiers.map((f, i) => `<li>${esc(f.nom)} <span class="discret">${(f.taille / 1048576).toFixed(1).replace('.', ',')} Mo</span> <button type="button" class="btn-icone" data-i="${i}" title="Retirer">✕</button></li>`).join('');
      };
      const ajouterFichiers = liste => {
        for (const f of liste) {
          if (fichiers.length >= 10) { toast('10 fichiers au maximum', 'erreur'); break; }
          if (f.size > 15 * 1048576) { toast(`${f.name} dépasse 15 Mo`, 'erreur'); continue; }
          fichiers.push({ nom: f.name, taille: f.size, fichier: f });
        }
        afficher();
      };
      input.addEventListener('change', () => { ajouterFichiers(input.files); input.value = ''; });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('survol'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('survol'); ajouterFichiers(e.dataTransfer.files); });
      $('#liste-fichiers').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { fichiers.splice(+b.dataset.i, 1); afficher(); } });
      const base64 = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(f); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const f = form.elements, v = k => f[k].value.trim();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Envoi…';
        try {
          const client = { societe: v('societe'), nom: v('nom'), email: v('email'), tel: v('tel'), cp: v('cp') };
          const r = await appel('api/devis', { client, message: v('message'), fluide: v('fluide'), pression: v('pression'), echeance: v('echeance'), chantier: v('chantier'),
            fichiers: await Promise.all(fichiers.map(async x => ({ nom: x.nom, base64: await base64(x.fichier) }))) });
          stock.ecrire('client', { ...cl, ...client });
          app.innerHTML = `<section class="bloc"><div class="bloc-int message-fin"><div class="coche">✓</div><h1>Demande ${esc(r.numero)} envoyée</h1>
            <p>Nous étudions vos plans et revenons vers vous sous 48 h ouvrées avec un devis détaillé.</p><p><a class="btn btn-secondaire" href="#/">Retour à l'accueil</a></p></div></section>`;
          window.scrollTo(0, 0);
        } catch (err) { toast(err.message, 'erreur'); btn.disabled = false; btn.textContent = 'Envoyer la demande'; }
      });
    });
    return `
    <section class="bloc"><div class="bloc-int">
      <h1>Devis sur plan</h1>
      <p class="bloc-chapo">Réseaux complets, spools avec piquages ou angles particuliers, collecteurs, nourrices, skids : envoyez vos isométriques ou votre maquette. Réponse sous 48 h ouvrées.</p>
      <form id="form-devis" class="commande">
        <div>
          <fieldset><legend>Vos coordonnées</legend><div class="grille-champs">
            ${champ('societe', 'Société *', cl.societe, 'required autocomplete="organization"')}
            ${champ('nom', 'Nom *', cl.nom, 'required autocomplete="name"')}
            ${champ('email', 'E-mail *', cl.email, 'required type="email" autocomplete="email"')}
            ${champ('tel', 'Téléphone', cl.tel, 'type="tel" autocomplete="tel"')}
            ${champ('cp', 'Code postal du chantier', '', 'inputmode="numeric" maxlength="5"')}
            ${champ('chantier', 'Nom du chantier / de l\'affaire')}
          </div></fieldset>
          <fieldset><legend>Le réseau</legend><div class="grille-champs">
            ${champ('fluide', 'Fluide véhiculé', '', 'placeholder="ex. eau glacée, CIP, air comprimé"')}
            ${champ('pression', 'Pression / température de service', '', 'placeholder="ex. 10 bar, 85 °C"')}
            ${champ('echeance', 'Date de besoin sur chantier', '', 'type="date"')}
            <label class="champ large"><span>Votre besoin *</span><textarea name="message" rows="5" maxlength="5000" required placeholder="Nombre de spools, diamètres, nuance, finition, contrôles attendus (radio, épreuve), pose souhaitée ou non…"></textarea></label>
          </div></fieldset>
        </div>
        <aside class="recap">
          <h2>Plans et documents</h2>
          <label class="zone-fichiers" id="zone-fichiers">
            <input type="file" name="fichiers" multiple accept=".pdf,.dwg,.dxf,.step,.stp,.ifc,.pcf,.jpg,.jpeg,.png,.xlsx,.zip">
            <strong>Déposez vos fichiers ici</strong><span>ou cliquez pour parcourir</span>
            <span class="discret">PDF, DWG, DXF, STEP, IFC, PCF, images, XLSX, ZIP — 15 Mo max par fichier</span>
          </label>
          <ul class="liste-fichiers" id="liste-fichiers"></ul>
          <button type="submit" class="btn btn-primaire btn-large">Envoyer la demande</button>
          <p class="discret">Vos plans servent uniquement à l'établissement du devis.</p>
        </aside>
      </form>
    </div></section>`;
  }

  /* --- Suivi de commande --- */
  const LIB_STATUT = { recue: 'Reçue', confirmee: 'Confirmée', fabrication: 'En fabrication', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée' };
  function pageSuivi(numero) {
    const d = stock.lire('derniere', {});
    setTimeout(() => {
      const form = $('#form-suivi');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const r = await appel('api/suivi', { numero: form.elements.numero.value.trim(), email: form.elements.email.value.trim() });
          const etapes = ['recue', 'confirmee', 'fabrication', 'expediee', 'livree'], idx = etapes.indexOf(r.statut);
          $('#resultat-suivi').innerHTML = `
            <h2>Commande ${esc(r.numero)} — ${esc(LIB_STATUT[r.statut])}</h2>
            ${r.statut === 'annulee' ? '<p class="erreur">Cette commande a été annulée.</p>' : `<ol class="frise">${etapes.map((s, i) => {
              const h = r.historique.find(x => x.statut === s);
              return `<li class="${i <= idx ? 'fait' : ''}"><span></span>${LIB_STATUT[s]}${h ? `<small>${new Date(h.date).toLocaleDateString('fr-FR')}</small>` : ''}</li>`; }).join('')}</ol>`}
            ${r.suiviTransport ? `<p>Suivi transporteur : <strong>${esc(r.suiviTransport)}</strong></p>` : ''}
            <table class="totaux">${r.lignes.map(l => `<tr><td>${l.qte} × ${esc(l.designation)}</td><td>${eur(l.montant)}</td></tr>`).join('')}
            <tr class="total"><td>Total HT</td><td>${eur(r.ht)}</td></tr></table>`;
        } catch (err) { $('#resultat-suivi').innerHTML = `<p class="erreur">${esc(err.message)}</p>`; }
      });
      if (numero && d.numero === numero) form.requestSubmit();
    });
    return `<section class="bloc"><div class="bloc-int etroit">
      <h1>Suivi de commande</h1>
      <form id="form-suivi" class="grille-champs suivi">
        ${champ('numero', 'Numéro de commande', numero || '', 'required placeholder="CMD-2026-0001"')}
        ${champ('email', 'E-mail de la commande', numero && d.numero === numero ? d.email : '', 'required type="email"')}
        <button type="submit" class="btn btn-primaire">Rechercher</button>
      </form>
      <div id="resultat-suivi"></div>
    </div></section>`;
  }

  /* --- Pages de contenu --- */
  function savoirFaire() {
    return `<section class="bloc"><div class="bloc-int contenu">
      <h1>Savoir-faire et qualité</h1>
      <p class="bloc-chapo">Depuis Davézieux, en Ardèche, TECNITUB conçoit, préfabrique et pose des réseaux de tuyauterie pour l'industrie, l'agroalimentaire et le génie climatique.</p>
      <div class="grille-atouts">
        <div><h3>Soudure orbitale TIG</h3><p>Soudage automatique sous inertage intérieur à l'argon : cordons réguliers, pénétration complète, aucune coloration intérieure. Soudeurs et modes opératoires qualifiés (ISO 9606-1, ISO 15614-1).</p></div>
        <div><h3>Matière tracée</h3><p>Tubes et raccords 304L (1.4307) et 316L (1.4404) de fabrication européenne. Certificats 3.1 selon EN 10204 sur demande, numéros de coulée reportés sur la liste des pièces.</p></div>
        <div><h3>Décapage-passivation</h3><p>Chaque soudure est décapée et passivée pour restaurer la couche protectrice de l'inox. Polissage mécanique Ra ≤ 0,8 µm ou électropolissage Ra ≤ 0,4 µm pour les applications hygiéniques.</p></div>
        <div><h3>Contrôles</h3><p>Contrôle visuel de 100 % des soudures, contrôle dimensionnel avant expédition. En option : épreuve hydraulique à 1,5 × PS avec procès-verbal, radiographie, ressuage, endoscopie.</p></div>
        <div><h3>Préparation au chantier</h3><p>Spools repérés selon vos isométriques, extrémités bouchonnées, emballage sous film. Livraison par transporteur ou par nos véhicules en Auvergne-Rhône-Alpes.</p></div>
        <div><h3>Pose</h3><p>Nos équipes de tuyauteurs peuvent assurer le montage, les soudures de raccordement sur site, les essais et le dossier des ouvrages exécutés.</p></div>
      </div>
      <h2>Tolérances de fabrication</h2>
      <table class="table-simple">
        <tr><th>Cote entre axes</th><td>± 2 mm jusqu'à 2 m, ± 3 mm au-delà</td></tr>
        <tr><th>Angle des coudes</th><td>± 0,5°</td></tr>
        <tr><th>Alignement des brides</th><td>Trous de boulons à cheval sur les axes principaux, sauf indication contraire</td></tr>
        <tr><th>Longueur de spool</th><td>6 m au maximum par tronçon, encombrement 2,4 × 2,4 × 6 m (transport)</td></tr>
      </table>
    </div></section>`;
  }
  function cgv() {
    return `<section class="bloc"><div class="bloc-int contenu etroit">
      <h1>Conditions générales de vente</h1>
      <p class="discret">Extrait — le texte complet est joint à chaque accusé de réception.</p>
      <h3>1. Clientèle</h3><p>La boutique est réservée aux professionnels. Les commandes sont passées au nom d'une société.</p>
      <h3>2. Prix</h3><p>Prix en euros hors taxes, départ atelier, calculés au jour de la commande. Transport offert à partir de ${eur(C.FRANCO)} HT, ${eur(C.PORT)} HT en dessous, France continentale.</p>
      <h3>3. Commande et fabrication</h3><p>La commande est ferme après confirmation écrite de TECNITUB. Les spools et coupes à longueur sont fabriqués sur mesure : ils ne sont ni repris ni échangés, sauf non-conformité à la commande.</p>
      <h3>4. Paiement</h3><p>Par virement à la commande, ou à 30 jours fin de mois pour les comptes ouverts. Pénalités de retard au taux légal et indemnité forfaitaire de 40 € pour frais de recouvrement.</p>
      <h3>5. Délais</h3><p>Les délais courent à partir de la confirmation de commande (et de la réception du paiement le cas échéant). Ils sont donnés à titre indicatif.</p>
      <h3>6. Réception</h3><p>Les réserves sur l'état des colis sont à porter sur le bon du transporteur et à confirmer sous 48 h. Les non-conformités sont à signaler sous 8 jours.</p>
      <h3>7. Garantie</h3><p>Garantie contre les défauts de fabrication d'un an à compter de la livraison, limitée au remplacement des pièces reconnues défectueuses.</p>
    </div></section>`;
  }

  /* ---------- Navigation ---------- */
  function route() {
    const [, page = '', arg] = (location.hash || '#/').slice(1).split('/');
    const vues = { '': accueil, catalogue: () => catalogue(arg), produit: () => produit(arg), spool: pageSpool, collecteur: pageCollecteur, panier: pagePanier, commande: pageCommande,
      confirmation: () => confirmation(arg), devis: pageDevis, suivi: () => pageSuivi(arg), 'savoir-faire': savoirFaire, cgv };
    const html = (vues[page] || accueil)();
    if (html === '') return;
    app.innerHTML = html;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('actif', a.dataset.nav === page || (page === 'produit' && a.dataset.nav === 'catalogue')));
    document.getElementById('nav').classList.remove('ouvert');
    document.querySelector('.burger').setAttribute('aria-expanded', 'false');
    const titres = { catalogue: 'Catalogue', produit: 'Produit', spool: 'Spool sur mesure', collecteur: 'Collecteur sur mesure', panier: 'Panier', commande: 'Commande', devis: 'Devis sur plan', suivi: 'Suivi de commande', 'savoir-faire': 'Savoir-faire', cgv: 'CGV' };
    document.title = `${titres[page] ? titres[page] + ' — ' : ''}TECNITUB — Tuyauterie inox préfabriquée`;
    window.scrollTo(0, 0);
  }
  document.querySelector('.burger').addEventListener('click', e => {
    const n = document.getElementById('nav'); n.classList.toggle('ouvert');
    e.currentTarget.setAttribute('aria-expanded', n.classList.contains('ouvert'));
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === 'tecnitub-panier') { panier = stock.lire('panier', []); majBadge(); } });
  majBadge(); route();
})();
