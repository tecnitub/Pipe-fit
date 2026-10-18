// Trésorerie prévisionnelle sur 13 semaines : solde bancaire saisi + encaissements attendus (factures, situations en cours,
// retenues de garantie libérables) − décaissements prévus (factures fournisseurs, commandes non encore facturées,
// salaires chargés, notes de frais, charges fixes). Hypothèses réglables, chaque montant renvoie à sa pièce.
const SEMAINES_TRESO = 13;
const tresoReglages = () => ({ solde: 0, dateSolde: '', chargesFixes: 0, delaiFournisseurs: 45, tauxCharges: 45, masseSalariale: '', retards: true, ...(Store.data.settings.tresorerie || {}) });
// Masse salariale mensuelle chargée estimée : salaire horaire brut × durée hebdo × 52/12 × (1 + charges patronales)
const masseSalarialeEstimee = r => Math.round(sumBy(Store.all('users').filter(u => u.type !== 'interimaire' && !u.archive), u => num(u.salaireHoraire) * (num(Store.data.settings.dureeHebdo) || 35) * 52 / 12) * (1 + num(r.tauxCharges) / 100));
const finDeMois = s => { const d = new Date(`${s}T12:00:00`); return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };

function previsionTresorerie(auj = isoDate(new Date())) {
  const r = tresoReglages(), s = Store.data.settings, lundi = isoDate(mondayOf(new Date(`${auj}T12:00:00`)));
  const debuts = Array.from({ length: SEMAINES_TRESO }, (_, i) => isoDate(addDays(new Date(`${lundi}T12:00:00`), 7 * i)));
  const fin = isoDate(addDays(new Date(`${debuts[SEMAINES_TRESO - 1]}T12:00:00`), 6));
  const flux = [];
  const ajoute = (date, montant, sens, libelle, lien, incertain) => { if (montant > 0.005 && date <= fin) flux.push({ date: date < auj ? auj : date, montant: Math.round(montant * 100) / 100, sens, libelle, lien, incertain: !!incertain || date < auj }); };
  const enRetard = d => d < auj;

  // Encaissements : factures clients non soldées (les retards sont supposés encaissés sous 2 semaines, si l'option est cochée)
  Store.all('factures').filter(f => f.type !== 'avoir' && f.numero && Calc.resteDu(f) > 0).forEach(f => {
    if (enRetard(f.echeance || auj) && !r.retards) return;
    const date = enRetard(f.echeance || auj) ? isoDate(addDays(new Date(), 14)) : f.echeance;
    ajoute(date, Calc.resteDu(f), 'in', `Facture ${f.numero} · ${clientName(docClientId(f))}${enRetard(f.echeance || auj) ? ' (en retard)' : ''}`, `#/facture/${f.id}`, enRetard(f.echeance || auj));
  });
  // Situations proposées ou acceptées sans facture : facture à l'acceptation, réglée au délai de paiement
  Store.all('situations').filter(x => ['Proposée', 'Acceptée'].includes(x.statut) && !x.factureId).forEach(x => {
    const c = Calc.situation(x), base = x.statut === 'Proposée' ? addDays(new Date(`${x.date || auj}T12:00:00`), 10) : new Date(`${x.date || auj}T12:00:00`);
    ajoute(isoDate(addDays(base < new Date() ? new Date() : base, num(s.delaiPaiement) || 45)), c.netAPayer, 'in', `Situation ${x.numero || ''} (${x.statut.toLowerCase()}) · ${affaireOf(x.affaireId).code || ''}`, `#/situations/${x.id}`, true);
  });
  // Retenues de garantie libérables dans la période
  Store.all('affaires').forEach(a => {
    const rg = retenuesChantier(a), e = Relances.retenue(a, rg.total, auj);
    if (e && e.le) ajoute(e.le < auj ? isoDate(addDays(new Date(), 30)) : e.le, rg.total, 'in', `Retenue de garantie · ${a.code || ''}`, `#/chantier/${a.id}`, true);
  });

  // Décaissements : factures fournisseurs à payer
  Store.all('achats').filter(x => x.statut !== 'Payée').forEach(x => ajoute(x.echeance || auj, Calc.achat(x).ttc, 'out', `Fournisseur ${clientName(x.fournisseurId)} · ${x.numeroFournisseur || x.ref || ''}`, '#/achats', enRetard(x.echeance || auj)));
  // Commandes envoyées ou réceptionnées pas encore facturées par le fournisseur
  const facturees = new Set(Store.all('achats').flatMap(x => (x.imputations || []).map(l => l.commandeId)).filter(Boolean));
  Store.all('commandes').filter(c => ['Envoyée', 'Réceptionnée', 'Livrée', 'Confirmée'].includes(c.statut) && !facturees.has(c.id)).forEach(c => {
    const ht = Calc.commande(c).total;
    ajoute(isoDate(addDays(new Date(`${c.dateLivraison || c.date || auj}T12:00:00`), num(r.delaiFournisseurs))), ht * (1 + num(s.tva) / 100), 'out', `Commande ${c.numero || ''} · ${clientName(c.fournisseurId)} (à facturer par le fournisseur)`, `#/commandes/${c.id}`, true);
  });
  // Notes de frais validées, remboursées en fin de mois
  const frais = sumBy(Store.all('frais').filter(f => f.statut === 'Validée'), f => num(f.montantTTC));
  ajoute(finDeMois(auj), frais, 'out', 'Notes de frais validées à rembourser', '#/rh/frais');
  // Salaires (fin de mois) et charges fixes (le 5)
  const masse = r.masseSalariale !== '' && r.masseSalariale !== undefined ? num(r.masseSalariale) : masseSalarialeEstimee(r);
  for (let m = 0; m < 4; m++) {
    const d0 = new Date(`${auj}T12:00:00`), mois = new Date(d0.getFullYear(), d0.getMonth() + m, 1, 12);
    const libMois = mois.toLocaleDateString('fr-FR', { month: 'long' });
    if (finDeMois(isoDate(mois)) >= auj) ajoute(finDeMois(isoDate(mois)), masse, 'out', `Salaires et charges sociales de ${libMois}`, '#/rh');
    const le5 = isoDate(new Date(mois.getFullYear(), mois.getMonth(), 5, 12));
    if (le5 >= auj) ajoute(le5, num(r.chargesFixes), 'out', `Charges fixes de ${libMois} (loyer, leasing, assurances…)`, '');
  }

  let solde = num(r.solde);
  const semaines = debuts.map((d, i) => {
    const f = flux.filter(x => x.date >= d && x.date <= isoDate(addDays(new Date(`${d}T12:00:00`), 6))).sort((a, b) => a.date.localeCompare(b.date));
    const entrees = sumBy(f.filter(x => x.sens === 'in'), x => x.montant), sorties = sumBy(f.filter(x => x.sens === 'out'), x => x.montant);
    solde += entrees - sorties;
    return { debut: d, semaine: isoWeek(new Date(`${d}T12:00:00`)), flux: f, entrees, sorties, solde, i };
  });
  return { r, masse, semaines, flux, min: semaines.reduce((m, x) => (x.solde < m.solde ? x : m), semaines[0]) };
}

// Courbe du solde de fin de semaine (une seule série, ligne zéro, semaines négatives marquées)
function courbeTresorerie(p) {
  const W = 760, H = 220, mg = { g: 70, d: 16, h: 14, b: 30 };
  const vals = [num(p.r.solde), ...p.semaines.map(x => x.solde)];
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const pas = 10 ** Math.floor(Math.log10((hi - lo) / 4)), tick = [1, 2, 5, 10].map(k => k * pas).find(t => (hi - lo) / t <= 5) || pas * 10;
  lo = Math.floor(lo / tick) * tick; hi = Math.ceil(hi / tick) * tick;
  const x = i => mg.g + (W - mg.g - mg.d) * i / SEMAINES_TRESO, y = v => mg.h + (H - mg.h - mg.b) * (hi - v) / (hi - lo);
  const ticks = []; for (let v = lo; v <= hi + 1e-6; v += tick) ticks.push(v);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const kEur = v => `${fmt(v / 1000, Math.abs(v) < 10000 && v % 1000 ? 1 : 0)} k€`;
  return `<svg class="treso-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Solde de trésorerie prévu en fin de semaine sur ${SEMAINES_TRESO} semaines">
    ${ticks.map(v => `<line x1="${mg.g}" x2="${W - mg.d}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : 'grille'}"/><text x="${mg.g - 8}" y="${y(v) + 4}" text-anchor="end" class="axe">${kEur(v)}</text>`).join('')}
    ${p.semaines.map((s, i) => (i % 2 === 0 ? `<text x="${x(i + 1)}" y="${H - 10}" text-anchor="middle" class="axe">${dateFr(s.debut).slice(0, 5)}</text>` : '')).join('')}
    ${lo < 0 ? `<rect x="${mg.g}" y="${y(0)}" width="${W - mg.g - mg.d}" height="${y(lo) - y(0)}" class="zone-neg"/>` : ''}
    <polyline points="${pts.map(q => q.join(',')).join(' ')}" class="ligne"/>
    ${pts.map(([px, py], i) => `<circle cx="${px}" cy="${py}" r="${vals[i] < 0 ? 5 : 4}" class="${vals[i] < 0 ? 'pt neg' : 'pt'}"/>`).join('')}
    ${pts.map(([px], i) => `<rect x="${px - (W - mg.g) / SEMAINES_TRESO / 2}" y="${mg.h}" width="${(W - mg.g) / SEMAINES_TRESO}" height="${H - mg.h - mg.b}" class="cible" data-i="${i}"/>`).join('')}
  </svg>`;
}

Views.tresorerie = () => {
  if (!['admin', 'charge'].includes(Store.me.role)) return '<p>Réservé au bureau.</p>';
  const p = previsionTresorerie(), r = p.r, peut = Store.can('admin');
  const entrees = sumBy(p.semaines, s => s.entrees), sorties = sumBy(p.semaines, s => s.sorties), fin = p.semaines[SEMAINES_TRESO - 1];
  return `<h1>Facturation</h1>${facturationTabs('tresorerie')}
  ${!r.dateSolde ? '<p class="note warn-note">Saisissez le solde bancaire du jour (Hypothèses, en bas de page) : la prévision part de ce montant.</p>' : ''}
  <div class="cards">
    <div class="card"><div class="label">Solde bancaire</div><div class="value">${eur(r.solde)}</div><div class="sub">${r.dateSolde ? `au ${dateFr(r.dateSolde)}` : 'à saisir'}</div></div>
    <div class="card"><div class="label">Point bas sur 13 semaines</div><div class="value ${p.min.solde < 0 ? 'neg' : ''}">${eur(p.min.solde)}</div><div class="sub">semaine du ${dateFr(p.min.debut)}</div></div>
    <div class="card"><div class="label">Encaissements attendus</div><div class="value pos">${eur(entrees)}</div><div class="sub">dont incertains ${eur(sumBy(p.flux.filter(x => x.sens === 'in' && x.incertain), x => x.montant))}</div></div>
    <div class="card"><div class="label">Décaissements prévus</div><div class="value">${eur(sorties)}</div><div class="sub">solde fin de période ${eur(fin.solde)}</div></div>
  </div>
  <div class="card treso-graph"><div class="label">Solde prévu en fin de semaine</div>${courbeTresorerie(p)}<div class="treso-bulle" hidden></div></div>
  <div class="table-wrap"><table class="treso"><tr><th>Semaine</th><th class="num">Encaissements</th><th class="num">Décaissements</th><th class="num">Solde fin de semaine</th></tr>
    ${p.semaines.map(s => `<tr class="${s.solde < 0 ? 'neg-ligne' : ''}"><td><details><summary>${s.semaine.replace('-W', ' S')} · du ${dateFr(s.debut)} <span class="muted small">(${s.flux.length} mouvement${s.flux.length > 1 ? 's' : ''})</span></summary>
      ${s.flux.length ? `<ul class="treso-flux">${s.flux.map(x => `<li><span class="${x.sens === 'in' ? 'pos' : ''}">${x.sens === 'in' ? '+' : '−'} ${eur(x.montant)}</span> ${dateFr(x.date)} · ${x.lien ? `<a href="${x.lien}">${esc(x.libelle)}</a>` : esc(x.libelle)}${x.incertain ? ' <span class="badge">estimé</span>' : ''}</li>`).join('')}</ul>` : '<p class="muted small">Aucun mouvement prévu.</p>'}</details></td>
      <td class="num pos">${s.entrees ? eur(s.entrees) : ''}</td><td class="num">${s.sorties ? eur(s.sorties) : ''}</td><td class="num"><strong class="${s.solde < 0 ? 'neg' : ''}">${eur(s.solde)}</strong></td></tr>`).join('')}</table></div>
  <h2>Hypothèses</h2>
  <div class="card"><div class="grid2">
    <div class="field"><label for="tr-solde">Solde bancaire (€)</label><input id="tr-solde" type="number" step="0.01" value="${esc(r.solde)}" ${peut ? '' : 'disabled'}></div>
    <div class="field"><label for="tr-date">Au</label><input id="tr-date" type="date" value="${esc(r.dateSolde || isoDate(new Date()))}" ${peut ? '' : 'disabled'}></div>
    <div class="field"><label for="tr-masse">Salaires et charges sociales par mois (€)</label><input id="tr-masse" type="number" step="1" value="${esc(r.masseSalariale)}" placeholder="Estimation : ${eur(masseSalarialeEstimee(r))}" ${peut ? '' : 'disabled'}><span class="small muted">Vide : salaires horaires de l'équipe × ${fmt(num(Store.data.settings.dureeHebdo) || 35)} h × 52/12 + ${fmt(r.tauxCharges)} % de charges</span></div>
    <div class="field"><label for="tr-fixes">Charges fixes par mois (€)</label><input id="tr-fixes" type="number" step="1" value="${esc(r.chargesFixes)}" ${peut ? '' : 'disabled'}><span class="small muted">Loyer, leasing, assurances, TVA nette, remboursements d'emprunt…</span></div>
    <div class="field"><label for="tr-four">Délai de paiement fournisseurs (jours)</label><input id="tr-four" type="number" step="1" value="${esc(r.delaiFournisseurs)}" ${peut ? '' : 'disabled'}><span class="small muted">Pour les commandes pas encore facturées</span></div>
    <div class="field"><label class="check" style="margin-top:22px"><input type="checkbox" id="tr-retards" ${r.retards ? 'checked' : ''} ${peut ? '' : 'disabled'}> Compter les factures clients en retard (encaissées sous 2 semaines)</label></div>
  </div>${peut ? '<div class="modal-actions"><button id="tr-ok">Enregistrer les hypothèses</button></div>' : '<p class="muted small">Seul un administrateur peut modifier les hypothèses.</p>'}</div>
  <p class="muted small">Non compris : chantiers restant à facturer sans situation en cours, intérim non encore facturé par l'agence, TVA (à mettre dans les charges fixes).</p>`;
};
Views.tresorerie.bind = root => {
  const ok = root.querySelector('#tr-ok');
  if (ok) ok.onclick = async () => {
    const v = id => root.querySelector(id).value;
    await Store.saveSettings({ ...Store.data.settings, tresorerie: { ...tresoReglages(), solde: num(v('#tr-solde')), dateSolde: v('#tr-date'), masseSalariale: v('#tr-masse') === '' ? '' : num(v('#tr-masse')),
      chargesFixes: num(v('#tr-fixes')), delaiFournisseurs: num(v('#tr-four')), retards: root.querySelector('#tr-retards').checked } });
    App.render(); App.toast('Hypothèses enregistrées');
  };
  // Infobulle de la courbe
  const p = previsionTresorerie(), bulle = root.querySelector('.treso-bulle'), svg = root.querySelector('.treso-svg');
  root.querySelectorAll('.treso-svg .cible').forEach(c => {
    c.onmouseenter = c.onclick = () => {
      const i = +c.dataset.i, s = p.semaines[i - 1];
      bulle.innerHTML = i === 0 ? `<strong>Solde de départ</strong><br>${eur(p.r.solde)}` : `<strong>Semaine du ${dateFr(s.debut)}</strong><br>+ ${eur(s.entrees)} · − ${eur(s.sorties)}<br>Solde : <strong>${eur(s.solde)}</strong>`;
      const b = c.getBoundingClientRect(), g = svg.parentElement.getBoundingClientRect();
      bulle.style.left = `${Math.min(g.width - 180, Math.max(0, b.left - g.left + b.width / 2 - 90))}px`; bulle.hidden = false;
    };
    c.onmouseleave = () => { bulle.hidden = true; };
  });
};
