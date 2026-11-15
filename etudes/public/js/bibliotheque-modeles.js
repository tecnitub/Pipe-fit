// Bibliothèque de modèles partagée entre les études : un modèle du registre des équipements (CTA, pompe, PAC, groupe
// froid, vase, terminal, radiateur, extracteur…) lu sur sa fiche et validé par le bureau d'études y est enregistré avec
// ses valeurs, sa fiche technique (lien vers la bibliothèque des fiches du CRM quand elle y est) et les derniers prix
// fournisseurs connus (date, fournisseur). Dans une autre étude, on le reprend sans relire la fiche (recherche par
// famille, fabricant, référence, grandeur) : il entre au registre de l'étude. Un modèle = un fabricant + une référence
// (et un type) : l'enregistrer à nouveau avec d'autres valeurs ou une autre fiche crée une nouvelle version (anciennes
// gardées). Partie pure (navigateur, serveur, tests) puis affichage (navigateur).
const BibliothequeModeles = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const Rg = () => essai(() => (typeof Registre !== 'undefined' ? Registre : require('./registre')));
  const sansAccents = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => sansAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const cleRef = s => sansAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleFab = s => sansAccents(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const txt = (v, n = 200) => String(v ?? '').trim().slice(0, n);
  const vide = v => v === undefined || v === null || v === '';
  const nombre = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const jour = d => (/^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const uid = () => `bm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  // Familles (types du registre) proposées à la recherche
  const FAMILLES_DEFAUT = { cta: 'Centrale de traitement d\'air', generateur: 'Générateur (chaudière, PAC, groupe froid)', pompe: 'Pompe, circulateur', terminal: 'Terminal', vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS',
    bouche: 'Bouche, diffuseur', robinet: 'Vanne, robinetterie', sanitaire: 'Appareil sanitaire', regulateur: 'Régulateur', drvUE: 'Unité extérieure DRV / VRF', radiateur: 'Radiateur', echangeur: 'Échangeur à plaques',
    deshu: 'Déshumidificateur', groupeFroid: 'Groupe de chambre froide', extracteur: 'Extracteur, tourelle, caisson', tampon: 'Ballon tampon', fumee: 'Conduit de fumée', capteur: 'Capteur', accessoireSan: 'Accessoire sanitaire' };
  const familles = () => { const R = Rg(); return R ? Object.fromEntries(Object.entries(R.TYPES).filter(([k]) => !(R.NON_INSCRITS || []).includes(k))) : FAMILLES_DEFAUT; };
  // Grandeurs de recherche : [clé des valeurs, libellé, unité]
  const GRANDEURS = [['P', 'Puissance', 'kW'], ['Pch', 'Puissance chaud', 'kW'], ['Pfr', 'Puissance froid', 'kW'], ['Q', 'Débit', 'm³/h'], ['Qs', 'Débit soufflé', 'm³/h'], ['Qair', 'Débit d\'air', 'm³/h'],
    ['H', 'Hauteur manométrique', 'mCE'], ['V', 'Volume', 'L'], ['dn', 'DN', ''], ['kv', 'Kvs', 'm³/h']];
  const cle = (type, fabricant, reference) => `${type}|${cleFab(fabricant)}|${cleRef(reference)}`;

  // Un modèle du registre peut-il être partagé ? '' si oui, sinon la raison
  function raisonRefus(x) {
    if (!x) return 'modèle introuvable';
    const R = Rg();
    if (R && (R.NON_INSCRITS || []).includes(x.type)) return 'document commercial';
    if (x.gamme) return 'documentation de gamme : modèle à choisir';
    if (!txt(x.fabricant) || !txt(x.reference)) return 'fabricant et référence exacte requis';
    if (!Object.values(x.valeurs || {}).some(v => !vide(v))) return 'aucune valeur lue sur la fiche';
    return '';
  }
  // Valeurs gardées : nombres et textes courts (courbes Q:H, abaques compris), 80 au plus
  const propresValeurs = v => Object.fromEntries(Object.entries(v || {}).filter(([k, y]) => /^[\w.-]{1,40}$/.test(k) && !vide(y) && (typeof y === 'number' ? Number.isFinite(y) : typeof y === 'string' || typeof y === 'boolean')).slice(0, 80)
    .map(([k, y]) => [k, typeof y === 'string' ? y.slice(0, 2000) : y]));
  const propreFiche = f => (f && (f.id || f.fichierId || f.nom || f.url) ? { ...(f.id ? { id: txt(f.id, 64) } : {}), ...(f.fichierId ? { fichierId: txt(f.fichierId, 64) } : {}), nom: txt(f.nom, 200), date: txt(f.date, 10),
    ...(/^https?:\/\//.test(f.url || '') ? { url: txt(f.url, 500) } : {}), ...(f.remplacee ? { remplacee: true } : {}) } : null);
  const proprePrix = p => { const v = nombre(p && p.prix); return p && txt(p.fournisseur) && v > 0 ? { fournisseur: txt(p.fournisseur, 120), prix: Math.round(v * 100) / 100, date: jour(p.date), ...(txt(p.unite) ? { unite: txt(p.unite, 10) } : {}), ...(txt(p.source) ? { source: txt(p.source, 120) } : {}) } : null; };

  // Entrée de la bibliothèque depuis un modèle du registre (null si le modèle ne peut pas être partagé)
  function depuisRegistre(x, { fiche = null, prix = [], par = '', le = '' } = {}) {
    if (raisonRefus(x)) return null;
    return nettoyer({ type: x.type, fabricant: x.fabricant, reference: x.reference, nom: x.nom || '', valeurs: x.valeurs, fiche: fiche || x.ficheBiblio || null, prix: [].concat(prix || []), validePar: par, valideLe: le || jour() });
  }
  // Entrée nettoyée (bornes de taille, champs connus) : utilisée aussi par le serveur avant l'enregistrement
  function nettoyer(e) {
    const type = txt(e && e.type, 30);
    if (!type || !txt(e.fabricant) || !txt(e.reference)) return null;
    return { id: /^[\w-]{1,64}$/.test(String(e.id || '')) ? e.id : uid(), cle: cle(type, e.fabricant, e.reference), type, fabricant: txt(e.fabricant, 80), reference: txt(e.reference, 120), nom: txt(e.nom, 160),
      valeurs: propresValeurs(e.valeurs), fiche: propreFiche(e.fiche), prix: (Array.isArray(e.prix) ? e.prix : []).map(proprePrix).filter(Boolean).slice(-30),
      version: Math.max(1, Math.round(Number(e.version) || 1)), versions: (Array.isArray(e.versions) ? e.versions : []).slice(-10).map(v => ({ version: Math.max(1, Math.round(Number(v.version) || 1)), valeurs: propresValeurs(v.valeurs), fiche: propreFiche(v.fiche), le: jour(v.le), par: txt(v.par, 80) })),
      validePar: txt(e.validePar, 80), valideLe: jour(e.valideLe), ...(e.etudes ? { etudes: (Array.isArray(e.etudes) ? e.etudes : []).map(x => txt(x, 64)).filter(Boolean).slice(-30) } : {}) };
  }
  const memesValeurs = (a, b) => { const ka = Object.keys(a || {}).filter(k => !vide(a[k])), kb = Object.keys(b || {}).filter(k => !vide(b[k])); return ka.length === kb.length && ka.every(k => String(a[k]) === String((b || {})[k])); };
  const memeFiche = (a, b) => (!a && !b) || (!!a && !!b && (a.id || a.url || a.nom) === (b.id || b.url || b.nom) && (a.date || '') === (b.date || ''));
  // Prix ajoutés (même fournisseur, même date : le dernier l'emporte) ; 30 au plus
  function fusionPrix(l, nouveaux) {
    const out = [...(l || [])];
    (nouveaux || []).map(proprePrix).filter(Boolean).forEach(p => { const i = out.findIndex(q => norm(q.fournisseur) === norm(p.fournisseur) && q.date === p.date); if (i >= 0) out[i] = p; else out.push(p); });
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }
  // Intègre une entrée dans la liste (doublon : même type + fabricant + référence). Statut : 'ajoute' (nouveau modèle),
  // 'version' (valeurs ou fiche changées : l'ancienne version est gardée), 'prix' (seuls des prix ajoutés), 'identique'
  function integrer(liste, entree, { par = '', le = '', etudeId = '' } = {}) {
    const e = nettoyer(entree), l = [...(liste || [])];
    if (!e) return { liste: l, statut: 'refuse', entree: null };
    const i = l.findIndex(y => y.cle === e.cle);
    if (i < 0) { const n = { ...e, version: 1, versions: [], valideLe: jour(le || e.valideLe), validePar: txt(par || e.validePar, 80), ...(etudeId ? { etudes: [etudeId] } : {}) }; l.push(n); return { liste: l, statut: 'ajoute', entree: n }; }
    const ex = { ...l[i] }, change = !memesValeurs(ex.valeurs, e.valeurs) || (e.fiche && !memeFiche(ex.fiche, e.fiche)), prixAvant = JSON.stringify(ex.prix || []);
    if (change) {
      ex.versions = [...(ex.versions || []), { version: ex.version || 1, valeurs: ex.valeurs, fiche: ex.fiche, le: ex.valideLe, par: ex.validePar }].slice(-10);
      Object.assign(ex, { version: (ex.version || 1) + 1, valeurs: e.valeurs, fiche: e.fiche || ex.fiche, nom: e.nom || ex.nom, valideLe: jour(le || e.valideLe), validePar: txt(par || e.validePar, 80) });
    }
    ex.prix = fusionPrix(ex.prix, e.prix);
    if (etudeId) ex.etudes = [...new Set([...(ex.etudes || []), etudeId])].slice(-30);
    l[i] = ex;
    return { liste: l, statut: change ? 'version' : JSON.stringify(ex.prix) !== prixAvant ? 'prix' : 'identique', entree: ex };
  }
  // Derniers prix connus : le plus récent par fournisseur, du plus récent au plus ancien
  function prixRecents(entree) {
    const m = new Map();
    (entree && entree.prix || []).forEach(p => { const k = norm(p.fournisseur), x = m.get(k); if (!x || p.date >= x.date) m.set(k, p); });
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }
  // Prix fournisseurs relevés dans les consultations du CRM (lignes dont la désignation cite la référence)
  // lignes : [{ designation, fournisseur, prix, date, consultation }]
  function prixDepuisConsultations(lignes, entree) {
    const r = cleRef(entree && entree.reference);
    if (r.length < 3) return [];
    return (lignes || []).filter(l => cleRef(`${l.reference || ''} ${l.designation || ''}`).includes(r))
      .map(l => proprePrix({ fournisseur: l.fournisseur, prix: l.prix, date: l.date, unite: l.unite, source: l.consultation ? `Consultation ${l.consultation}` : 'Consultation' })).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  }

  // Recherche : texte (fabricant, référence, nom, famille ; un nombre est cherché aussi dans les valeurs), famille,
  // fabricant, grandeur ({ cle, valeur } : modèles à ±25 % de la valeur, les plus proches d'abord)
  function chercher(liste, { q = '', type = '', fabricant = '', grandeur = null } = {}) {
    const F = familles(), mots = norm(q).split(/[\s,;]+/).filter(Boolean);
    const g = grandeur && grandeur.cle && nombre(grandeur.valeur) > 0 ? { cle: grandeur.cle, v: nombre(grandeur.valeur) } : null;
    return (liste || []).map(e => {
      if (type && e.type !== type) return null;
      if (fabricant && !cleFab(e.fabricant).includes(cleFab(fabricant))) return null;
      let score = 1;
      if (mots.length) {
        const h = norm(`${e.fabricant} ${e.reference} ${e.nom} ${F[e.type] || e.type}`), hr = cleRef(`${e.fabricant} ${e.reference}`);
        for (const m of mots) {
          if (h.includes(m) || (cleRef(m).length >= 2 && hr.includes(cleRef(m)))) { score += cleRef(e.reference) === cleRef(m) ? 50 : 10; continue; }
          const n = nombre(m);
          if (Number.isFinite(n) && n > 0 && Object.values(e.valeurs || {}).some(v => typeof v === 'number' && Math.abs(v - n) <= n * 0.1)) { score += 5; continue; }
          return null;
        }
      }
      if (g) {
        const v = nombre((e.valeurs || {})[g.cle]);
        if (!(v > 0) || Math.abs(v - g.v) > g.v * 0.25) return null;
        score += 20 * (1 - Math.abs(v - g.v) / g.v);
      }
      return { entree: e, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.entree.fabricant.localeCompare(b.entree.fabricant) || a.entree.reference.localeCompare(b.entree.reference)).map(x => x.entree);
  }

  // Reprise dans une étude : le modèle entre au registre (ou y est mis à jour : mêmes type, fabricant et référence),
  // avec le lien vers sa version de la bibliothèque et sa fiche
  function versRegistre(et, entree) {
    const R = Rg(); if (!R || !entree) return null;
    const x = R.ajouter(et, { type: entree.type, fabricant: entree.fabricant, reference: entree.reference, valeurs: { ...(entree.valeurs || {}) }, nom: entree.nom || `${entree.fabricant} ${entree.reference}` });
    if (!x) return null;
    x.biblio = { id: entree.id, version: entree.version || 1, le: entree.valideLe || '' };
    if (entree.fiche) x.ficheBiblio = { ...entree.fiche }; else delete x.ficheBiblio;
    return x;
  }
  // Modèles du registre de l'étude face à la bibliothèque : partageables, déjà présents (à jour ou non), refusés
  function etatRegistre(et, liste) {
    return ((et && et.equipements) || []).map(x => {
      const raison = raisonRefus(x), ex = raison ? null : (liste || []).find(y => y.cle === cle(x.type, x.fabricant, x.reference)) || null;
      return { x, raison, entree: ex, etat: raison ? 'refuse' : !ex ? 'nouveau' : memesValeurs(ex.valeurs, x.valeurs) ? 'a-jour' : 'different' };
    });
  }
  // Résumé des valeurs d'une entrée (affichage)
  function resume(e) {
    // Libellés des grandeurs de recherche d'abord (« Q » d'une pompe : débit, pas les sorties d'un régulateur)
    const L = { ...(essai(() => Rg().libelles()) || {}), ...Object.fromEntries(GRANDEURS.map(([k, l, u]) => [k, [l, u]])) }, v = e.valeurs || {};
    const nf = y => (typeof y === 'number' ? String(Math.round(y * 100) / 100).replace('.', ',') : String(y).slice(0, 30));
    return Object.keys(v).filter(k => typeof v[k] === 'number' || String(v[k]).length < 30).slice(0, 6).map(k => `${(L[k] || [k])[0]} ${nf(v[k])}${(L[k] || [])[1] && !/[(]/.test(L[k][1]) ? ` ${L[k][1]}` : ''}`).join(' · ');
  }

  /* ---------- Affichage (navigateur) ---------- */
  let cache = null, chargement = null;
  const charger = (force = false) => {
    if (cache && !force) return Promise.resolve(cache);
    if (chargement && !force) return chargement;
    chargement = api('GET', '/api/bibliotheque-modeles').then(l => { cache = Array.isArray(l) ? l : []; return cache; }).catch(() => { cache = cache || []; return cache; }).finally(() => { chargement = null; });
    return chargement;
  };
  const e_ = s => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const dateF = d => (typeof dateFr === 'function' ? dateFr(d) : d);
  const prixHtml = e => { const p = prixRecents(e); return p.length ? p.slice(0, 3).map(x => `${e_(x.fournisseur)} : ${String(x.prix).replace('.', ',')} € HT${x.unite ? `/${e_(x.unite)}` : ''} (${dateF(x.date)})`).join(' · ') : '<span class="muted">aucun prix connu</span>'; };
  const ficheHtml = f => (!f ? '<span class="muted">sans fiche</span>' : f.fichierId ? `<a href="/api/pf/fichier/${encodeURIComponent(f.fichierId)}" target="_blank" rel="noopener">📄 ${e_(f.nom || 'Fiche')}</a>${f.date ? ` <span class="muted">(${dateF(f.date)})</span>` : ''}` : f.url ? `<a href="${e_(f.url)}" target="_blank" rel="noopener">📄 ${e_(f.nom || 'Fiche')}</a>` : `📄 ${e_(f.nom)}`);

  // Carte de l'étude : nombre de modèles communs, reprise et partage
  function carte(et) {
    if (!et || et.modele || typeof api !== 'function') return '';
    const n = cache ? cache.length : null;
    if (!cache) charger().then(() => { const z = document.querySelector('#biblio-modeles-nb'); if (z) z.textContent = `${cache.length} modèle(s) commun(s)`; });
    const partageables = etatRegistre(et, cache || []).filter(y => ['nouveau', 'different'].includes(y.etat)).length;
    return `<div class="carte petit" id="carte-biblio-modeles">📚 <strong>Bibliothèque de modèles</strong> (partagée entre les études) : <span id="biblio-modeles-nb">${n === null ? '…' : `${n} modèle(s) commun(s)`}</span>${partageables && cache ? ` · <span class="avert">${partageables} modèle(s) de l'étude à partager</span>` : ''}
      <span class="espace"></span><button class="secondaire petit" data-biblio-modeles="reprendre">🔎 Reprendre un modèle</button> <button class="secondaire petit" data-biblio-modeles="partager" ${(et.equipements || []).length ? '' : 'disabled title="Registre vide"'}>📤 Partager les modèles validés</button></div>`;
  }

  // Partage des modèles du registre : cochés = validés par la personne ; fiche de la bibliothèque du CRM, prix
  async function dialoguePartager(et) {
    const box = Modal.open('<h2>📤 Partager les modèles de l\'étude</h2><p>Lecture de la bibliothèque…</p>');
    box.classList.add('large');
    const liste = await charger(true), etats = etatRegistre(et, liste);
    // Fiches techniques de la bibliothèque du CRM (fabricant + référence exacte)
    let fiches = new Map();
    const dem = etats.filter(y => !y.raison).map(y => ({ cle: y.x.id, fabricant: y.x.fabricant, reference: y.x.reference }));
    if (dem.length) { try { const r = await api('POST', '/api/pf/fiches/trouver', { demandes: dem }); fiches = new Map(r.filter(z => z.fiche).map(z => [z.cle, z.fiche])); } catch (e) { /* bibliothèque indisponible */ } }
    const consult = ((typeof S !== 'undefined' && S.pf && S.pf.prixFournisseurs) || []);
    const LIB = { nouveau: '<span class="badge">nouveau</span>', 'a-jour': '<span class="badge ok">déjà dans la bibliothèque</span>', different: '<span class="badge avert">valeurs différentes : nouvelle version</span>', refuse: '' };
    box.innerHTML = `<h2>📤 Partager les modèles de l'étude</h2>
      <p class="muted petit">Cochez les modèles lus et vérifiés : ils entrent dans la bibliothèque commune avec leurs valeurs, leur fiche technique (bibliothèque des fiches du CRM) et le prix fournisseur saisi. Un modèle déjà présent (même fabricant et même référence) aux valeurs ou à la fiche différentes devient une nouvelle version ; l'ancienne est gardée.</p>
      <div style="max-height:55vh;overflow:auto"><table class="liste compact petit"><tr><th></th><th>Modèle</th><th>Valeurs</th><th>Fiche technique</th><th>Prix fournisseur (HT)</th><th>État</th></tr>
      ${etats.map((y, i) => { const f = fiches.get(y.x.id) || y.x.ficheBiblio || null, pc = prixDepuisConsultations(consult, y.x)[0];
        return `<tr><td>${y.raison ? '' : `<input type="checkbox" data-bmp="${i}" ${y.etat === 'a-jour' ? '' : 'checked'} aria-label="Partager">`}</td><td><strong>${e_(Rg().nomEq(y.x))}</strong><br><span class="muted">${e_(familles()[y.x.type] || y.x.type)}</span></td>
          <td>${e_(resume(y.x))}</td><td>${y.raison ? '' : ficheHtml(f)}</td>
          <td>${y.raison ? '' : `<input data-bmp-f="${i}" placeholder="Fournisseur" value="${e_(pc ? pc.fournisseur : '')}" style="width:9em"> <input data-bmp-p="${i}" inputmode="decimal" placeholder="Prix €" value="${pc ? String(pc.prix).replace('.', ',') : ''}" style="width:6em"> <input type="date" data-bmp-d="${i}" value="${e_(pc ? pc.date : (typeof aujourdhui === 'function' ? aujourdhui() : ''))}">`}</td>
          <td>${y.raison ? `<span class="muted">${e_(y.raison)}</span>` : `${LIB[y.etat]}${y.entree ? ` <span class="muted">v${y.entree.version || 1}</span>` : ''}`}</td></tr>`; }).join('')}</table></div>
      <div class="actions"><button class="secondaire" id="bmp-x">Fermer</button><button id="bmp-ok">📚 Enregistrer dans la bibliothèque</button></div>`;
    box.querySelector('#bmp-x').onclick = () => { Modal.close(); App.render(); };
    box.querySelector('#bmp-ok').onclick = async () => {
      const choix = [...box.querySelectorAll('[data-bmp]:checked')].map(c => +c.dataset.bmp);
      if (!choix.length) return toast('Cochez au moins un modèle.', 3000);
      const par = (S.me || {}).nom || (S.me || {}).login || '', r = { ajoute: 0, version: 0, prix: 0, identique: 0, refuse: 0 };
      for (const i of choix) {
        const y = etats[i], v = k => (box.querySelector(`[data-bmp-${k}="${i}"]`) || {}).value || '';
        const e = depuisRegistre(y.x, { fiche: fiches.get(y.x.id) || y.x.ficheBiblio || null, prix: v('p') ? [{ fournisseur: v('f'), prix: v('p'), date: v('d') }] : [], par });
        try { const o = await api('POST', '/api/bibliotheque-modeles', { entree: e, etudeId: et.id }); r[o.statut] = (r[o.statut] || 0) + 1; y.x.biblio = { id: o.entree.id, version: o.entree.version, le: o.entree.valideLe }; if (o.entree.fiche) y.x.ficheBiblio = o.entree.fiche; }
        catch (err) { r.refuse++; }
      }
      enregistrer(et); await charger(true); Modal.close(); App.render();
      toast(`Bibliothèque : ${r.ajoute} ajouté(s), ${r.version} nouvelle(s) version(s), ${r.prix} prix ajouté(s), ${r.identique} déjà à jour${r.refuse ? `, ${r.refuse} refusé(s)` : ''}.`, 6000);
    };
  }

  // Reprise d'un modèle de la bibliothèque dans l'étude (sans relire la fiche)
  async function dialogueReprendre(et) {
    const box = Modal.open('<h2>🔎 Reprendre un modèle de la bibliothèque</h2><p>Lecture de la bibliothèque…</p>');
    box.classList.add('large');
    let liste = await charger(true);
    const F = familles(), admin = (S.me || {}).role === 'admin';
    box.innerHTML = `<h2>🔎 Reprendre un modèle de la bibliothèque</h2>
      <p class="muted petit">Modèles lus et validés dans d'autres études : valeurs de la fiche, fiche technique et derniers prix fournisseurs. « Reprendre » l'inscrit au registre de cette étude (placez-le ensuite dans les calculs depuis le registre).</p>
      <div class="grille-champs"><label>Recherche (fabricant, référence, nom, valeur)<input id="bmr-q" placeholder="Ex. ACME CTA 4500"></label>
        <label>Famille<select id="bmr-t"><option value="">Toutes</option>${Object.entries(F).filter(([k]) => liste.some(e => e.type === k)).map(([k, l]) => `<option value="${e_(k)}">${e_(l)}</option>`).join('')}</select></label>
        <label>Fabricant<select id="bmr-f"><option value="">Tous</option>${[...new Set(liste.map(e => e.fabricant))].sort((a, b) => a.localeCompare(b)).map(f => `<option>${e_(f)}</option>`).join('')}</select></label>
        <label>Grandeur<select id="bmr-g"><option value="">—</option>${GRANDEURS.map(([k, l, u]) => `<option value="${k}">${e_(l)}${u ? ` (${u})` : ''}</option>`).join('')}</select></label><label>Valeur (± 25 %)<input id="bmr-v" inputmode="decimal"></label></div>
      <div id="bmr-res" style="max-height:52vh;overflow:auto"></div><div class="actions"><button class="secondaire" id="bmr-x">Fermer</button></div>`;
    const q = s => box.querySelector(s);
    const rendre = () => {
      const r = chercher(liste, { q: q('#bmr-q').value, type: q('#bmr-t').value, fabricant: q('#bmr-f').value, grandeur: q('#bmr-g').value ? { cle: q('#bmr-g').value, valeur: q('#bmr-v').value } : null });
      const dansEtude = new Set((et.equipements || []).map(x => cle(x.type, x.fabricant, x.reference)));
      q('#bmr-res').innerHTML = !liste.length ? '<p class="muted">Bibliothèque vide : partagez d\'abord les modèles validés d\'une étude (« Partager les modèles validés »).</p>' : !r.length ? '<p class="muted">Aucun modèle ne correspond.</p>'
        : `<p class="petit">${r.length} modèle(s)</p><table class="liste compact petit"><tr><th>Modèle</th><th>Valeurs</th><th>Fiche</th><th>Derniers prix</th><th>Version</th><th></th></tr>${r.slice(0, 80).map(e => `<tr>
          <td><strong>${e_(e.fabricant)} ${e_(e.reference)}</strong><br><span class="muted">${e_(F[e.type] || e.type)}${e.nom ? ` · ${e_(e.nom)}` : ''}</span></td><td>${e_(resume(e))}</td><td>${ficheHtml(e.fiche)}</td><td>${prixHtml(e)}</td>
          <td>v${e.version || 1}<br><span class="muted">${dateF(e.valideLe)}${e.validePar ? ` · ${e_(e.validePar)}` : ''}</span></td>
          <td style="white-space:nowrap"><button class="petit" data-bmr="${e_(e.id)}">${dansEtude.has(e.cle) ? '🔁 Mettre à jour' : '➕ Reprendre'}</button>${admin ? ` <button class="icone" data-bmr-suppr="${e_(e.id)}" title="Retirer de la bibliothèque">🗑️</button>` : ''}</td></tr>`).join('')}</table>`;
      box.querySelectorAll('[data-bmr]').forEach(b => b.onclick = () => {
        const e = liste.find(y => y.id === b.dataset.bmr), x = versRegistre(et, e);
        if (!x) return toast('Reprise impossible.', 3000);
        const k = Rg().propager(et); enregistrer(et);
        toast(`${Rg().nomEq(x)} inscrit au registre de l'étude (version ${e.version || 1} de la bibliothèque)${k ? ` — ${k} valeur(s) mise(s) à jour dans les calculs` : ' : placez-le depuis le registre'}.`, 6000); rendre();
      });
      box.querySelectorAll('[data-bmr-suppr]').forEach(b => b.onclick = async () => {
        try { await api('DELETE', `/api/bibliotheque-modeles/${encodeURIComponent(b.dataset.bmrSuppr)}`); liste = await charger(true); rendre(); } catch (err) { toast(`Suppression refusée : ${err.message}`, 4000); }
      });
    };
    ['#bmr-q', '#bmr-v'].forEach(s => { q(s).oninput = rendre; });
    ['#bmr-t', '#bmr-f', '#bmr-g'].forEach(s => { q(s).onchange = rendre; });
    q('#bmr-x').onclick = () => { Modal.close(); App.render(); };
    rendre();
  }
  if (typeof document !== 'undefined') document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-biblio-modeles]'); if (!b) return;
    const m = /#\/etude\/([^/]+)/.exec(location.hash), et = m && typeof S !== 'undefined' && S.etudes.find(x => x.id === m[1]);
    if (!et) return;
    if (b.dataset.biblioModeles === 'partager') dialoguePartager(et); else dialogueReprendre(et);
  });

  return { GRANDEURS, familles, cle, raisonRefus, depuisRegistre, nettoyer, integrer, memesValeurs, prixRecents, prixDepuisConsultations, fusionPrix, chercher, versRegistre, etatRegistre, resume, carte, charger, dialoguePartager, dialogueReprendre };
})();
if (typeof module !== 'undefined') module.exports = BibliothequeModeles;
