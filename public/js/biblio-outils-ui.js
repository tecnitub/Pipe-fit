// Écrans des outils de la bibliothèque : offres des fournisseurs et historique des prix (fiche article), tarif d'un
// fournisseur (Excel ou CSV) avec aperçu des hausses / baisses, marges par catégorie, arbre des catégories (renommer,
// fusionner, déplacer), doublons fusionnés en variantes, prix facturés reportés dans la bibliothèque.
const BO = () => BiblioOutils;
const pctTxt = p => (p === null || p === undefined ? '—' : `${p > 0 ? '+' : ''}${fmt(p, 1)} %`);
const pctClasse = p => (p > 0 ? 'neg' : p < 0 ? 'pos' : '');
const margesCategories = () => (Store.data.settings && Store.data.settings.margesCategories) || {};

/* ---------- Fiche article : offres et historique ---------- */
function offresArticleHtml(a) {
  const l = BO().offres(a); if (l.length < 2) return '';
  const m = BO().moinsCher(a), r = BO().plusRapide(a);
  return `<fieldset class="hd-bloc"><legend>Comparatif des fournisseurs</legend><div class="table-wrap"><table class="small"><tr><th>Fournisseur</th><th class="num">Prix d'achat</th><th class="num">Écart</th><th class="num">Délai</th><th></th></tr>
    ${l.map(o => `<tr><td>${esc(clientName(o.fid))}${o.defaut ? ' <span class="badge">par défaut</span>' : ''}</td><td class="num">${o.coutRevient === null ? '—' : eur(o.coutRevient)}</td>
      <td class="num">${m && o.coutRevient !== null && o.fid !== m.fid ? `+${fmt((o.coutRevient / m.coutRevient - 1) * 100, 1)} %` : ''}</td><td class="num">${o.delai === null ? '—' : `${fmt(o.delai, 0)} j`}</td>
      <td>${m && m.fid === o.fid ? '<span class="badge b-ok">moins cher</span> ' : ''}${r && r.fid === o.fid ? '<span class="badge">plus rapide</span>' : ''}</td></tr>`).join('')}</table></div></fieldset>`;
}
function historiquePrixHtml(a) {
  const h = (a.historiquePrix || []).slice().reverse(); if (!h.length) return '';
  return `<details class="hd-bloc"><summary>Historique des prix d'achat (${h.length})</summary><div class="table-wrap"><table class="small"><tr><th>Date</th><th>Fournisseur</th><th class="num">Ancien</th><th class="num">Nouveau</th><th class="num">Évolution</th><th>Origine</th></tr>
    ${h.slice(0, 20).map(x => { const p = x.ancien ? (x.nouveau / x.ancien - 1) * 100 : null; return `<tr><td>${dateFr(x.date)}</td><td>${esc(x.fid ? clientName(x.fid) : '')}</td><td class="num">${x.ancien === null || x.ancien === undefined ? '—' : eur(x.ancien)}</td><td class="num">${eur(x.nouveau)}</td><td class="num ${pctClasse(p)}">${pctTxt(p === null ? null : Math.round(p * 10) / 10)}</td><td>${esc(x.source || '')}</td></tr>`; }).join('')}</table></div></details>`;
}

/* ---------- Tarif d'un fournisseur ---------- */
function importerTarif() {
  const four = fournisseursList().filter(e => Store.all('articles').some(a => a.fournisseurId === e.id || (a.fournisseursConsult || []).includes(e.id)));
  const box = Modal.open(`<h2 style="margin-top:0">📥 Tarif d'un fournisseur</h2>
    <p class="small muted">Fichier Excel ou CSV du fournisseur avec une colonne référence (ou désignation) et une colonne prix. Ses prix sont comparés à ceux de la bibliothèque (fournisseur par défaut ou variante) : vous choisissez ensuite ce qui est mis à jour, avec un historique daté.</p>
    <div class="grid2"><div class="field"><label for="tf-f">Fournisseur</label><select id="tf-f">${options(four, '')}</select></div>
      <div class="field"><label for="tf-file">Tarif (Excel, CSV)</label><input id="tf-file" type="file" accept=".xlsx,.csv"></div></div>
    <div id="tf-res"></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="tf-x">Fermer</button><button id="tf-ok" disabled>Mettre à jour les prix cochés</button></div>`);
  box.classList.add('wide');
  let comp = null;
  box.querySelector('#tf-x').onclick = Modal.close;
  const lire = async () => {
    const fid = box.querySelector('#tf-f').value, f = box.querySelector('#tf-file').files[0];
    if (!fid || !f) return;
    const buf = await f.arrayBuffer();
    let sheets; try { sheets = /\.csv$/i.test(f.name) ? XLSX.readCSV(buf) : await XLSX.read(buf); } catch (e) { return notify(`Fichier illisible : ${e.message}`); }
    // Première feuille et première ligne qui ressemble à un en-tête de tarif
    let rows = null;
    for (const s of sheets) { const k = s.rows.slice(0, 15).findIndex(r => BO().colonnesTarif(r)); if (k >= 0) { rows = s.rows.slice(k); break; } }
    comp = rows && BO().comparerTarif(Store.all('articles'), fid, rows);
    if (!comp) { box.querySelector('#tf-res').innerHTML = '<p class="warn-text">Colonnes non reconnues : il faut une colonne « Référence » (ou « Désignation ») et une colonne « Prix ».</p>'; return; }
    box.querySelector('#tf-res').innerHTML = `<p><strong>${comp.lignes.length}</strong> article(s) reconnu(s) : <span class="neg">${comp.hausses} hausse(s)</span>, <span class="pos">${comp.baisses} baisse(s)</span>, ${comp.egaux} inchangé(s)${comp.nouveaux ? `, ${comp.nouveaux} sans prix jusqu'ici` : ''}${comp.nonTrouves.length ? ` · ${comp.nonTrouves.length} ligne(s) du tarif sans article chez ce fournisseur` : ''}.</p>
      <div class="table-wrap" style="max-height:50vh"><table class="small"><tr><th><input type="checkbox" id="tf-tout" checked aria-label="Tout cocher"></th><th>Réf.</th><th>Désignation</th><th></th><th class="num">Ancien</th><th class="num">Nouveau</th><th class="num">Évolution</th></tr>
      ${comp.lignes.filter(l => l.pct !== 0).sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).map(l => `<tr><td><input type="checkbox" data-tf="${l.id}" checked></td><td>${esc(l.ref)}</td><td>${esc(l.designation)}</td><td class="muted">${l.role}</td><td class="num">${l.ancien === null ? '—' : eur(l.ancien)}</td><td class="num">${eur(l.nouveau)}</td><td class="num ${pctClasse(l.pct)}">${pctTxt(l.pct)}${Math.abs(l.pct ?? 0) > 20 ? ' ⚠' : ''}</td></tr>`).join('')}</table></div>`;
    const tout = box.querySelector('#tf-tout'); if (tout) tout.onchange = () => box.querySelectorAll('[data-tf]').forEach(c => { c.checked = tout.checked; });
    box.querySelector('#tf-ok').disabled = !comp.lignes.some(l => l.pct !== 0);
  };
  box.querySelector('#tf-f').onchange = lire; box.querySelector('#tf-file').onchange = lire;
  box.querySelector('#tf-ok').onclick = async () => {
    const fid = box.querySelector('#tf-f').value, ids = new Set([...box.querySelectorAll('[data-tf]:checked')].map(c => c.dataset.tf));
    const nom = (box.querySelector('#tf-file').files[0] || {}).name || 'tarif';
    const l = comp.lignes.filter(x => ids.has(x.id));
    await majArticles(l.map(x => Store.get('articles', x.id)).filter(Boolean), a => BO().appliquerPrix(a, fid, comp.lignes.find(x => x.id === a.id).nouveau, { date: isoDate(new Date()), source: `tarif ${nom}` }));
    Modal.close(); App.render(); App.toast(`${l.length} prix mis à jour (${clientName(fid)})`);
  };
}

/* ---------- Marges ---------- */
function editerMargesCategories() {
  const ar = BO().arbre(Store.all('articles')), m = { ...margesCategories() };
  const ligne = (x, k) => `<tr><td style="padding-left:${8 + k * 18}px">${k ? '› ' : ''}${esc(x.nom)} <span class="count">${x.n}</span></td><td class="num"><input type="number" step="0.01" data-mc="${esc(x.chemin)}" value="${esc(m[x.chemin] ?? '')}" style="width:90px" placeholder="${k ? 'héritée' : ''}" aria-label="Marge ${esc(x.chemin)}"> %</td></tr>`
    + x.enfants.map(e => ligne(e, k + 1)).join('');
  const box = Modal.open(`<h2 style="margin-top:0">% Marges par catégorie</h2>
    <p class="small muted">Marge par défaut d'une famille, d'une sous-famille ou d'une gamme (la plus précise l'emporte). Elle sert aux articles sans marge propre : prix de vente = prix d'achat × (1 + marge), aussi à l'import.</p>
    <div class="table-wrap" style="max-height:55vh"><table class="small">${ar.noeuds.map(x => ligne(x, 0)).join('') || '<tr><td class="muted">Aucune catégorie.</td></tr>'}</table></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="mc-x">Annuler</button><button class="secondary" id="mc-app">Enregistrer et recalculer les prix</button><button id="mc-ok">Enregistrer</button></div>`);
  box.classList.add('wide');
  box.querySelector('#mc-x').onclick = Modal.close;
  const enreg = async recalc => {
    const out = {};
    box.querySelectorAll('[data-mc]').forEach(i => { if (i.value !== '' && Number.isFinite(+i.value)) out[i.dataset.mc] = +i.value; });
    try { await Store.saveSettings({ ...Store.data.settings, margesCategories: out }); } catch (e) { return notify(e.message); }
    let nb = 0;
    if (recalc) { const maj = BO().appliquerMarges(Store.all('articles'), out); nb = maj.length; if (nb) await majArticles(maj, a => a); }
    Modal.close(); App.render(); App.toast(recalc ? `Marges enregistrées : ${nb} prix de vente recalculé(s)` : 'Marges enregistrées');
  };
  box.querySelector('#mc-ok').onclick = () => enreg(false);
  box.querySelector('#mc-app').onclick = () => enreg(true);
}
async function margeSelection(ids) {
  const p = await askValue(`Marge (%) des ${ids.length} fourniture(s) sélectionnée(s) : prix de vente = achat × (1 + marge)`, '30', 'number');
  if (p === null || p === '' || !Number.isFinite(+p)) return;
  await majArticles(ids.map(id => Store.get('articles', id)).filter(Boolean), a => ({ ...a, marge: +p, ...(num(a.coutRevient) > 0 ? { prixVente: Math.round(num(a.coutRevient) * (1 + +p / 100) * 100) / 100 } : {}) }));
  biblioEtat.sel.clear(); App.render(); App.toast(`Marge de ${p} % appliquée à ${ids.length} fourniture(s)`);
}

/* ---------- Catégories ---------- */
function editerCategories() {
  const dessiner = () => {
    const ar = BO().arbre(Store.all('articles'));
    const ligne = (x, k) => `<tr><td style="padding-left:${8 + k * 18}px">${k ? '› ' : ''}<strong>${esc(x.nom)}</strong> <span class="count">${x.n}</span></td>
      <td><button class="small secondary" data-cat-ren="${esc(x.chemin)}" title="Renommer (un nom déjà pris fusionne les deux)">✎ Renommer / fusionner</button> <button class="small secondary" data-cat-dep="${esc(x.chemin)}">⇄ Déplacer</button> <button class="small secondary" data-cat-voir="${esc(x.chemin)}">Voir</button></td></tr>`
      + x.enfants.map(e => ligne(e, k + 1)).join('');
    return `<h2 style="margin-top:0">🌳 Catégories</h2>
      <p class="small muted">Famille › Sous-famille › Gamme. Renommer avec un nom qui existe déjà au même niveau fusionne les deux catégories ; « Déplacer » change le chemin complet (ex. « Raccords|Inox »).</p>
      ${ar.sans ? `<p class="note small">${ar.sans} fourniture(s) sans catégorie. <button class="small" data-cat-voir="">Les voir</button> (sélectionnez-les puis « Ranger dans une famille… »)</p>` : ''}
      <div class="table-wrap" style="max-height:60vh"><table class="small">${ar.noeuds.map(x => ligne(x, 0)).join('')}</table></div>
      <div class="modal-actions"><span style="flex:1"></span><button id="cat-x">Fermer</button></div>`;
  };
  const box = Modal.open(dessiner()); box.classList.add('wide');
  const appliquer = async (de, vers) => {
    const maj = BO().deplacer(Store.all('articles'), de, vers);
    if (!maj.length) return App.toast('Rien à changer');
    // Marges par catégorie suivent le renommage
    const m = margesCategories(), nm = {};
    Object.entries(m).forEach(([c, v]) => { nm[c === de || c.startsWith(`${de}|`) ? vers + c.slice(de.length) : c] = v; });
    await majArticles(maj, a => a);
    if (JSON.stringify(nm) !== JSON.stringify(m)) await Store.saveSettings({ ...Store.data.settings, margesCategories: nm }).catch(e => notify(e.message));
    App.toast(`${maj.length} fourniture(s) : ${de.replace(/\|/g, ' › ')} → ${vers.replace(/\|/g, ' › ')}`);
    box.innerHTML = dessiner(); lier();
  };
  const lier = () => {
    box.querySelector('#cat-x').onclick = () => { Modal.close(); App.render(); };
    box.querySelectorAll('[data-cat-ren]').forEach(b => b.onclick = async () => {
      const de = b.dataset.catRen, l = de.split('|'), nv = (await askValue(`Nouveau nom de « ${l[l.length - 1]} »`, l[l.length - 1]) || '').trim().replace(/\|/g, ' ');
      if (nv && nv !== l[l.length - 1]) appliquer(de, [...l.slice(0, -1), nv].join('|'));
    });
    box.querySelectorAll('[data-cat-dep]').forEach(b => b.onclick = async () => {
      const de = b.dataset.catDep, v = (await askValue(`Déplacer « ${de.replace(/\|/g, ' › ')} » vers (Famille|Sous-famille|Gamme)`, de) || '').trim();
      if (v && v !== de) appliquer(de, v.split('|').map(s => s.trim()).filter(Boolean).join('|'));
    });
    box.querySelectorAll('[data-cat-voir]').forEach(b => b.onclick = () => {
      const l = b.dataset.catVoir ? b.dataset.catVoir.split('|') : [RechercheArticles.SANS];
      Object.assign(biblioEtat, { famille: l[0] || '', sous: l[1] || '', gamme: l[2] || '', q: '' });
      Modal.close(); App.render();
    });
  };
  lier();
}

/* ---------- Doublons ---------- */
function editerDoublons() {
  const groupes = BO().doublons(Store.all('articles'));
  const box = Modal.open(`<h2 style="margin-top:0">🧹 Doublons de la bibliothèque</h2>
    ${groupes.length ? `<p class="small muted">${groupes.length} groupe(s) d'articles quasi identiques (même référence ou même désignation, même unité). Choisissez l'article gardé : les autres y sont fusionnés, leurs fournisseurs et prix deviennent des variantes (3 au plus) et les devis, commandes et ouvrages qui les citent pointent vers lui.</p>
    <div style="max-height:60vh;overflow:auto">${groupes.map((g, k) => `<div class="card" data-grp="${k}"><label class="check"><input type="checkbox" data-grp-ok="${k}"> <strong>Fusionner</strong> <span class="muted small">(${g.motif})</span></label>
      <table class="small">${g.articles.map((a, i) => `<tr><td><input type="radio" name="dg${k}" value="${a.id}" ${i === 0 ? 'checked' : ''} aria-label="Garder ${esc(a.ref || a.designation)}"></td><td>${esc(a.ref || '')}</td><td>${esc(a.designation || '')}</td><td>${esc(a.unite || '')}</td><td class="num">${eur(a.coutRevient)}</td><td>${esc(a.fournisseurId ? clientName(a.fournisseurId) : '')}</td><td class="muted">${esc(BO().chemin(a).replace(/\|/g, ' › '))}</td></tr>`).join('')}</table></div>`).join('')}</div>`
    : '<p>Aucun doublon trouvé.</p>'}
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="dg-x">Fermer</button>${groupes.length ? '<button id="dg-ok">Fusionner les groupes cochés</button>' : ''}</div>`);
  box.classList.add('wide');
  box.querySelector('#dg-x').onclick = Modal.close;
  const okb = box.querySelector('#dg-ok');
  if (okb) okb.onclick = async () => {
    const remplace = {}, gardes = [];
    groupes.forEach((g, k) => {
      if (!box.querySelector(`[data-grp-ok="${k}"]`).checked) return;
      const gid = box.querySelector(`input[name="dg${k}"]:checked`).value, garde = g.articles.find(a => a.id === gid), autres = g.articles.filter(a => a.id !== gid);
      gardes.push(BO().fusionner(garde, autres).article); autres.forEach(a => { remplace[a.id] = gid; });
    });
    if (!gardes.length) return notify('Cochez au moins un groupe.');
    await fusionnerArticles(gardes, remplace);
    Modal.close(); App.render(); App.toast(`${Object.keys(remplace).length} doublon(s) fusionné(s) dans ${gardes.length} article(s)`);
  };
}
// Enregistre les articles gardés, repointe les références des autres collections puis supprime les doublons
async function fusionnerArticles(gardes, remplace) {
  await majArticles(gardes, a => a);
  for (const col of Object.keys(Store.data)) {
    if (col === 'articles' || !Array.isArray(Store.data[col])) continue;
    const maj = Store.data[col].map(x => { const c = JSON.parse(JSON.stringify(x)); return BO().remplacerReferences(c, remplace) ? c : null; }).filter(Boolean);
    if (maj.length) { maj.forEach(c => Object.keys(c).filter(k => k.startsWith('_')).forEach(k => delete c[k])); try { await Store.bulk(col, maj); } catch (e) { notify(e.message); } }
  }
  Object.keys(remplace).forEach(id => Store.remove('articles', id));
}

/* ---------- Prix facturés → bibliothèque ---------- */
const seuilPrixFacture = () => num((Store.data.settings || {}).seuilPrixFacture) || 5;
function lignesPrixFacture(x) {
  if (!x.fournisseurId) return [];
  const a = typeof analyseAchat === 'function' ? analyseAchat(x) : null;
  return (x.lignes || []).map((lf, i) => {
    const l = a && a.lignes[i], cl = l && l.cmd && ((Store.get('commandes', l.cmd.commandeId) || {}).lignes || [])[l.cmd.index];
    const art = Store.get('articles', lf.articleId || (cl && cl.articleId) || '');
    const e = art && BO().ecartFacture(art, x.fournisseurId, lf.pu, seuilPrixFacture());
    return e ? { i, art, ...e, connu: art.fournisseurId === x.fournisseurId || (art.fournisseursConsult || []).includes(x.fournisseurId) } : null;
  }).filter(Boolean);
}
function prixFactureHtml(x) {
  const l = lignesPrixFacture(x); if (!l.length) return '';
  const al = l.filter(e => e.alerte).length;
  return `<div class="card no-print pf-facture"><strong>Prix facturés différents de la bibliothèque</strong>${al ? ` <span class="badge b-bad">${al} écart(s) de plus de ${seuilPrixFacture()} %</span>` : ''}
    <div class="table-wrap"><table class="small"><tr><th></th><th>Article</th><th class="num">Bibliothèque</th><th class="num">Facturé</th><th class="num">Écart</th></tr>
    ${l.map(e => `<tr class="${e.alerte ? 'rp-ko' : ''}"><td><input type="checkbox" data-pfac="${e.i}" ${e.connu ? 'checked' : ''}></td><td>${esc(e.art.designation)}${e.connu ? '' : ' <span class="muted">(fournisseur ajouté en variante)</span>'}</td><td class="num">${e.ancien === null ? '—' : eur(e.ancien)}</td><td class="num">${eur(e.nouveau)}</td><td class="num ${pctClasse(e.pct)}">${pctTxt(e.pct)}${e.alerte ? ' ⚠' : ''}</td></tr>`).join('')}</table></div>
    <button class="small" id="pf-maj">Mettre à jour les prix cochés dans la bibliothèque</button></div>`;
}
function bindPrixFacture(root, x) {
  const b = root.querySelector('#pf-maj'); if (!b) return;
  b.onclick = async () => {
    const coches = new Set([...root.querySelectorAll('[data-pfac]:checked')].map(c => +c.dataset.pfac)), l = lignesPrixFacture(x).filter(e => coches.has(e.i));
    if (!l.length) return notify('Cochez au moins une ligne.');
    await majArticles(l.map(e => Store.get('articles', e.art.id)), a => BO().appliquerPrix(a, x.fournisseurId, l.find(e => e.art.id === a.id).nouveau, { date: x.date || isoDate(new Date()), source: `facture ${x.numeroFournisseur || x.ref || ''}`.trim() }));
    App.render(); App.toast(`${l.length} prix d'achat mis à jour d'après la facture`);
  };
}
