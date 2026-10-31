// Consultations fournisseurs (appels d'offres) : une demande de prix envoyée à plusieurs fournisseurs (PDF + tableau Excel
// à compléter), retour des offres (saisie ou import du tableau rempli), analyse comparative (mieux-disant global et par
// ligne, écart au prix de la bibliothèque), attribution et création des commandes.
const STATUTS_CONSULT_F = ['À consulter', 'Consulté', 'Offre reçue', 'Décline'];
const FILTRES_CONSULT = { q: '', statut: 'En cours' };

// Montants d'une offre : total des lignes chiffrées, remise, port
function offreTotaux(c, f) {
  const o = f.offre || {}, prix = o.prix || {};
  const lignes = (c.lignes || []).map((l, i) => ({ i, pu: prix[i] === '' || prix[i] === undefined ? null : num(prix[i]), qte: num(l.qte) }));
  const chiffrees = lignes.filter(l => l.pu !== null);
  const brut = sumBy(chiffrees, l => l.pu * l.qte), remise = brut * num(o.remise) / 100;
  return { brut, remise, port: num(o.port), net: brut - remise + num(o.port), nb: chiffrees.length, complet: chiffrees.length === lignes.length, pu: i => (prix[i] === '' || prix[i] === undefined ? null : num(prix[i]) * (1 - num(o.remise) / 100)) };
}
// Analyse : meilleur prix par ligne, classement des offres complètes, combinaison optimale ligne par ligne
function analyseOffres(c) {
  // Offres reçues et chiffrées (une offre reçue par e-mail compte une fois lue)
  const offres = (c.fournisseurs || []).filter(f => f.statut === 'Offre reçue').map(f => ({ f, t: offreTotaux(c, f) })).filter(o => o.t.nb);
  const meilleurs = (c.lignes || []).map((l, i) => {
    const cands = offres.map(o => ({ eid: o.f.entrepriseId, pu: o.t.pu(i) })).filter(x => x.pu !== null).sort((a, b) => a.pu - b.pu);
    return cands[0] || null;
  });
  const classement = offres.filter(o => o.t.complet).sort((a, b) => a.t.net - b.t.net);
  const parLigne = {};
  meilleurs.forEach((m, i) => { if (m) parLigne[i] = m.eid; });
  const fournisseursOpt = [...new Set(Object.values(parLigne))];
  const optimum = sumBy((c.lignes || []).map((l, i) => i), i => (meilleurs[i] ? meilleurs[i].pu * num(c.lignes[i].qte) : 0)) + sumBy(fournisseursOpt, eid => num(((c.fournisseurs.find(f => f.entrepriseId === eid) || {}).offre || {}).port));
  return { offres, meilleurs, classement, parLigne, optimum, fournisseursOpt };
}

function consultationsTab() { return Store.all('consultations').filter(c => c.statut === 'En cours').length; }

Views.consultations = (params, query) => {
  if (params[0]) return consultationEditeur(params[0]);
  const f = lireFiltres('consultations', query, FILTRES_CONSULT);
  const list = Store.all('consultations').filter(c => (!f.statut || c.statut === f.statut) && correspond(f.q, c.ref, c.objet, affaireOf(c.affaireId).code, (c.fournisseurs || []).map(x => clientName(x.entrepriseId)).join(' ')))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<h1>Achats</h1>${achatsTabs('consultations')}
  <p class="muted">Consultez plusieurs fournisseurs pour les mêmes fournitures : la demande de prix part avec un tableau Excel à compléter, les offres reviennent (saisie ou import du tableau rempli), le comparatif désigne le mieux-disant global et ligne par ligne, puis les commandes sont créées en un clic.</p>
  <div class="toolbar"><button id="cs-new">+ Nouvelle consultation</button></div>
  <div id="cs-boite" class="small muted"></div>
  ${barreFiltres(f, { recherche: 'Rechercher (n°, objet, chantier, fournisseur…)', statuts: [['En cours', 'En cours'], ['Attribuée', 'Attribuées'], ['', 'Toutes']], defauts: FILTRES_CONSULT })}
  ${list.length ? `<div class="table-wrap"><table data-colonnes="consultations"><tr><th>N°</th><th>Date</th><th>Objet</th><th>Chantier</th><th class="num">Lignes</th><th>Fournisseurs</th><th>Offres</th><th>Réponse avant</th><th>Statut</th></tr>
    ${list.map(c => { const fs = c.fournisseurs || [], recues = fs.filter(x => x.statut === 'Offre reçue').length;
      return `<tr class="clickable" data-go="#/consultations/${c.id}"><td>${esc(c.ref || '…')}</td><td>${dateFr(c.date)}</td><td>${esc(c.objet || '')}</td><td>${esc(affaireOf(c.affaireId).code || '')}</td><td class="num">${(c.lignes || []).length}</td>
        <td class="small">${fs.map(x => esc(clientName(x.entrepriseId))).join(', ')}</td><td>${recues}/${fs.length}</td><td class="${c.dateLimite && c.dateLimite < isoDate(new Date()) && c.statut === 'En cours' ? 'warn-text' : ''}">${dateFr(c.dateLimite)}</td><td>${badge(c.statut)}</td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucune consultation pour ces critères.</p>'}`;
};

// Rapports d'intervention du chantier où les compagnons ont noté des besoins (les 30 derniers jours)
function besoinsRapports(affaireId) {
  if (!affaireId) return [];
  const depuis = isoDate(addDays(new Date(), -30));
  return Store.all('rapports').filter(r => r.affaireId === affaireId && String(r.besoins || '').trim() && (r.date || '') >= depuis).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Choix des fournisseurs à consulter : recherche (nom, secteur, ville, contact, familles livrées), filtres, plusieurs à la fois.
// Les fournisseurs habituels des articles de la demande puis les plus commandés (12 mois) passent devant.
const filtresFourn = { secteur: '', famille: '', dep: '', dejaCommande: false };
function choisirFournisseurs(c) {
  const deja = new Set((c.fournisseurs || []).map(f => f.entrepriseId));
  const fiches = RechercheFournisseurs.indexer({ fournisseurs: fournisseursList().filter(e => e.categorie !== 'Maîtrise d\'œuvre' && !deja.has(e.id)), articles: Store.all('articles'),
    commandes: Store.all('commandes'), contacts: Store.all('contacts'), depuis: isoDate(addDays(new Date(), -365)) });
  const artsDemande = (c.lignes || []).map(l => l.articleId).filter(Boolean);
  const famillesDemande = [...new Set(artsDemande.map(id => (Store.get('articles', id) || {}).famille).filter(Boolean))];
  const secteurs = [...new Set(fiches.map(f => f.e.secteur).filter(Boolean))].sort();
  const familles = [...new Set([...famillesDemande, ...fiches.flatMap(f => f.familles)])];
  const deps = [...new Set(fiches.flatMap(f => f.deps))].sort();
  if (filtresFourn.famille && !familles.includes(filtresFourn.famille)) filtresFourn.famille = '';
  const choisis = new Set();
  const sel = (id, lib, liste, v) => (liste.length ? `<select id="${id}" aria-label="${lib}"><option value="">${lib}</option>${liste.map(x => `<option value="${esc(x)}" ${x === v ? 'selected' : ''}>${esc(x)}${famillesDemande.includes(x) && id === 'cf-fam' ? ' (dans la demande)' : ''}</option>`).join('')}</select>` : '');
  return dialog(`<div class="rc"><h2 style="margin-top:0">🔍 Fournisseurs à consulter</h2>
    <input id="cf-q" type="search" placeholder="Nom, secteur, ville, contact, famille d'articles…" autocomplete="off">
    <div class="rc-filtres">${sel('cf-sect', 'Tous les secteurs', secteurs, filtresFourn.secteur)}${sel('cf-fam', 'Toutes les familles', familles, filtresFourn.famille)}${sel('cf-dep', 'Tous les départements', deps, filtresFourn.dep)}
      <label class="check"><input type="checkbox" id="cf-cde" ${filtresFourn.dejaCommande ? 'checked' : ''}> Déjà commandé (12 mois)</label></div>
    <div id="cf-res" class="rc-res"></div>
    <div class="modal-actions"><span id="cf-n" class="muted small"></span><span style="flex:1"></span><button type="button" class="secondary" id="cf-x">Annuler</button><button type="button" id="cf-ok" disabled>Ajouter</button></div></div>`,
  (wrap, done) => {
    const $ = s => wrap.querySelector(s), q = $('#cf-q');
    const majBouton = () => { $('#cf-ok').disabled = !choisis.size; $('#cf-ok').textContent = choisis.size ? `Ajouter ${choisis.size} fournisseur${choisis.size > 1 ? 's' : ''}` : 'Ajouter'; };
    const maj = () => {
      const res = RechercheFournisseurs.filtrer(fiches, { q: q.value, ...filtresFourn }, artsDemande);
      $('#cf-n').textContent = `${res.length} fournisseur(s) sur ${fiches.length}`;
      $('#cf-res').innerHTML = res.slice(0, 80).map(f => `<label class="ligne-t cf-ligne"><input type="checkbox" data-cf="${f.e.id}" ${choisis.has(f.e.id) ? 'checked' : ''}>
        <span><strong>${esc(f.e.nom)}</strong>${f.habituel ? ` <span class="badge b-ok">habituel · ${f.habituel} article(s) de la demande</span>` : ''}
          <br><span class="small muted">${[f.e.secteur, f.villes.slice(0, 2).join(', '), f.familles.slice(0, 4).join(', ')].filter(Boolean).map(esc).join(' · ')}${f.nbCommandes ? ` · ${f.nbCommandes} commande(s), dernière le ${dateFr(f.derniere)}` : ''}${f.e.email ? '' : ' · <span class="warn-text">pas d\'e-mail</span>'}</span></span></label>`).join('')
        + (res.length > 80 ? `<p class="small muted">${res.length - 80} autre(s) : précisez la recherche.</p>` : '') || '<p class="muted">Aucun fournisseur ne correspond.</p>';
      wrap.querySelectorAll('[data-cf]').forEach(cb => cb.onchange = () => { cb.checked ? choisis.add(cb.dataset.cf) : choisis.delete(cb.dataset.cf); majBouton(); });
    };
    q.oninput = maj;
    [['#cf-sect', 'secteur'], ['#cf-fam', 'famille'], ['#cf-dep', 'dep']].forEach(([s, k]) => { const el = $(s); if (el) el.onchange = () => { filtresFourn[k] = el.value; maj(); }; });
    $('#cf-cde').onchange = () => { filtresFourn.dejaCommande = $('#cf-cde').checked; maj(); };
    $('#cf-x').onclick = () => done(null);
    $('#cf-ok').onclick = () => done([...choisis]);
    maj(); majBouton();
    setTimeout(() => q.focus(), 50);
  });
}

function nouvelleConsultation(base = {}) {
  return Store.upsert('consultations', { ref: '', objet: '', affaireId: '', date: isoDate(new Date()), dateLimite: isoDate(addDays(new Date(), 7)), dateLivraison: '', statut: 'En cours', lignes: [], fournisseurs: [], ...base });
}

function consultationEditeur(id) {
  const c = Store.get('consultations', id);
  if (!c) return '<p>Consultation introuvable. <a href="#/consultations">Retour</a></p>';
  const an = analyseOffres(c), fs = c.fournisseurs || [], lignes = c.lignes || [], ouverte = c.statut === 'En cours';
  const sources = [];
  if (c.affaireId) sources.push(['chantier', 'Fournitures du devis du chantier pas encore commandées']);
  if (c.affaireId && !liensChantier.has(c.affaireId)) chargerLiens(c.affaireId).then(l => { if (l.length && location.hash.includes(c.id)) App.render(); });
  if (lignesEtude(Store.get('affaires', c.affaireId)).length) sources.push(['etude', 'Équipements de l\'étude d\'exécution (CCTP)']);
  const besoinsCompagnons = besoinsRapports(c.affaireId);
  if (besoinsCompagnons.length) sources.push(['compagnons', `Matériel demandé par les compagnons (${besoinsCompagnons.length} rapport${besoinsCompagnons.length > 1 ? 's' : ''})`]);
  Store.all('chiffrages').slice(0, 8).forEach(x => sources.push([`chiffrage:${x.id}`, `Fournitures du chiffrage « ${x.nom} »`]));
  const totOffre = eid => an.offres.find(o => o.f.entrepriseId === eid);
  return `<div class="toolbar"><a href="#/consultations" class="btn secondary">← Consultations</a>${c.affaireId ? `<a class="btn secondary" href="#/chantier/${esc(c.affaireId)}">Chantier ${esc(affaireOf(c.affaireId).code || '')}</a>` : ''}<span class="spacer"></span>
    <button class="danger" id="cs-del">Supprimer</button></div>
  <h1>Consultation ${esc(c.ref || '')} ${badge(c.statut)}</h1>${envoisHtml('consultations', c.id)}
  <div class="card"><div class="grid2">
    <div class="field"><label for="cs-objet">Objet</label><input id="cs-objet" value="${esc(c.objet || '')}" ${ouverte ? '' : 'disabled'}></div>
    <div class="field"><label for="cs-aff">Chantier</label><select id="cs-aff" ${ouverte ? '' : 'disabled'}><option value="">Stock / frais généraux</option>${options(Store.all('affaires').filter(a => !a.archive || a.id === c.affaireId), c.affaireId, affaireLabel, false)}</select></div>
    <div class="field"><label for="cs-lim">Réponse attendue avant le</label><input id="cs-lim" type="date" value="${esc(c.dateLimite || '')}" ${ouverte ? '' : 'disabled'}></div>
    <div class="field"><label for="cs-liv">Livraison souhaitée</label><input id="cs-liv" type="date" value="${esc(c.dateLivraison || '')}" ${ouverte ? '' : 'disabled'}></div>
  </div></div>

  <h2>Fournitures demandées</h2>
  <div class="table-wrap"><table class="compact cs-lignes"><tr><th>N°</th><th>Désignation</th><th>Unité</th><th class="num">Qté</th><th class="num">Prix bibliothèque</th><th></th></tr>
    ${lignes.map((l, i) => `<tr data-i="${i}"><td>${i + 1}</td><td><input data-k="designation" value="${esc(l.designation)}" ${ouverte ? '' : 'disabled'}></td><td><input data-k="unite" value="${esc(l.unite || '')}" style="width:70px" ${ouverte ? '' : 'disabled'}></td>
      <td class="num"><input data-k="qte" type="number" step="any" value="${esc(l.qte)}" style="width:90px" ${ouverte ? '' : 'disabled'}></td><td class="num muted">${l.articleId ? eur((Store.get('articles', l.articleId) || {}).coutRevient) : ''}</td>
      <td>${ouverte ? `<button class="small danger" data-ldel="${i}" aria-label="Retirer">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucune ligne.</td></tr>'}</table></div>
  ${ouverte ? `<div class="toolbar">${articleSelect('cs-art')}<input id="cs-q" type="number" step="any" value="1" style="width:80px" aria-label="Quantité"><button class="secondary" id="cs-add">Ajouter</button><button class="secondary" id="cs-libre">Ligne libre</button><button class="secondary" id="cs-dicter">🎤 Dicter</button>
    ${sources.length ? `<select id="cs-src" style="width:auto"><option value="">Reprendre…</option>${sources.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>` : ''}</div>` : ''}

  ${window.PIPEFIT_DEMO && fs.some(f => f.statut !== 'Offre reçue') ? '<p class="note small">Démonstration : <button class="linklike" id="cs-exemple">téléchargez le devis d\'exemple de Téréva (PDF)</button>, puis « Importer l\'offre (PDF, Excel) » sur la ligne de Téréva : les lignes, références, prix nets, port, délai et validité sont repris automatiquement.</p>' : ''}
  <h2>Fournisseurs consultés</h2>
  <div id="cs-boite" class="small muted"></div>
  ${offresAClasserHtml(c)}
  <div class="table-wrap"><table><tr><th>Fournisseur</th><th>Statut</th><th>Envoyée le</th><th class="num">Offre nette HT</th><th>Délai</th><th></th></tr>
    ${fs.map(f => { const o = totOffre(f.entrepriseId), off = f.offre || {}; const id = `${c.id}~${f.entrepriseId}`;
      return `<tr><td><strong>${esc(clientName(f.entrepriseId))}</strong>${off.remarques ? `<br><span class="muted small">${esc(off.remarques)}</span>` : ''}${off.mail ? `<br><span class="small">📧 reçue par e-mail le ${new Date(off.mail.recuLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${off.aLire ? ' · <span class="badge b-warn">à lire</span>' : ''}</span>` : ''}${off.aLire && off.pieceId ? ` <button class="small" data-lire="${esc(f.entrepriseId)}">Lire l'offre</button>` : ''}</td><td><select data-fstatut="${esc(f.entrepriseId)}" style="width:auto">${optionsStr(STATUTS_CONSULT_F, f.statut)}</select></td>
        <td>${dateFr(f.envoyeLe)}</td><td class="num">${o ? `${eur(o.t.net)}${o.t.complet ? '' : `<br><span class="warn-text small">${o.t.nb}/${lignes.length} lignes</span>`}` : ''}</td><td>${off.delai ? `${esc(off.delai)} j` : ''}</td>
        <td class="nowrap"><button class="small secondary" data-pdf="consultation|${esc(id)}">PDF</button><button class="small secondary" data-xls="${esc(f.entrepriseId)}">Excel</button>${['admin', 'charge'].includes(Store.me.role) ? `<button class="small" data-mail="consultation|${esc(id)}">✉ Envoyer</button>` : ''}
          <button class="small secondary" data-offre="${esc(f.entrepriseId)}">${f.statut === 'Offre reçue' ? 'Modifier l\'offre' : 'Saisir l\'offre'}</button><label class="btn small secondary" title="PDF ou photo du devis du fournisseur, ou tableau Excel complété">Importer l'offre (PDF, Excel)<input type="file" data-import="${esc(f.entrepriseId)}" accept=".pdf,.xlsx,.csv,image/*" hidden></label>
          ${off.pieceId ? `<a class="btn small secondary" href="${fileUrl(off.pieceId)}${off.pieceNom ? `?nom=${encodeURIComponent(off.pieceNom)}` : ''}" target="_blank" rel="noopener" title="Offre reçue, reprise d'office dans la commande et jointe à son envoi">📎 Offre</a>` : ''}${ouverte && f.statut === 'À consulter' ? `<button class="small danger" data-fdel="${esc(f.entrepriseId)}" aria-label="Retirer">✕</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Ajoutez les fournisseurs à consulter.</td></tr>'}</table></div>
  ${ouverte ? `<div class="toolbar"><button id="cs-four">🔍 Ajouter des fournisseurs…</button>
    ${(() => { const hab = [...new Set(lignes.map(l => (Store.get('articles', l.articleId) || {}).fournisseurId).filter(x => x && !fs.some(f => f.entrepriseId === x)))]; return hab.length ? `<button class="secondary small" id="cs-hab">Ajouter les fournisseurs habituels (${hab.length})</button>` : ''; })()}</div>` : ''}

  ${an.offres.length ? `<h2>Analyse des offres</h2>${propositionHtml(c)}
  <div class="cards">
    ${an.classement[0] ? `<div class="card"><div class="label">Mieux-disant (offre complète)</div><div class="value" style="font-size:17px">${esc(clientName(an.classement[0].f.entrepriseId))}</div><div class="sub">${eur(an.classement[0].t.net)} HT${an.classement[1] ? ` · ${eur(an.classement[1].t.net - an.classement[0].t.net)} de moins que le 2e` : ''}</div></div>` : '<div class="card"><div class="label">Mieux-disant</div><div class="value" style="font-size:16px">—</div><div class="sub">aucune offre complète</div></div>'}
    <div class="card"><div class="label">Optimum ligne par ligne</div><div class="value">${eur(an.optimum)}</div><div class="sub">${an.fournisseursOpt.length} fournisseur(s), ports compris${an.classement[0] ? ` · gain ${eur(an.classement[0].t.net - an.optimum)}` : ''}</div></div>
    <div class="card"><div class="label">Budget (prix bibliothèque)</div><div class="value">${eur(sumBy(lignes, l => num((Store.get('articles', l.articleId) || {}).coutRevient) * num(l.qte)))}</div><div class="sub">${lignes.filter(l => l.articleId).length}/${lignes.length} lignes avec un prix de référence</div></div>
  </div>
  <div class="table-wrap"><table class="compact cs-comparatif"><tr><th>N°</th><th>Désignation</th><th class="num">Qté</th>${an.offres.map(o => `<th class="num">${esc(clientName(o.f.entrepriseId))}</th>`).join('')}<th class="num">Écart / bibliothèque</th>${ouverte ? '<th>Attribuer à</th>' : ''}</tr>
    ${lignes.map((l, i) => { const m = an.meilleurs[i], ref = num((Store.get('articles', l.articleId) || {}).coutRevient);
      return `<tr><td>${i + 1}</td><td>${esc(l.designation)}</td><td class="num">${fmt(l.qte, 2)} ${esc(l.unite || '')}</td>
        ${an.offres.map(o => { const pu = o.t.pu(i); return `<td class="num ${m && m.eid === o.f.entrepriseId ? 'meilleur' : ''}">${pu === null ? '<span class="muted">—</span>' : `${eur(pu)}<br><span class="muted small">${eur(pu * num(l.qte))}</span>`}</td>`; }).join('')}
        <td class="num ${m && ref && m.pu > ref ? 'neg' : m && ref ? 'pos' : ''}">${m && ref ? `${m.pu > ref ? '+' : ''}${fmt((m.pu / ref - 1) * 100, 1)} %` : ''}</td>
        ${ouverte ? `<td><select data-attr="${i}" style="width:auto"><option value="">—</option>${an.offres.filter(o => o.t.pu(i) !== null).map(o => `<option value="${esc(o.f.entrepriseId)}" ${((c.attribution || {})[i] || '') === o.f.entrepriseId ? 'selected' : ''}>${esc(clientName(o.f.entrepriseId))}</option>`).join('')}</select></td>` : ''}</tr>`; }).join('')}
    <tr class="subtotal"><td colspan="3">Total net (remise et port compris)</td>${an.offres.map(o => `<td class="num">${eur(o.t.net)}${o.t.remise ? `<br><span class="small">remise ${eur(o.t.remise)}</span>` : ''}${o.t.port ? `<br><span class="small">port ${eur(o.t.port)}</span>` : ''}</td>`).join('')}<td></td>${ouverte ? '<td></td>' : ''}</tr>
    <tr class="subtotal"><td colspan="3">Délai / validité</td>${an.offres.map(o => `<td class="num small">${o.f.offre.delai ? esc(o.f.offre.delai) + ' j' : '—'}${o.f.offre.validite ? ` · jusqu'au ${dateFr(o.f.offre.validite)}` : ''}</td>`).join('')}<td></td>${ouverte ? '<td></td>' : ''}</tr></table></div>
  ${ouverte ? `<div class="toolbar">
    ${an.classement[0] ? `<button class="secondary" id="cs-tout">Tout attribuer au mieux-disant (${esc(clientName(an.classement[0].f.entrepriseId))})</button>` : ''}
    <button class="secondary" id="cs-opt">Attribuer ligne par ligne au meilleur prix</button>
    <label class="check small"><input type="checkbox" id="cs-maj" checked> Mettre à jour le prix d'achat de la bibliothèque</label>
    <button id="cs-cmd" ${Object.values(c.attribution || {}).some(Boolean) ? '' : 'disabled'}>Créer les commandes</button></div>` : ''}` : ''}
  ${(c.commandeIds || []).length ? `<p class="note">Commandes créées : ${c.commandeIds.map(id => { const cm = Store.get('commandes', id); return cm ? `<a href="#/commandes/${id}">${esc(cm.numero || '…')} (${esc(clientName(cm.fournisseurId))})</a>` : ''; }).join(', ')}</p>` : ''}`;
}

// Document « demande de prix » pour un fournisseur (lignes sans prix)
function consultationDocument(c, eid) {
  const s = Store.data.settings, f = entreprise(eid), fSite = billingSite(eid), a = affaireOf(c.affaireId), liv = siteOf(a.clientId, a.siteId), o = Doc.t('demandePrix');
  return `${Doc.entete('demandePrix', `${o.titre} ${c.ref || ''}`, `Date : ${dateFr(c.date)}${a.code && o.chantier ? `<br>Chantier : ${esc(a.code)} – ${esc(a.nom)}` : ''}${c.dateLimite ? `<br><strong>Réponse attendue avant le ${dateFr(c.dateLimite)}</strong>` : ''}${c.dateLivraison && o.livraison ? `<br>Livraison souhaitée : ${dateFr(c.dateLivraison)}` : ''}`)}
    <div class="doc-parties"><div><strong>${esc(f.nom || '—')}</strong>${fSite ? `<br>${esc(fullAddress(fSite))}` : ''}${f.email ? `<br>${esc(f.email)}` : ''}</div>
    <div>${o.livraison ? (liv ? `Livraison : <strong>${esc(clientName(a.clientId))} – ${esc(liv.libelle)}</strong><br>${esc(fullAddress(liv))}` : `Livraison à notre atelier : ${esc(s.adresse)}`) : ''}</div></div>
    ${c.objet ? `<p class="doc-objet"><strong>Objet :</strong> ${esc(c.objet)}</p>` : ''}${Doc.intro('demandePrix')}
    <div class="table-wrap"><table class="doc-lines compact"><tr><th>N°</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th>Délai</th></tr>
    ${(c.lignes || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.designation)}</td><td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite || '')}</td><td></td><td></td></tr>`).join('')}</table></div>
    <p class="doc-conditions">Merci de préciser vos prix unitaires HT, remise éventuelle, frais de port, délai de livraison et durée de validité de l'offre. Le tableau Excel joint peut être complété et renvoyé tel quel.</p>
    ${Doc.pied('demandePrix')}`;
}

// Tableau Excel à compléter par le fournisseur (réimportable)
function excelConsultation(c, eid) {
  const H = v => ({ v, s: 'head' });
  const rows = [[{ v: `Demande de prix ${c.ref || ''} – ${Store.data.settings.societe}`, s: 'title' }], [{ v: `Fournisseur : ${clientName(eid)} · réponse avant le ${dateFr(c.dateLimite) || '…'} · ${c.objet || ''}`, s: 'muted' }], [],
    ['N°', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire HT', 'Délai (jours)', 'Remarque'].map(H),
    ...(c.lignes || []).map((l, i) => [i + 1, l.designation, l.unite || '', num(l.qte), '', '', '']),
    [], ['', { v: 'Remise globale (%)', s: 'bold' }, '', '', ''], ['', { v: 'Frais de port HT', s: 'bold' }, '', '', ''], ['', { v: 'Validité de l\'offre (jj/mm/aaaa)', s: 'bold' }, '', '', '']];
  return XLSX.build([{ name: 'Offre', cols: [6, 52, 9, 10, 16, 13, 30], freeze: 4, rows }]);
}
// Lecture du tableau renvoyé : prix par N° de ligne, remise, port, validité, délai le plus long
function lireOffreExcel(sheet, c) {
  const n = s => normRecherche(s).replace(/[^a-z0-9]/g, '');
  const iH = sheet.rows.findIndex(r => r.some(x => n(x) === 'n' || n(x) === 'no') && r.some(x => /prix|pu/.test(n(x))));
  if (iH < 0) throw new Error('Tableau non reconnu : colonnes « N° » et « Prix unitaire » introuvables.');
  const h = sheet.rows[iH].map(n), col = re => h.findIndex(x => re.test(x));
  const cN = col(/^(n|no|numero)$/), cP = col(/prix|^pu/), cD = col(/delai/), cR = col(/remarque|commentaire/);
  const prix = {}, delais = [], remarques = [];
  let remise = '', port = '', validite = '';
  const val = x => num(String(x ?? '').replace(/\s|€/g, '').replace(',', '.'));
  sheet.rows.slice(iH + 1).forEach(r => {
    const lib = n(r[1]);
    if (/remise/.test(lib)) remise = val(r[4]); else if (/port/.test(lib)) port = val(r[4]);
    else if (/validite/.test(lib)) { const v = String(r[4] || '').trim(); const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v); validite = m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''; }
    else {
      const i = parseInt(r[cN], 10) - 1;
      if (i >= 0 && i < (c.lignes || []).length && String(r[cP] ?? '').trim() !== '') prix[i] = val(r[cP]);
      if (cD >= 0 && num(r[cD])) delais.push(num(r[cD]));
      if (cR >= 0 && String(r[cR] || '').trim()) remarques.push(`L${r[cN]} : ${String(r[cR]).trim()}`);
    }
  });
  return { prix, remise, port, validite, delai: delais.length ? Math.max(...delais) : '', remarques: remarques.join(' · ') };
}

// Saisie de l'offre d'un fournisseur
function saisirOffre(c, eid) {
  const f = c.fournisseurs.find(x => x.entrepriseId === eid), o = f.offre || { prix: {} };
  const box = Modal.open(`<h2 style="margin-top:0">Offre de ${esc(clientName(eid))}</h2>
    <div class="table-wrap"><table class="compact"><tr><th>N°</th><th>Désignation</th><th class="num">Qté</th><th class="num">PU HT proposé</th></tr>
      ${c.lignes.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.designation)}</td><td class="num">${fmt(l.qte, 2)} ${esc(l.unite || '')}</td><td class="num"><input type="number" step="0.01" data-pi="${i}" value="${esc(o.prix[i] ?? '')}" style="width:110px" placeholder="non chiffré"></td></tr>`).join('')}</table></div>
    <div class="grid2">
      <div class="field"><label for="of-rem">Remise globale (%)</label><input id="of-rem" type="number" step="0.5" value="${esc(o.remise ?? '')}"></div>
      <div class="field"><label for="of-port">Frais de port HT</label><input id="of-port" type="number" step="0.01" value="${esc(o.port ?? '')}"></div>
      <div class="field"><label for="of-del">Délai de livraison (jours)</label><input id="of-del" type="number" value="${esc(o.delai ?? '')}"></div>
      <div class="field"><label for="of-val">Offre valable jusqu'au</label><input id="of-val" type="date" value="${esc(o.validite || '')}"></div>
    </div>
    <div class="field"><label for="of-rq">Remarques</label><input id="of-rq" value="${esc(o.remarques || '')}"></div>
    <label class="btn small secondary">${o.pieceId ? 'Remplacer l\'offre jointe' : '📎 Joindre l\'offre (PDF, photo ou Excel)'}<input type="file" id="of-file" accept="application/pdf,image/*,.xlsx,.xls,.csv" hidden></label> <span id="of-pj" class="small">${o.pieceId ? esc(o.pieceNom || 'offre jointe') : ''}</span>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="of-annuler">Annuler</button><button id="of-ok">Enregistrer l'offre</button></div>`);
  let pieceId = o.pieceId || '', pieceNom = o.pieceNom || '';
  box.querySelector('#of-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { ({ id: pieceId, nom: pieceNom } = await joindreOffre(file)); box.querySelector('#of-pj').textContent = file.name; } catch (err) { notify(err.message); }
  };
  box.querySelector('#of-annuler').onclick = Modal.close;
  box.querySelector('#of-ok').onclick = () => {
    const prix = {};
    box.querySelectorAll('[data-pi]').forEach(el => { if (el.value !== '') prix[el.dataset.pi] = num(el.value); });
    f.offre = { ...o, prix, remise: box.querySelector('#of-rem').value, port: box.querySelector('#of-port').value, delai: box.querySelector('#of-del').value, validite: box.querySelector('#of-val').value, remarques: box.querySelector('#of-rq').value, pieceId, pieceNom, aLire: false, date: isoDate(new Date()) };
    f.statut = 'Offre reçue';
    Store.upsert('consultations', c); Modal.close(); App.render();
  };
}

Views.consultations.bind = (root, params, query) => {
  if (!params[0]) {
    const f = lireFiltres('consultations', query, FILTRES_CONSULT);
    bindFiltres(root, 'consultations', f, FILTRES_CONSULT);
    root.querySelector('#cs-new').onclick = () => { const c = nouvelleConsultation(); location.hash = `#/consultations/${c.id}`; };
    boiteOffres(root);
    return;
  }
  const c = Store.get('consultations', params[0]);
  if (!c) return;
  c.lignes = c.lignes || []; c.fournisseurs = c.fournisseurs || [];
  const q = s => root.querySelector(s), on = (s, fn) => { const el = q(s); if (el) el.onclick = fn; };
  const save = (r = true) => { Store.upsert('consultations', c); if (r) App.render(); };
  [['#cs-objet', 'objet'], ['#cs-aff', 'affaireId'], ['#cs-lim', 'dateLimite'], ['#cs-liv', 'dateLivraison']].forEach(([s, k]) => { const el = q(s); if (el) el.onchange = () => { c[k] = el.value; save(k === 'affaireId'); }; });
  root.querySelectorAll('.cs-lignes tr[data-i] [data-k]').forEach(el => el.onchange = () => { c.lignes[+el.closest('tr').dataset.i][el.dataset.k] = el.dataset.k === 'qte' ? num(el.value) : el.value; save(false); });
  root.querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => { c.lignes.splice(+b.dataset.ldel, 1); save(); });
  on('#cs-add', () => { const a = Store.get('articles', q('#cs-art').value); if (!a) return; c.lignes.push({ articleId: a.id, designation: a.designation, unite: a.unite, qte: num(q('#cs-q').value) || 1 }); save(); });
  on('#cs-dicter', async () => {
    const choix = await dicterMateriel({ titre: 'Dicter les fournitures à consulter', cible: 'à la demande de prix' });
    choix.forEach(m => c.lignes.push({ articleId: m.articleId, designation: m.designation, unite: m.unite, qte: m.qte }));
    if (choix.length) save();
  });
  on('#cs-libre', () => { c.lignes.push({ articleId: '', designation: '', unite: 'u', qte: 1 }); save(); });
  const src = q('#cs-src');
  if (src) src.onchange = () => {
    const v = src.value; let ajout = [];
    if (v === 'compagnons') {
      // Besoins notés dans les rapports d'intervention : texte repris, matériel reconnu dans la bibliothèque, vérifié avant ajout
      const rs = besoinsRapports(c.affaireId);
      src.value = '';
      return dicterMateriel({ titre: 'Matériel demandé par les compagnons', cible: 'à la demande de prix', texte: rs.map(r => r.besoins.trim()).join('\n') }).then(choix => {
        choix.forEach(m => c.lignes.push({ articleId: m.articleId, designation: m.designation, unite: m.unite, qte: m.qte }));
        c.rapportsRepris = [...new Set([...(c.rapportsRepris || []), ...rs.map(r => r.id)])];
        if (choix.length) { save(); App.toast(`${choix.length} fourniture(s) reprise(s) des rapports de ${[...new Set(rs.map(r => userName(r.userId)))].join(', ')}`, 4000); }
      });
    }
    if (v === 'etude') ajout = lignesEtude(Store.get('affaires', c.affaireId));
    else if (v === 'chantier') ajout = besoinsChantier(c.affaireId).map(x => ({ articleId: x.a.id, designation: x.a.designation, unite: x.a.unite, qte: x.q }));
    else if (v.startsWith('chiffrage:')) {
      const ch = Store.get('chiffrages', v.slice(10));
      ajout = calculerChiffrage(ch).liste.filter(g => g.a).reduce((acc, g) => { const ex = acc.find(x => x.articleId === g.a.id); if (ex) ex.qte = Math.round((ex.qte + g.qte) * 100) / 100; else acc.push({ articleId: g.a.id, designation: g.a.designation, unite: g.a.unite, qte: g.qte }); return acc; }, []);
      if (!c.objet && ch) c.objet = ch.nom;
    }
    ajout.forEach(x => { const ex = c.lignes.find(l => (l.articleId && l.articleId === x.articleId) || (!x.articleId && l.designation === x.designation)); if (ex) ex.qte = x.qte; else c.lignes.push(x); });
    save(); App.toast(`${ajout.length} fourniture(s) reprise(s)`);
  };
  on('#cs-four', async () => {
    const ids = await choisirFournisseurs(c);
    if (!ids || !ids.length) return;
    ids.forEach(eid => { if (!c.fournisseurs.some(f => f.entrepriseId === eid)) c.fournisseurs.push({ entrepriseId: eid, statut: 'À consulter' }); });
    save(); App.toast(`${ids.length} fournisseur(s) ajouté(s) à la demande de prix`);
  });
  on('#cs-hab', () => { [...new Set(c.lignes.map(l => (Store.get('articles', l.articleId) || {}).fournisseurId).filter(Boolean))].forEach(eid => { if (!c.fournisseurs.some(f => f.entrepriseId === eid)) c.fournisseurs.push({ entrepriseId: eid, statut: 'À consulter' }); }); save(); });
  root.querySelectorAll('[data-fdel]').forEach(b => b.onclick = () => { c.fournisseurs = c.fournisseurs.filter(f => f.entrepriseId !== b.dataset.fdel); save(); });
  root.querySelectorAll('[data-fstatut]').forEach(el => el.onchange = () => { const f = c.fournisseurs.find(x => x.entrepriseId === el.dataset.fstatut); f.statut = el.value; save(); });
  root.querySelectorAll('[data-xls]').forEach(b => b.onclick = () => download(`Offre ${c.ref || ''} ${clientName(b.dataset.xls)}.xlsx`, excelConsultation(c, b.dataset.xls), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  root.querySelectorAll('[data-offre]').forEach(b => b.onclick = () => saisirOffre(c, b.dataset.offre));
  boiteOffres(root, c);
  // Offre reçue par e-mail : lecture de la pièce (PDF, photo ou tableau Excel) comme une offre importée
  root.querySelectorAll('[data-lire]').forEach(b => b.onclick = async () => {
    const f = c.fournisseurs.find(x => x.entrepriseId === b.dataset.lire), o = f.offre || {};
    try {
      const file = await fichierDepuisPiece(o.pieceId, o.pieceNom);
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        const buf = await file.arrayBuffer(), sheets = /\.csv$/i.test(file.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
        f.offre = { ...o, ...lireOffreExcel(sheets[0], c), aLire: false }; save();
      } else importerOffrePdf(c, f.entrepriseId, file, { pieceDeja: o.pieceId });
    } catch (err) { notify(err.message); }
  });
  root.querySelectorAll('[data-classer]').forEach(b => b.onclick = () => {
    const i = +b.dataset.classer, eid = root.querySelector(`[data-classer-f="${i}"]`).value, o = c.offresAClasser[i];
    if (!eid) return notify('Choisissez le fournisseur.');
    c.offresAClasser.splice(i, 1);
    OffreMail.appliquer(c, eid, o.pieces, o.mail); save();
    App.toast(`Offre rangée chez ${clientName(eid)} : « Lire l'offre » pour reprendre ses prix`, 4000);
  });
  root.querySelectorAll('[data-classer-x]').forEach(b => b.onclick = async () => { if (await ask('Retirer cette offre reçue par e-mail ?', 'Retirer')) { c.offresAClasser.splice(+b.dataset.classerX, 1); save(); } });
  root.querySelectorAll('[data-import]').forEach(inp => inp.onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (/\.pdf$/i.test(file.name) || /^image\//.test(file.type)) return importerOffrePdf(c, inp.dataset.import, file);
    try {
      const buf = await file.arrayBuffer(), sheets = /\.csv$/i.test(file.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
      const offre = lireOffreExcel(sheets[0], c), f = c.fournisseurs.find(x => x.entrepriseId === inp.dataset.import);
      // Le tableau rempli par le fournisseur est gardé comme pièce de son offre (repris dans la commande)
      let piece = null;
      try { piece = await joindreOffre(file); } catch (err) { notify(`Offre importée sans garder le fichier : ${err.message}`); }
      f.offre = { ...(f.offre || {}), ...offre, ...(piece ? { pieceId: piece.id, pieceNom: piece.nom } : {}), aLire: false, date: isoDate(new Date()) }; f.statut = 'Offre reçue';
      save(); App.toast(`Offre importée : ${Object.keys(offre.prix).length}/${c.lignes.length} ligne(s) chiffrée(s)`, 4000);
    } catch (err) { notify(err.message); }
  });
  root.querySelectorAll('[data-attr]').forEach(el => el.onchange = () => { c.attribution = { ...(c.attribution || {}), [el.dataset.attr]: el.value }; save(); });
  const an = analyseOffres(c);
  on('#cs-tout', () => { const eid = an.classement[0].f.entrepriseId; c.attribution = Object.fromEntries(c.lignes.map((l, i) => [i, eid])); save(); });
  on('#cs-opt', () => { c.attribution = { ...an.parLigne }; save(); });
  bindProposition(root, c, save);
  on('#cs-exemple', () => PDF.telecharger(devisExempleHtml(), 'devis-tereva-exemple.pdf').catch(e => notify(e.message)));
  on('#cs-cmd', async () => {
    const parF = {};
    Object.entries(c.attribution || {}).forEach(([i, eid]) => { if (eid) (parF[eid] = parF[eid] || []).push(+i); });
    if (!await ask(`Créer ${Object.keys(parF).length} commande(s) fournisseur (en brouillon) et clore la consultation ?`, 'Créer', false)) return;
    const maj = q('#cs-maj').checked;
    c.commandeIds = Object.entries(parF).map(([eid, idx]) => {
      const f = c.fournisseurs.find(x => x.entrepriseId === eid), t = offreTotaux(c, f);
      const lignes = idx.map(i => { const l = c.lignes[i]; return { articleId: l.articleId || '', refFournisseur: ((f.offre || {}).refs || {})[i] || '', designation: l.designation, unite: l.unite, qte: num(l.qte), pu: Math.round(t.pu(i) * 100) / 100 }; });
      if (num(f.offre.port)) lignes.push({ articleId: '', designation: 'Frais de port', unite: 'forfait', qte: 1, pu: num(f.offre.port) });
      if (maj) lignes.forEach(l => { const a = Store.get('articles', l.articleId); if (a && l.pu && Math.abs(num(a.coutRevient) - l.pu) > 0.005) { a.coutRevient = l.pu; a.fournisseurId = eid; Store.upsert('articles', a); } });
      return Store.upsert('commandes', { numero: '', fournisseurId: eid, affaireId: c.affaireId || '', date: isoDate(new Date()), dateLivraison: c.dateLivraison || '', statut: 'Brouillon', lignes, consultationId: c.id,
        devisFournisseurId: (f.offre || {}).pieceId || '', devisFournisseurRef: (f.offre || {}).reference || '',
        devisFournisseurNom: (f.offre || {}).pieceNom || ((f.offre || {}).lecture || {}).fichier || ((f.offre || {}).pieceId ? `Offre ${clientName(eid)}` : '') }).id;
    });
    c.statut = 'Attribuée'; save();
    App.toast(`${c.commandeIds.length} commande(s) créée(s) en brouillon`, 4000);
  });
  on('#cs-del', () => ask(`Supprimer la consultation ${c.ref || ''} ?`, 'Supprimer').then(ok => { if (ok) { Store.remove('consultations', c.id); location.hash = '#/consultations'; } }));
};

/* ---------- Offres reçues par e-mail ---------- */
// Offres dont le fournisseur n'a pas été reconnu : à classer d'un clic
function offresAClasserHtml(c) {
  const l = c.offresAClasser || [];
  if (!l.length) return '';
  const fs = c.fournisseurs || [];
  return `<div class="card note-card"><strong>📧 ${l.length} offre(s) reçue(s) par e-mail à classer</strong>
    <p class="small muted" style="margin:4px 0">Le n° de la consultation a été reconnu, pas le fournisseur : choisissez-le.</p>
    ${l.map((o, i) => `<div class="ajust-row"><span class="small"><strong>${esc(o.mail.de || o.mail.deEmail)}</strong> · « ${esc(o.mail.objet)} » · ${new Date(o.mail.recuLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<br>
      ${o.pieces.map(p => `<a href="${fileUrl(p.id)}?nom=${encodeURIComponent(p.nom)}" target="_blank" rel="noopener">📎 ${esc(p.nom)}</a>`).join(' ')}</span>
      <select data-classer-f="${i}" style="width:auto"><option value="">Fournisseur…</option>${fs.map(f => `<option value="${esc(f.entrepriseId)}">${esc(clientName(f.entrepriseId))}</option>`).join('')}</select>
      <button class="small" data-classer="${i}">Classer</button><button class="small danger" data-classer-x="${i}" aria-label="Supprimer">✕</button></div>`).join('')}</div>`;
}
// État de la boîte des offres (adresse, dernière relève, e-mails non reconnus) et relève immédiate
function boiteOffres(root, c) {
  const el = root.querySelector('#cs-boite');
  if (!el || !['admin', 'charge'].includes(Store.me.role)) return;
  api('GET', '/api/offres/etat').then(e => {
    if (!e.actif) { el.innerHTML = 'Offres par e-mail : configurez une boîte dédiée (Achats › Factures reçues › Configuration) pour y transférer les offres des fournisseurs.'; return; }
    const r = e.resultat || {};
    el.innerHTML = `📧 Transférez les offres reçues à <strong>${esc(e.adresse)}</strong> (n° de consultation ou code du chantier dans l'objet) : elles se rangent dans l'offre du fournisseur. Les demandes de prix envoyées depuis l'appli y font répondre les fournisseurs.
      ${e.dernier ? ` Relevée le ${new Date(e.dernier).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${r.offres ? ` · ${r.offres} offre(s) rangée(s)` : ''}.` : ''}${e.erreur ? ` <span class="neg">${esc(e.erreur)}</span>` : ''}
      ${e.demo ? (c && (c.fournisseurs || []).some(f => f.statut !== 'Offre reçue') ? '<button class="small secondary" id="cs-simuler">Simuler un e-mail d\'offre transféré</button>' : '') : '<button class="small secondary" id="cs-relever">Relever maintenant</button>'}
      ${(e.nonReconnues || []).length ? `<br><span class="warn-text">Non reconnus (restés dans la boîte) : ${e.nonReconnues.map(x => `« ${esc(x.objet)} » de ${esc(x.de)} – ${esc(x.motif)}`).join(' · ')}</span>` : ''}`;
    if (e.demo) { const b = el.querySelector('#cs-simuler'); if (b) b.onclick = () => simulerOffreMail(c).catch(err => notify(err.message)); return; }
    el.querySelector('#cs-relever').onclick = () => api('POST', '/api/offres/relever').then(x => { App.toast(`${x.messages} e-mail(s) : ${x.offres} offre(s) rangée(s)${x.aClasser ? `, ${x.aClasser} à classer` : ''}${x.nonReconnues ? `, ${x.nonReconnues} non reconnu(s)` : ''}`, 5000); App.render(); }).catch(err => notify(err.message));
  }).catch(() => { el.textContent = ''; });
}
// Démonstration : un collègue transfère à la boîte des offres l'e-mail d'un fournisseur consulté (n° de consultation dans l'objet)
async function simulerOffreMail(c) {
  const f = c.fournisseurs.find(x => x.entrepriseId === 'e12' && x.statut !== 'Offre reçue') || c.fournisseurs.find(x => x.statut !== 'Offre reçue');
  const ent = Store.get('entreprises', f.entrepriseId) || {}, aff = Store.get('affaires', c.affaireId) || {};
  const nom = `Offre ${ent.nom || 'fournisseur'}.pdf`;
  const id = await joindrePiece(new File([await PDF.depuisHTML(devisExempleHtml(), nom.replace(/\.pdf$/, ''))], nom, { type: 'application/pdf' }));
  const mail = { de: 'Service achats', deEmail: 'achats@pipefit.example', objet: `TR: Votre demande de prix ${c.ref || ''}${aff.code ? ` – chantier ${aff.code}` : ''}`, recuLe: new Date().toISOString(),
    texte: `---------- Message transféré ----------\nDe : ${ent.nom || ''} <${ent.email || 'commercial@fournisseur.example'}>\nObjet : RE: Demande de prix ${c.ref || ''}\nBonjour, veuillez trouver ci-joint notre meilleure offre.` };
  const rec = OffreMail.reconnaitre(mail, { consultations: Store.all('consultations'), entreprises: Store.all('entreprises'), contacts: Store.all('contacts'), affaires: Store.all('affaires'),
    internes: ['pipefit.example', (Store.data.settings.doc || {}).email].filter(Boolean) });
  if (!rec) throw new Error('E-mail non reconnu');
  const cible = rec.consultation;
  OffreMail.appliquer(cible, rec.fournisseurId, [{ id, nom }], mail);
  Store.upsert('consultations', cible);
  App.toast(`E-mail « ${mail.objet} » reconnu (${rec.raison}) : offre rangée chez ${rec.fournisseurId ? clientName(rec.fournisseurId) : 'les offres à classer'}.`, 6000);
  App.render();
}
// Pièce enregistrée relue comme un fichier (lecture de l'offre reçue par e-mail)
async function fichierDepuisPiece(id, nom) {
  const r = await fetch(fileUrl(id), { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Pièce introuvable');
  const b = await r.blob();
  return new File([b], nom || 'offre.pdf', { type: b.type || 'application/pdf' });
}
