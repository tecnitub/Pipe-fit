// RH → Synthèse paie sur une période libre (du … au …), réglages de la paie (durée hebdomadaire, seuil des heures à 50 %,
// panier repas, colonnes du tableau), tableau de paie pour le comptable et relevé d'heures détaillé pour chaque compagnon.

/* ---------- Période ---------- */
// Période de l'écran : du / au de l'adresse, sinon le mois (ancien lien « ?mois= »), sinon le mois en cours
function periodeRH(query) {
  const iso = /^\d{4}-\d{2}-\d{2}$/, du = query.get('du'), au = query.get('au');
  if (iso.test(du || '') && iso.test(au || '')) return du <= au ? { du, au } : { du: au, au: du };
  return Paie.periode(query.get('mois') || isoDate(new Date()).slice(0, 7));
}
const libellePeriode = p => (p.du.slice(0, 7) === p.au.slice(0, 7) && p.du.endsWith('-01') && p.au === Paie.periode(p.du.slice(0, 7)).au
  ? new Date(`${p.du}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : `du ${dateFr(p.du)} au ${dateFr(p.au)}`);
const nomFichierPeriode = p => (p.du.slice(0, 7) === p.au.slice(0, 7) && p.du.endsWith('-01') && p.au === Paie.periode(p.du.slice(0, 7)).au ? p.du.slice(0, 7) : `${p.du}_${p.au}`);
// Barre « Du … au … » avec raccourcis ; ecran : adresse de l'écran, autres : paramètres à garder (filtres)
function barrePeriode(p, ecran, autres = {}) {
  const q = (x, y) => `${ecran}?${new URLSearchParams({ ...autres, du: x, au: y })}`;
  return `<div class="periode-rh"><label class="inline">Du <input type="date" id="per-du" value="${esc(p.du)}" style="width:auto"></label>
    <label class="inline">au <input type="date" id="per-au" value="${esc(p.au)}" style="width:auto"></label>
    ${Paie.raccourcis(isoDate(new Date())).map(([l, r]) => `<a class="btn small ${r.du === p.du && r.au === p.au ? '' : 'secondary'}" href="${q(r.du, r.au)}">${l}</a>`).join('')}</div>`;
}
function bindPeriode(root, ecran, autres = () => ({})) {
  const du = root.querySelector('#per-du'), au = root.querySelector('#per-au');
  if (!du) return;
  const go = () => { if (du.value && au.value) location.hash = `${ecran}?${new URLSearchParams({ ...autres(), du: du.value, au: au.value })}`; };
  du.onchange = go; au.onchange = go;
}

/* ---------- Synthèse paie ---------- */
const reglageRH = () => Paie.reglage((Store.data.settings || {}).recapRH);
const personnesPeriode = (p, avecInterim = true) => Store.all('users')
  .filter(u => (avecInterim || u.type !== 'interimaire') && Store.all('temps').some(t => t.userId === u.id && Paie.dans(t.date, p)))
  .sort((a, b) => (a.type === 'interimaire') - (b.type === 'interimaire') || a.nom.localeCompare(b.nom));

function rhPaie(query) {
  const p = periodeRH(query), s = Store.data.settings, R = reglageRH(), admin = Store.can('admin');
  const filtre = query.get('filtre') || '';
  const rows = personnesPeriode(p).map(u => ({ u, r: Calc.paie(u.id, p) })).filter(({ r }) => filtre !== 'attente' || r.attente > 0);
  const sal = rows.filter(x => x.u.type !== 'interimaire'), inter = rows.filter(x => x.u.type === 'interimaire');
  const attente = sumBy(rows, x => x.r.attente);
  const ligne = ({ u, r }, interim) => `<tr class="clickable" data-u="${u.id}"><td><strong>${esc(u.nom)}</strong>${interim ? `<br><span class="muted small">${esc(u.agenceId ? clientName(u.agenceId) : u.agenceLibre || '')}</span>` : ''}</td><td>${esc(moOf(u.categorieId).libelle || '')}</td>
    <td class="num">${fmt(r.base)} h</td><td class="num">${r.jours}</td><td class="num">${fmt(r.total, 2)}</td><td class="num">${fmt(r.normales, 2)}</td><td class="num ${r.hs25 ? 'warn-text' : ''}">${fmt(r.hs25, 2)}</td><td class="num ${r.hs50 ? 'neg' : ''}">${fmt(r.hs50, 2)}</td>
    <td class="num">${r.paniers}</td>${interim ? '' : `<td class="num">${eur(r.montantPaniers + r.frais)}</td><td class="num">${num(u.salaireHoraire) ? eur(r.brut) : '—'}</td>`}<td class="small">${esc(Paie.libelleAbsences(r.absences))}</td>
    <td class="num ${r.attente ? 'warn-text' : 'muted'}">${r.attente ? `<a href="#/rh/validation?du=${p.du}&au=${p.au}">${fmt(r.attente, 2)} h</a>` : '—'}</td></tr>`;
  const tete = interim => `<tr><th>${interim ? 'Intérimaire' : 'Salarié'}</th><th>Catégorie</th><th class="num">Contrat</th><th class="num">Jours</th><th class="num">Heures</th><th class="num">Normales</th><th class="num">Sup. 25 %</th><th class="num">Sup. 50 %</th><th class="num">Paniers</th>${interim ? '' : '<th class="num">Paniers + frais</th><th class="num">Brut estimé</th>'}<th>Absences</th><th class="num">À valider</th></tr>`;
  const compagnons = personnesPeriode(p);
  return `<h1>RH</h1>${rhTabs('paie')}
  <div class="toolbar">${barrePeriode(p, '#/rh', filtre ? { filtre } : {})}
    <label class="check"><input type="checkbox" id="rh-attente" ${filtre === 'attente' ? 'checked' : ''}> Seulement ceux qui ont des heures à valider</label></div>
  <div class="toolbar"><button class="dl-btn" id="rh-paie-xlsx">📊 Tableau paie pour le comptable (Excel)</button>
    <span class="rh-releve dl-btn"><button class="secondary" id="rh-releve-xlsx">👷 Relevé d'heures détaillé (Excel)</button>
      <select id="rh-releve-qui" style="width:auto" aria-label="Relevé de"><option value="">tous les compagnons (une feuille chacun)</option>${compagnons.map(u => `<option value="${u.id}">${esc(u.nom)}</option>`).join('')}</select></span></div>
  ${attente ? `<p class="note">${fmt(attente, 2)} h pointées ${esc(libellePeriode(p))} ne sont pas encore validées : elles n'entrent pas dans la paie. <a href="#/rh/validation?du=${p.du}&au=${p.au}">Valider les pointages</a></p>` : ''}
  <details class="card rh-reglages"><summary><strong>⚙ Réglages de la paie et du tableau</strong> <span class="muted small">· semaine de ${fmt(num(s.dureeHebdo) || 35)} h · 50 % au-delà de ${fmt(num(s.seuilHS50) || 43)} h · panier ${eur(s.montantPanier)} · ${R.colonnes.length} colonnes</span></summary>
    ${admin ? '' : '<p class="muted small">Réservé à l\'administrateur.</p>'}
    <div class="grid2">
      <div class="field"><label for="rg-hebdo">Durée hebdomadaire de travail (h)</label><input id="rg-hebdo" type="number" step="0.5" min="1" value="${esc(num(s.dureeHebdo) || 35)}" ${admin ? '' : 'disabled'}><span class="small muted">Au-delà : heures sup. à 25 %. Une personne au contrat différent : sa fiche (Paramètres → Équipe, « Durée hebdo du contrat »).</span></div>
      <div class="field"><label for="rg-hs50">Heures sup. à 50 % au-delà de (h / semaine)</label><input id="rg-hs50" type="number" step="0.5" min="1" value="${esc(num(s.seuilHS50) || 43)}" ${admin ? '' : 'disabled'}></div>
      <div class="field"><label for="rg-panier">Prix du panier repas (€)</label><input id="rg-panier" type="number" step="0.01" min="0" value="${esc(num(s.montantPanier))}" ${admin ? '' : 'disabled'}></div>
    </div>
    <h3>Colonnes du tableau envoyé au comptable</h3>
    <div class="rg-cols">${Paie.COLONNES.map(([k, l]) => `<label class="check"><input type="checkbox" data-col="${k}" ${R.colonnes.includes(k) ? 'checked' : ''} ${admin ? '' : 'disabled'}> ${esc(l)}</label>`).join('')}</div>
    <h3>Contenu du fichier</h3>
    <div class="rg-cols">${Paie.OPTIONS.map(([k, l]) => `<label class="check"><input type="checkbox" data-opt="${k}" ${R.options[k] ? 'checked' : ''} ${admin ? '' : 'disabled'}> ${esc(l)}</label>`).join('')}</div>
    ${admin ? '<div class="toolbar"><button id="rg-ok">Enregistrer les réglages</button></div>' : ''}</details>
  <p class="muted">Heures validées ${esc(libellePeriode(p))}. Heures supplémentaires calculées par semaine (les jours de la semaine avant la période comptent pour le seuil). Salaire brut indicatif, hors primes et absences.</p>
  <h2>Salariés</h2>
  <div class="table-wrap"><table>${tete(false)}${sal.map(x => ligne(x, false)).join('') || '<tr><td colspan="13" class="muted">Aucune heure sur la période.</td></tr>'}</table></div>
  ${inter.length ? `<h2>Intérimaires <span class="muted small">(relevé d'heures à rapprocher de la facture de l'agence)</span></h2>
  <div class="table-wrap"><table>${tete(true)}${inter.map(x => ligne(x, true)).join('')}</table></div>` : ''}`;
}

function bindRhPaie(root, query) {
  const p = periodeRH(query), filtre = () => (root.querySelector('#rh-attente').checked ? { filtre: 'attente' } : {});
  bindPeriode(root, '#/rh', filtre);
  root.querySelector('#rh-attente').onchange = () => { location.hash = `#/rh?${new URLSearchParams({ ...filtre(), du: p.du, au: p.au })}`; };
  root.querySelectorAll('tr[data-u]').forEach(tr => tr.onclick = ev => { if (!ev.target.closest('a')) location.hash = `#/rh/pointages?${new URLSearchParams({ user: tr.dataset.u, du: p.du, au: p.au })}`; });
  root.querySelector('#rh-paie-xlsx').onclick = () => download(`paie-${nomFichierPeriode(p)}.xlsx`, tableauPaieExcel(p), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  root.querySelector('#rh-releve-xlsx').onclick = () => {
    const qui = root.querySelector('#rh-releve-qui').value, ids = qui ? [qui] : personnesPeriode(p).map(u => u.id);
    if (!ids.length) return notify('Aucune heure sur la période.');
    download(`releve-heures-${qui ? userName(qui).replace(/[^\w-]+/g, '_') + '-' : ''}${nomFichierPeriode(p)}.xlsx`, releveHeuresExcel(p, ids), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };
  const ok = root.querySelector('#rg-ok');
  if (ok) ok.onclick = async () => {
    const v = id => num(root.querySelector(id).value);
    if (v('#rg-hebdo') <= 0 || v('#rg-hs50') < v('#rg-hebdo')) return notify('Le seuil des heures à 50 % doit être au moins égal à la durée hebdomadaire.');
    const colonnes = Object.fromEntries([...root.querySelectorAll('[data-col]')].map(c => [c.dataset.col, c.checked]));
    if (!Object.values(colonnes).some(Boolean)) return notify('Cochez au moins une colonne.');
    const options = Object.fromEntries([...root.querySelectorAll('[data-opt]')].map(c => [c.dataset.opt, c.checked]));
    await Store.saveSettings({ ...Store.data.settings, dureeHebdo: v('#rg-hebdo'), seuilHS50: v('#rg-hs50'), montantPanier: v('#rg-panier'), recapRH: { colonnes, options } });
    App.toast('Réglages de la paie enregistrés'); App.render();
  };
}

/* ---------- Tableau paie (comptable) ---------- */
const H = v => ({ v, s: 'head' });
function tableauPaieExcel(p) {
  const s = Store.data.settings, R = reglageRH(), lib = libellePeriode(p);
  const personnes = personnesPeriode(p, R.options.interimaires);
  const COL = Object.fromEntries(Paie.COLONNES.map(([k, l]) => [k, l]));
  const LARG = { matricule: 11, nom: 24, statut: 13, agence: 22, categorie: 20, contrat: 10, jours: 8, total: 11, normales: 10, hs25: 9, hs50: 9, paniers: 9, montantPaniers: 12, frais: 12, absences: 24, brut: 12, attente: 11, deplacements: 16, primes: 14, observations: 30 };
  const SOMME = ['jours', 'total', 'normales', 'hs25', 'hs50', 'paniers', 'montantPaniers', 'frais', 'brut', 'attente'], EUR = ['montantPaniers', 'frais', 'brut'];
  const valeur = (k, u, r) => {
    const interim = u.type === 'interimaire';
    switch (k) {
      case 'matricule': return u.matricule || '';
      case 'nom': return { v: u.nom, s: 'bold' };
      case 'statut': return interim ? 'Intérimaire' : 'Salarié';
      case 'agence': return interim ? (u.agenceId ? clientName(u.agenceId) : u.agenceLibre || '') : '';
      case 'categorie': return moOf(u.categorieId).libelle || '';
      case 'contrat': return r.base;
      case 'absences': return Paie.libelleAbsences(r.absences);
      case 'brut': return interim || !num(u.salaireHoraire) ? '' : { v: r.brut, s: 'eur' };
      case 'attente': return r.attente || '';
      case 'deplacements': case 'primes': case 'observations': return '';
      default: return EUR.includes(k) ? { v: r[k], s: 'eur' } : r[k];
    }
  };
  const lignes = personnes.map(u => ({ u, r: Calc.paie(u.id, p) }));
  const synth = [
    [{ v: `Éléments de paie – ${lib}`, s: 'title' }],
    [{ v: `${s.societe || ''} · heures validées · semaine de ${fmt(num(s.dureeHebdo) || 35)} h (sauf contrat différent) · HS 50 % au-delà de ${fmt(num(s.seuilHS50) || 43)} h · panier ${fmt(num(s.montantPanier), 2)} € · édité le ${dateFr(isoDate(new Date()))}`, s: 'muted' }],
    [],
    R.colonnes.map(k => H(COL[k])),
    ...lignes.map(({ u, r }) => R.colonnes.map(k => valeur(k, u, r))),
  ];
  if (R.options.totaux && lignes.length) synth.push(R.colonnes.map((k, i) => (SOMME.includes(k) ? { v: sumBy(lignes, ({ u, r }) => (k === 'brut' && (u.type === 'interimaire' || !num(u.salaireHoraire)) ? 0 : num(r[k]))), s: EUR.includes(k) ? 'boldeur' : 'boldnum' } : i === 0 ? { v: 'Total', s: 'bold' } : '')));
  const sheets = [{ name: 'Paie', cols: R.colonnes.map(k => LARG[k] || 12), freeze: 4, rows: synth }];
  if (R.options.detail) lignes.forEach(({ u }) => sheets.push(feuilleReleve(u, p, { paie: true })));
  if (R.options.notesFrais) {
    const frais = Store.all('frais').filter(f => Paie.dans(f.date, p) && personnes.some(u => u.id === f.userId)).sort((a, b) => a.date.localeCompare(b.date));
    sheets.push({ name: 'Notes de frais', cols: [14, 11, 18, 14, 16, 34, 40, 11, 7, 11, 12], freeze: 3, rows: [[{ v: `Notes de frais – ${lib}`, s: 'title' }], [], ['N°', 'Date', 'Personne', 'Chantier', 'Catégorie', 'Description', 'Convives (restaurant)', 'TTC', 'TVA %', 'HT', 'Statut'].map(H),
      ...frais.map(f => [f.numero || '', dateFr(f.date), userName(f.userId), affaireOf(f.affaireId).code || '', f.categorie === 'Repas' ? 'Restaurant' : f.categorie, f.description || '', NoteFrais.libelleConvives(f), { v: num(f.montantTTC), s: 'eur' }, num(f.tauxTVA), { v: Calc.fraisHT(f), s: 'eur' }, f.statut])] });
  }
  return XLSX.build(sheets);
}

/* ---------- Relevé d'heures détaillé (pour les compagnons) ---------- */
// Une feuille par personne : chaque jour, chantier, tâche, horaires, panier, statut ; totaux par semaine et de la période.
// paie : colonnes heures normales / supplémentaires et brut (tableau du comptable) ; sinon relevé à remettre au compagnon.
function feuilleReleve(u, p, { paie = false } = {}) {
  const r = Calc.paie(u.id, p), interim = u.type === 'interimaire', lib = libellePeriode(p);
  const entetes = ['Semaine', 'Date', 'Jour', 'Chantier', 'Tâche', 'Arrivée', 'Départ', 'Pause (min)', 'Heures', 'Panier', 'Statut', ...(paie ? ['Normales', 'HS 25 %', 'HS 50 %'] : [])];
  const rows = [
    [{ v: `${paie ? '' : 'Relevé d\'heures – '}${u.nom} – ${lib}`, s: 'title' }],
    [{ v: `${interim ? `Intérimaire (${u.agenceId ? clientName(u.agenceId) : u.agenceLibre || ''})` : 'Salarié'} · ${moOf(u.categorieId).libelle || ''} · semaine de ${fmt(r.base)} h${paie && num(u.salaireHoraire) ? ` · taux brut ${fmt(u.salaireHoraire, 2)} €/h` : ''}`, s: 'muted' }],
    [],
    entetes.map(H),
  ];
  const entries = Store.all('temps').filter(t => t.userId === u.id && Paie.dans(t.date, p)).sort((a, b) => (a.date + (a.debut || '')).localeCompare(b.date + (b.debut || '')));
  const vide = { v: '', s: 'total' };
  [...new Set(entries.map(t => Paie.semaine(t.date)))].forEach(wk => {
    const ts = entries.filter(t => Paie.semaine(t.date) === wk);
    // Une ligne par chantier pointé ; plusieurs chantiers le même jour : total de la journée en dessous
    [...new Set(ts.map(t => t.date))].forEach(date => {
      const jour = ts.filter(t => t.date === date);
      jour.forEach(t => {
        const a = affaireOf(t.affaireId);
        rows.push([wk.replace('-W', ' S'), dateFr(t.date), new Date(`${t.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' }), `${a.code || ''} ${a.nom || ''}`.trim(), t.tache || '',
          t.debut || '', t.fin || '', num(t.pause) || '', num(t.heures), t.panier ? 'Oui' : '', t.statut || (t.debut && !t.fin ? 'En cours' : 'À valider')]);
      });
      if (jour.length > 1) rows.push(['', '', { v: `Total du ${dateFr(date)} (${jour.length} chantiers)`, s: 'muted' }, '', '', '', '', '', { v: sumBy(jour.filter(t => t.statut !== 'Refusé'), t => num(t.heures)), s: 'boldnum' }]);
    });
    const w = r.semaines[wk] || { total: 0, normales: 0, hs25: 0, hs50: 0 }, toutes = sumBy(ts.filter(t => t.statut !== 'Refusé'), t => num(t.heures));
    const complete = w.semaineComplete !== undefined && Math.abs(w.semaineComplete - w.total) > 0.001 ? ` (semaine complète : ${fmt(w.semaineComplete, 2)} h)` : '';
    rows.push([{ v: `Total semaine ${wk.split('-W')[1]}${complete}`, s: 'bold' }, vide, vide, vide, vide, vide, vide, vide, { v: paie ? w.total : toutes, s: 'total' }, vide, { v: paie ? 'validées' : '', s: 'total' },
      ...(paie ? [{ v: w.normales, s: 'total' }, { v: w.hs25, s: 'total' }, { v: w.hs50, s: 'total' }] : [])]);
    rows.push([]);
  });
  const totalPointe = sumBy(entries.filter(t => t.statut !== 'Refusé'), t => num(t.heures));
  rows.push([{ v: paie ? 'Total (heures validées)' : 'Total des heures pointées', s: 'bold' }, '', '', '', '', '', '', '', { v: paie ? r.total : totalPointe, s: 'boldnum' }, '', '', ...(paie ? [{ v: r.normales, s: 'boldnum' }, { v: r.hs25, s: 'boldnum' }, { v: r.hs50, s: 'boldnum' }] : [])]);
  if (!paie) rows.push(['Dont validées', '', '', '', '', '', '', '', r.total]);
  if (paie) {
    rows.push(['Jours travaillés', r.jours]);
    rows.push(['Paniers repas', r.paniers, { v: r.montantPaniers, s: 'eur' }]);
  } else {
    // Relevé du compagnon : ce qu'il a pointé (validé ou non), le validé entre parenthèses
    const pointes = entries.filter(t => t.statut !== 'Refusé'), jours = new Set(pointes.map(t => t.date)), paniers = new Set(pointes.filter(t => t.panier).map(t => t.date));
    rows.push(['Jours travaillés', jours.size, { v: `dont ${r.jours} validé(s)`, s: 'muted' }]);
    rows.push(['Paniers repas', paniers.size, { v: `dont ${r.paniers} validé(s)`, s: 'muted' }]);
  }
  if (Object.keys(r.absences).length) rows.push(['Absences', Paie.libelleAbsences(r.absences)]);
  if (paie) {
    rows.push(['Notes de frais validées (TTC)', '', { v: r.frais, s: 'eur' }]);
    if (!interim && num(u.salaireHoraire)) rows.push(['Salaire brut estimé', '', { v: r.brut, s: 'boldeur' }]);
  }
  if (r.attente) rows.push([{ v: `${fmt(r.attente, 2)} h pointées ne sont pas encore validées${paie ? ' et ne sont pas comptées' : ' par le bureau'}.`, s: 'muted' }]);
  return { name: u.nom, cols: [10, 11, 11, 34, 16, 8, 8, 10, 9, 8, 11, ...(paie ? [10, 9, 9] : [])], freeze: 4, rows };
}
function releveHeuresExcel(p, ids) {
  return XLSX.build(ids.map(id => Store.get('users', id)).filter(Boolean).map(u => feuilleReleve(u, p)));
}
