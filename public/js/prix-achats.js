// Achats → Historique des prix : tout ce qui a été acheté (commandes, factures, comptoir), par article, avec prix mini,
// moyen et maxi, dernier prix, meilleur fournisseur ; triable, filtré par année et par fournisseur, export Excel.
const prixFiltre = { annee: String(new Date().getFullYear()), fournisseurId: '', q: '', tri: 'montant', sens: -1 };
let prixCache = null;
const historiqueAchats = () => {
  // Recalcul seulement si les données ont changé (le rapprochement des désignations est coûteux)
  const cle = ['commandes', 'achats', 'articles'].map(c => Store.all(c).map(x => `${x.id}:${x._v || 0}`).join(',')).join('|');
  if (!prixCache || prixCache.cle !== cle) prixCache = { cle, lignes: HistoriqueAchats.lignes({ commandes: Store.all('commandes'), achats: Store.all('achats'), articles: Store.all('articles') }, Rapprochement.ressemblance) };
  return prixCache.lignes;
};
const COLONNES_PRIX = [['designation', 'Article'], ['nb', 'Achats'], ['qte', 'Quantité'], ['montant', 'Montant HT'], ['min', 'Prix mini'], ['moyen', 'Prix moyen'], ['max', 'Prix maxi'], ['ecart', 'Écart maxi/mini'], ['dernier', 'Dernier prix'], ['evolution', 'Évolution'], ['economie', 'Économie possible']];

Views.prixAchats = () => {
  const f = prixFiltre, s = HistoriqueAchats.synthese(historiqueAchats(), f);
  const annees = [...new Set([String(new Date().getFullYear()), ...s.annees])].sort().reverse();
  const fourn = [...new Set(historiqueAchats().map(x => x.fournisseurId))].map(entreprise).filter(e => e.id).sort((a, b) => a.nom.localeCompare(b.nom));
  const cle = f.tri, l = s.articles.slice().sort((a, b) => {
    const x = a[cle], y = b[cle];
    return (typeof x === 'string' ? String(x).localeCompare(String(y)) : (x || 0) - (y || 0)) * f.sens;
  });
  const hausses = s.articles.filter(a => a.nb > 1 && a.evolution >= 5).sort((a, b) => b.evolution - a.evolution);
  const unite = a => esc(a.unite || '');
  return `<h1>Achats</h1>${achatsTabs('prix')}
  <p class="muted">Tout ce qui a été acheté, ligne à ligne : commandes envoyées, factures saisies ligne à ligne (prix réellement payés) et relevés du comptoir. Prix en euros HT par unité, moyenne pondérée par les quantités.</p>
  <div class="toolbar"><select id="px-an" style="width:auto" aria-label="Année"><option value="">Toutes les années</option>${optionsStr(annees, f.annee)}</select>
    <select id="px-f" style="width:auto" aria-label="Fournisseur"><option value="">Tous les fournisseurs</option>${fourn.map(e => `<option value="${esc(e.id)}" ${e.id === f.fournisseurId ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select>
    <input id="px-q" type="search" value="${esc(f.q)}" placeholder="Rechercher un article, une référence, une famille…" style="width:auto;flex:1 1 220px;max-width:340px">
    <span class="spacer"></span><button class="secondary" id="px-xlsx">Exporter (Excel)</button></div>
  <div class="cards">
    <div class="card"><div class="label">Acheté ${f.annee ? `en ${esc(f.annee)}` : 'au total'}</div><div class="value">${eur(s.total)}</div><div class="sub">${s.lignes.length} ligne(s) · ${s.articles.length} article(s)</div></div>
    <div class="card"><div class="label">Fournisseurs</div><div class="value">${s.fournisseurs.length}</div><div class="sub">${s.fournisseurs.slice(0, 3).map(x => `${esc(clientName(x.fournisseurId))} ${eur(x.montant)}`).join(' · ')}</div></div>
    <div class="card"><div class="label">Économie possible</div><div class="value">${eur(sumBy(s.articles, a => a.economie))}</div><div class="sub">si tout avait été payé au prix moyen du meilleur fournisseur</div></div>
    <div class="card"><div class="label">Hausses (≥ 5 %)</div><div class="value ${hausses.length ? 'warn-text' : ''}">${hausses.length}</div><div class="sub">${hausses.slice(0, 2).map(a => `${esc(a.designation.slice(0, 28))} +${fmt(a.evolution, 1)} %`).join(' · ') || 'aucune'}</div></div>
  </div>
  ${l.length ? `<div class="table-wrap"><table class="px-table"><tr>${COLONNES_PRIX.map(([k, t]) => `<th class="${k === 'designation' ? '' : 'num'} triable" data-tri="${k}">${t}${f.tri === k ? (f.sens > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th>Meilleur fournisseur</th></tr>
    ${l.map(a => `<tr class="clickable" data-px="${esc(a.cle)}"><td><strong>${esc(a.designation)}</strong>${a.ref ? `<br><span class="small muted">${esc(a.ref)}</span>` : ''}</td>
      <td class="num">${a.nb}</td><td class="num">${fmt(a.qte, 2).replace(/,00$/, '')} ${unite(a)}</td><td class="num">${eur(a.montant)}</td>
      <td class="num">${eur(a.min)}</td><td class="num"><strong>${eur(a.moyen)}</strong></td><td class="num">${eur(a.max)}</td>
      <td class="num ${a.ecart >= 10 ? 'warn-text' : ''}">${a.ecart ? `${fmt(a.ecart, 1)} %` : '—'}</td>
      <td class="num">${eur(a.dernier)}<br><span class="small muted">${dateFr(a.dateDernier)}</span></td>
      <td class="num ${a.evolution > 0.5 ? 'neg' : a.evolution < -0.5 ? 'pos' : ''}">${a.nb > 1 && a.evolution ? `${a.evolution > 0 ? '+' : ''}${fmt(a.evolution, 1)} %` : '—'}</td>
      <td class="num">${a.economie >= 1 ? eur(a.economie) : '—'}</td>
      <td class="small">${a.parFournisseur.length > 1 ? `${esc(clientName(a.meilleur.fournisseurId))}<br><span class="muted">${eur(a.meilleur.moyen)} en moyenne</span>` : esc(clientName(a.meilleur.fournisseurId))}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun achat pour ces critères.</p>'}`;
};
Views.prixAchats.bind = root => {
  const f = prixFiltre;
  root.querySelector('#px-an').onchange = e => { f.annee = e.target.value; App.render(); };
  root.querySelector('#px-f').onchange = e => { f.fournisseurId = e.target.value; App.render(); };
  root.querySelector('#px-q').onchange = e => { f.q = e.target.value; App.render(); };
  root.querySelectorAll('[data-tri]').forEach(th => th.onclick = () => { const k = th.dataset.tri; f.sens = f.tri === k ? -f.sens : (k === 'designation' ? 1 : -1); f.tri = k; App.render(); });
  root.querySelectorAll('[data-px]').forEach(tr => tr.onclick = () => detailPrix(tr.dataset.px));
  root.querySelector('#px-xlsx').onclick = exporterPrix;
};
// Détail d'un article : chaque achat, et prix moyen par fournisseur
function detailPrix(cle) {
  const a = HistoriqueAchats.synthese(historiqueAchats(), prixFiltre).articles.find(x => x.cle === cle);
  if (!a) return;
  const lien = x => (x.source === 'commande' ? `#/commandes/${x.docId}` : `#/achats/${x.docId}`);
  const box = Modal.open(`<h2 style="margin-top:0">${esc(a.designation)}</h2>
    <p class="small">${a.ref ? `Réf. ${esc(a.ref)} · ` : ''}${a.nb} achat(s) · ${fmt(a.qte, 2).replace(/,00$/, '')} ${esc(a.unite || '')} · ${eur(a.montant)} HT · mini ${eur(a.min)} · moyen ${eur(a.moyen)} · maxi ${eur(a.max)}</p>
    ${a.parFournisseur.length > 1 ? `<table class="compact"><tr><th>Fournisseur</th><th class="num">Achats</th><th class="num">Quantité</th><th class="num">Prix moyen</th></tr>${a.parFournisseur.map((p, i) => `<tr class="${i === 0 ? 'meilleur' : ''}"><td>${esc(clientName(p.fournisseurId))}</td><td class="num">${p.nb}</td><td class="num">${fmt(p.qte, 2).replace(/,00$/, '')}</td><td class="num">${eur(p.moyen)}</td></tr>`).join('')}</table>` : ''}
    <div class="table-wrap"><table class="compact"><tr><th>Date</th><th>Fournisseur</th><th>Pièce</th><th>Chantier</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Montant</th></tr>
      ${a.achats.slice().reverse().map(x => `<tr><td>${dateFr(x.date)}</td><td>${esc(clientName(x.fournisseurId))}</td><td><a href="${lien(x)}">${esc(x.source === 'comptoir' ? `BL ${x.bl}` : x.doc || '…')}</a>${x.source === 'comptoir' ? ' <span class="badge">comptoir</span>' : ''}</td>
        <td>${esc(affaireOf(x.affaireId).code || '')}</td><td class="num">${fmt(x.qte, 2).replace(/,00$/, '')}</td><td class="num ${x.pu === a.max && a.max !== a.min ? 'neg' : x.pu === a.min && a.max !== a.min ? 'pos' : ''}">${eur(x.pu)}</td><td class="num">${eur(x.montant)}</td></tr>`).join('')}</table></div>
    <div class="modal-actions"><span style="flex:1"></span><button id="dp-x">Fermer</button></div>`, true);
  box.querySelector('#dp-x').onclick = Modal.close;
  box.querySelectorAll('a[href^="#/"]').forEach(x => x.addEventListener('click', () => Modal.close()));
}
function exporterPrix() {
  const f = prixFiltre, s = HistoriqueAchats.synthese(historiqueAchats(), f), H = v => ({ v, s: 'head' }), E = v => ({ v, s: 'eur' }), N = v => ({ v, s: 'num' });
  const titre = `Historique des prix d'achat ${f.annee || 'toutes années'}${f.fournisseurId ? ` – ${clientName(f.fournisseurId)}` : ''} – ${Store.data.settings.societe || ''}`;
  const synth = [[{ v: titre, s: 'title' }], [],
    ['Article', 'Référence', 'Famille', 'Unité', 'Nb achats', 'Quantité', 'Montant HT', 'Prix mini', 'Prix moyen', 'Prix maxi', 'Écart maxi/mini (%)', 'Dernier prix', 'Date', 'Évolution (%)', 'Meilleur fournisseur', 'Prix moyen du meilleur', 'Économie possible'].map(H),
    ...s.articles.sort((a, b) => b.montant - a.montant).map(a => [a.designation, a.ref || '', a.famille || '', a.unite || '', N(a.nb), N(a.qte), E(a.montant), E(a.min), E(a.moyen), E(a.max), N(a.ecart), E(a.dernier), dateFr(a.dateDernier), N(a.evolution),
      clientName(a.meilleur.fournisseurId), E(a.meilleur.moyen), E(a.economie)])];
  const detail = [['Date', 'Fournisseur', 'Source', 'Pièce', 'BL', 'Chantier', 'Article', 'Référence', 'Unité', 'Quantité', 'PU HT', 'Montant HT'].map(H),
    ...s.lignes.map(x => [dateFr(x.date), clientName(x.fournisseurId), x.source, x.doc, x.bl || '', affaireOf(x.affaireId).code || '', x.designation, x.refFournisseur || x.ref || '', x.unite, N(x.qte), E(x.pu), E(x.montant)])];
  const parF = [['Fournisseur', 'Lignes', 'Montant HT'].map(H), ...s.fournisseurs.map(x => [clientName(x.fournisseurId), N(x.nb), E(x.montant)])];
  download(`prix-achats-${f.annee || 'tout'}.xlsx`, XLSX.build([{ name: 'Par article', cols: [40, 16, 14, 7, 9, 10, 13, 11, 11, 11, 12, 11, 11, 11, 24, 13, 13], freeze: 3, rows: synth },
    { name: 'Par fournisseur', cols: [32, 10, 14], freeze: 1, rows: parF }, { name: 'Détail', cols: [11, 26, 10, 16, 10, 13, 40, 16, 7, 10, 11, 12], freeze: 1, rows: detail }]),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
