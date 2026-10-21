// Tableau de bord du dirigeant (pensé pour le téléphone) : chiffre d'affaires du mois et de l'année, marge des chantiers
// en cours, trésorerie à 30 jours, factures en retard, chantiers en dérive, carnet de commandes, devis en attente.
// Alertes de dérive des chantiers : bandeau sur la fiche chantier, réglages des seuils (Paramètres).

const deriveReglages = () => Derive.cfg(Store.data.settings.derives);
const derivesChantiers = () => Store.all('affaires').map(a => ({ a, s: Calc.affaire(a) })).map(x => ({ ...x, l: Derive.alertes(x.a, x.s, deriveReglages()) })).filter(x => x.l.length)
  .sort((x, y) => Derive.GRAVITE[Derive.pire(y.l)] - Derive.GRAVITE[Derive.pire(x.l)] || x.s.margeFin - y.s.margeFin);
const couleurDerive = n => (n === 'depassement' ? 'b-bad' : n === 'attention' ? 'b-warn' : '');

// Fiche chantier : bandeau d'alerte
function deriveChantierHtml(a, s) {
  const l = Derive.alertes(a, s, deriveReglages());
  return l.length ? `<div class="note derive-note ${Derive.pire(l) === 'depassement' ? 'derive-grave' : ''}"><strong>${Derive.pire(l) === 'depassement' ? '🔴' : '🟠'} Chantier en dérive</strong><ul>${l.map(x => `<li><span class="badge ${couleurDerive(x.niveau)}">${esc(Derive.LIBELLES[x.niveau])}</span> ${esc(x.texte)}</li>`).join('')}</ul></div>` : '';
}

// Paramètres : seuils d'alerte (administrateur)
function reglagesDeriveCarte() {
  if (!Store.can('admin')) return '';
  const r = deriveReglages(), n = (k, lib, aide) => `<div class="field"><label for="dv-${k}">${lib}</label><input id="dv-${k}" data-dv="${k}" type="number" min="0" max="200" step="1" value="${esc(r[k])}"><span class="small muted">${aide}</span></div>`;
  return `<h2>Alertes de dérive des chantiers</h2><div class="card">
    <p class="muted small">Toutes les 2 heures, chaque chantier en cours est comparé au budget de son devis. Le chargé d'affaires est prévenu (cloche et téléphone) une fois par poste et par niveau : attention, budget dépassé, consommation en avance sur l'avancement facturé, marge en baisse.</p>
    <label class="check"><input type="checkbox" id="dv-actif" ${r.actif ? 'checked' : ''}> Alertes actives</label>
    <div class="grid2">${n('heures', 'Alerte heures à (% du budget)', 'puis « dépassement » à 100 %')}${n('achats', 'Alerte achats à (% du budget fournitures)', 'puis « dépassement » à 100 %')}
      ${n('avance', 'Consommation en avance sur le facturé de (points)', 'ex. 70 % des heures consommées pour 40 % facturé')}${n('marge', 'Marge à terminaison inférieure à la prévue de (points)', 'ou marge négative')}</div>
    <div class="toolbar"><button class="secondary" id="dv-verifier">Vérifier maintenant</button><span class="spacer"></span><button id="dv-save">Enregistrer</button></div></div>`;
}
function bindReglagesDerive(root) {
  const save = root.querySelector('#dv-save');
  if (!save) return;
  save.onclick = async () => {
    const r = { actif: root.querySelector('#dv-actif').checked };
    root.querySelectorAll('[data-dv]').forEach(el => { r[el.dataset.dv] = num(el.value); });
    try { await Store.saveSettings({ ...Store.data.settings, derives: r }); App.toast('Seuils d\'alerte enregistrés'); } catch (e) { notify(e.message); }
  };
  root.querySelector('#dv-verifier').onclick = () => api('POST', '/api/derives/verifier', {}).then(x => App.toast(x.alertes ? `${x.alertes} chantier(s) signalé(s) aux chargés d'affaires` : 'Aucune nouvelle dérive', 4000)).catch(e => notify(e.message));
}

/* ---------- Tableau de bord du dirigeant ---------- */
Views.direction = () => {
  if (!Store.can('write', 'factures')) return '<p>Réservé au bureau.</p>';
  const auj = isoDate(new Date()), mois = auj.slice(0, 7), an = auj.slice(0, 4), anPrec = String(+an - 1), jourAn = auj.slice(5);
  const factures = Store.all('factures').filter(f => f.numero);
  const ca = filtre => sumBy(factures.filter(f => filtre(f.date || '')), f => Calc.facture(f).ht);
  const caMois = ca(d => d.startsWith(mois)), caMoisPrec = ca(d => d.startsWith(`${anPrec}-${mois.slice(5)}`));
  const caAn = ca(d => d.startsWith(an)), caAnPrec = ca(d => d.startsWith(anPrec) && d.slice(5) <= jourAn);
  const enCours = chantiersActifs().filter(a => !estHorsDevis(a)).map(a => ({ a, s: Calc.affaire(a) }));
  const caFin = sumBy(enCours, x => x.s.caDevis), margeFin = sumBy(enCours, x => x.s.margeFin), margePrev = sumBy(enCours, x => x.s.margePrev);
  const carnet = sumBy(enCours, x => Math.max(0, x.s.caDevis - x.s.caFacture));
  const retard = factures.filter(f => f.type !== 'avoir' && Calc.resteDu(f) > 0.005 && f.echeance && f.echeance < auj).sort((x, y) => Calc.resteDu(y) - Calc.resteDu(x));
  const devisAttente = Store.all('devis').filter(d => d.statut === 'Envoyé' && !d.archive);
  const derives = derivesChantiers();
  // Trésorerie : solde saisi, point bas et solde dans 30 jours (prévision par semaine)
  let treso = null;
  try { const p = previsionTresorerie(), sem = p.semaines.filter(x => x.debut <= isoDate(addDays(new Date(), 30))); treso = { r: p.r, min: sem.reduce((m, x) => (x.solde < m.solde ? x : m), sem[0]), fin: sem[sem.length - 1] }; } catch (e) { treso = null; }
  const aPayer = sumBy(Store.all('achats').filter(x => x.statut !== 'Payée' && (x.echeance || auj) <= isoDate(addDays(new Date(), 30))), x => Calc.achat(x).ttc);
  const evol = (v, ref) => (ref ? `<span class="${v >= ref ? 'pos' : 'neg'}">${v >= ref ? '▲' : '▼'} ${fmt(Math.abs((v / ref - 1) * 100), 0)} %</span>` : '');
  const tuile = (lib, val, sub, cls = '', lien = '') => `<${lien ? `a href="${lien}"` : 'div'} class="card tuile ${cls}"><div class="label">${lib}</div><div class="value">${val}</div><div class="sub">${sub}</div></${lien ? 'a' : 'div'}>`;
  const nomMois = new Date().toLocaleDateString('fr-FR', { month: 'long' });
  return `<div class="direction">
  <h1>Direction <span class="muted small">${dateFr(auj)}</span></h1>
  <div class="tuiles">
    ${tuile(`CA facturé en ${nomMois}`, eur(caMois), `${evol(caMois, caMoisPrec)} ${caMoisPrec ? `${nomMois} ${anPrec} : ${eur(caMoisPrec)}` : ''}`, '', '#/factures')}
    ${tuile(`CA ${an} à date`, eur(caAn), `${evol(caAn, caAnPrec)} ${caAnPrec ? `${anPrec} à date : ${eur(caAnPrec)}` : ''}`, '', '#/factures')}
    ${tuile('Marge des chantiers en cours', `${caFin ? fmt(margeFin / caFin * 100, 1) : '—'} %`, `${eur(margeFin)} à terminaison · prévu ${caFin ? fmt(margePrev / caFin * 100, 1) : '—'} %`, margeFin < margePrev ? 'tuile-alerte' : '', '#/analyse')}
    ${tuile('Trésorerie à 30 jours', treso ? eur(treso.fin.solde) : '—', treso ? `point bas ${eur(treso.min.solde)} (semaine du ${dateFr(treso.min.debut)})${treso.r.dateSolde ? '' : ' · solde du jour à saisir'}` : '', treso && treso.min.solde < 0 ? 'tuile-alerte' : '', '#/tresorerie')}
    ${tuile('Factures en retard', eur(sumBy(retard, f => Calc.resteDu(f))), `${retard.length} facture(s)`, retard.length ? 'tuile-alerte' : '', '#/relances')}
    ${tuile('Fournisseurs à payer sous 30 j', eur(aPayer), 'TTC, échéances comprises', '', '#/achats')}
    ${tuile('Carnet de commandes', eur(carnet), `${enCours.length} chantier(s) en cours`, '', '#/chantiers')}
    ${tuile('Devis en attente', eur(sumBy(devisAttente, d => Calc.doc(d).totalHT)), `${devisAttente.length} devis envoyé(s)`, '', '#/devis')}
  </div>
  <h2>Chantiers en dérive <span class="muted small">${derives.length}</span></h2>
  ${derives.length ? `<ul class="mat-liste">${derives.map(x => `<li class="clickable" data-go="#/chantier/${esc(x.a.id)}"><span><strong>${esc(x.a.code || '')}</strong> ${esc(x.a.nom)}<br><span class="small">${esc(userName(x.a.chargeId))} · marge ${fmt(x.s.margeFinPct, 1)} %</span>
      <span class="small derive-l">${x.l.map(y => esc(y.texte)).join('<br>')}</span></span><span><span class="badge ${couleurDerive(Derive.pire(x.l))}">${esc(Derive.LIBELLES[Derive.pire(x.l)])}</span></span></li>`).join('')}</ul>` : '<p class="muted">Aucun chantier en dérive.</p>'}
  <h2>Factures en retard <span class="muted small">${retard.length}</span></h2>
  ${retard.length ? `<ul class="mat-liste">${retard.slice(0, 8).map(f => `<li class="clickable" data-go="#/facture/${esc(f.id)}"><span><strong>${esc(clientName(docClientId(f)))}</strong><br><span class="small">${esc(f.numero)} · échue le ${dateFr(f.echeance)} (${Math.round((new Date(auj) - new Date(f.echeance)) / 86400000)} j)</span></span><span class="num"><strong>${eur(Calc.resteDu(f))}</strong></span></li>`).join('')}</ul>${retard.length > 8 ? '<p><a href="#/relances">Toutes les relances →</a></p>' : ''}` : '<p class="muted">Aucune facture en retard.</p>'}
  <h2>Devis en attente de réponse</h2>
  ${devisAttente.length ? `<ul class="mat-liste">${devisAttente.sort((x, y) => Calc.doc(y).totalHT - Calc.doc(x).totalHT).slice(0, 6).map(d => `<li class="clickable" data-go="#/devis/${esc(d.id)}"><span><strong>${esc(clientName(docClientId(d)))}</strong><br><span class="small">${esc(d.numero || '')} · ${esc(d.objet || '')} · envoyé le ${dateFr(d.date)}</span></span><span class="num">${eur(Calc.doc(d).totalHT)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun devis en attente.</p>'}
  </div>`;
};
