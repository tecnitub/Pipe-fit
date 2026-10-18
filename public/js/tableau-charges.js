// Tableau de bord par chargé d'affaires : comparatif de l'équipe commerciale, puis pour chacun ses chiffres (carnet, facturé,
// marges, transformation, impayés), ce qu'il a à faire aujourd'hui et ses chantiers qui dérapent.
const chargesAffaires = () => Store.all('users').filter(u => u.role === 'charge' && !u.archive);

function statsCharge(uid) {
  const auj = isoDate(new Date()), annee = auj.slice(0, 4), il1an = isoDate(addDays(new Date(), -365)), il15j = isoDate(addDays(new Date(), -15));
  const affaires = Store.all('affaires').filter(a => a.chargeId === uid && !a.archive);
  const stats = affaires.map(a => ({ a, s: Calc.affaire(a) }));
  const enCours = stats.filter(x => !x.s.termine && !estHorsDevis(x.a));
  const devis = Store.all('devis').filter(d => docChargeId(d) === uid);
  const factures = Store.all('factures').filter(f => docChargeId(f) === uid);
  const envoyes = devis.filter(d => d.statut === 'Envoyé' && !d.archive);
  const recents = devis.filter(d => (d.date || '') >= il1an), acc = recents.filter(d => d.statut === 'Accepté').length, ref = recents.filter(d => d.statut === 'Refusé').length;
  const caDevisEnCours = sumBy(enCours, x => x.s.caDevis);
  // Dérive : heures passées au-delà du prévu, fournitures au-delà du budget, ou marge à terminaison inférieure de 3 points à la marge prévue
  const derives = enCours.map(x => ({ ...x, motifs: [x.s.ecartHeuresPct > 10 && `heures +${fmt(x.s.ecartHeuresPct, 0)} %`, x.s.consoF > 100 && `fournitures ${fmt(x.s.consoF, 0)} % du budget`,
    x.s.margeFinPct < x.s.margePrevPct - 3 && `marge ${fmt(x.s.margeFinPct, 1)} % au lieu de ${fmt(x.s.margePrevPct, 1)} %`].filter(Boolean) })).filter(x => x.motifs.length);
  const impayes = factures.filter(f => Calc.resteDu(f) > 0), retard = impayes.filter(f => f.echeance && f.echeance < auj);
  const surMesChantiers = o => affaires.some(a => a.id === o.affaireId);
  // À faire
  const aFaire = [
    ...envoyes.filter(d => (d.date || '') <= il15j).map(d => ({ ordre: 2, txt: `Relancer le devis ${d.numero} (${clientName(docClientId(d))}, ${eur(Calc.doc(d).totalHT)} HT), envoyé le ${dateFr(d.date)}`, lien: `#/devis/${d.id}` })),
    ...relancesDonnees().aRelancer.filter(x => docChargeId(x.f) === uid).map(x => ({ ordre: 1, txt: `${x.e.prochaine.lib} : facture ${x.f.numero} (${clientName(docClientId(x.f))}), ${eur(x.reste)} · ${x.e.retard} j de retard`, lien: '#/relances' })),
    ...Store.all('situations').filter(x => x.statut === 'Proposée' && surMesChantiers(x)).map(x => ({ ordre: 3, txt: `Situation ${x.numero} en attente de validation (${affaireOf(x.affaireId).code})`, lien: `#/situations/${x.id}` })),
    ...affaires.filter(a => estHorsDevis(a) && ['Terminé', 'Commande demandée'].includes(statutHD(a))).map(a => ({ ordre: 2, txt: `Intervention ${a.code} terminée : demander la commande ou facturer (${eur(Calc.horsDevis(a).total)} HT)`, lien: `#/chantier/${a.id}` })),
    ...affaires.filter(aCompleterHD).map(a => ({ ordre: 1, txt: `Intervention ${a.code} ouverte par un compagnon : compléter client et chargé d'affaires`, lien: `#/chantier/${a.id}` })),
    ...(() => { const h = sumBy(Store.all('temps').filter(t => !t.statut && t.fin !== '' && surMesChantiers(t)), t => num(t.heures)); return h ? [{ ordre: 3, txt: `${fmt(h, 1)} h de pointages à valider sur vos chantiers`, lien: '#/rh/validation' }] : []; })(),
    ...(() => { const n = Store.all('frais').filter(f => f.statut === 'Soumise' && surMesChantiers(f)).length; return n ? [{ ordre: 3, txt: `${n} note(s) de frais à valider`, lien: '#/rh/frais' }] : []; })(),
    ...Store.all('commandes').filter(c => c.statut === 'Brouillon' && surMesChantiers(c)).map(c => ({ ordre: 4, txt: `Commande ${c.numero || ''} en brouillon (${clientName(c.fournisseurId)})`, lien: `#/commandes/${c.id}` })),
    ...(() => { const n = Store.all('reserves').filter(r => r.statut !== 'Levée' && surMesChantiers(r)).length; return n ? [{ ordre: 4, txt: `${n} réserve(s) à lever`, lien: '#/chantiers' }] : []; })(),
  ].sort((a, b) => a.ordre - b.ordre);
  return {
    affaires, stats, enCours, derives, aFaire, envoyes, impayes, retard,
    carnet: sumBy(enCours, x => x.s.resteAFacturer),
    factureAnnee: sumBy(factures.filter(f => (f.date || '').startsWith(annee)), f => Calc.facture(f).ht),
    margePrev: sumBy(enCours, x => x.s.margePrev), margeFin: sumBy(enCours, x => x.s.margeFin),
    margeFinPct: caDevisEnCours ? sumBy(enCours, x => x.s.margeFin) / caDevisEnCours * 100 : 0,
    margePrevPct: caDevisEnCours ? sumBy(enCours, x => x.s.margePrev) / caDevisEnCours * 100 : 0,
    attente: sumBy(envoyes, d => Calc.doc(d).totalHT), transfo: acc + ref ? acc / (acc + ref) * 100 : null, accRef: [acc, ref],
    resteDu: sumBy(impayes, f => Calc.resteDu(f)), enRetard: sumBy(retard, f => Calc.resteDu(f)),
  };
}

Views.charges = params => {
  if (!['admin', 'charge'].includes(Store.me.role)) return '<p>Réservé au bureau.</p>';
  const liste = chargesAffaires();
  const uid = params[0] || (Store.me.role === 'charge' && Store.me.userId) || '';
  if (uid) return ficheCharge(uid, liste);
  const lignes = liste.map(u => ({ u, st: statsCharge(u.id) }));
  return `<div class="toolbar"><a href="#/dashboard" class="btn secondary">← Tableau de bord</a></div>
  <h1>Chargés d'affaires</h1>
  <div class="table-wrap"><table class="charges"><tr><th>Chargé d'affaires</th><th class="num">Chantiers en cours</th><th class="num">Carnet (reste à facturer)</th><th class="num">Facturé ${new Date().getFullYear()}</th><th class="num">Marge à terminaison</th><th class="num">Devis en attente</th><th class="num">Transformation 12 mois</th><th class="num">En retard de paiement</th><th class="num">Chantiers qui dérapent</th><th class="num">À faire</th></tr>
    ${lignes.map(({ u, st }) => `<tr class="clickable" onclick="location.hash='#/charges/${u.id}'"><td><strong>${esc(u.nom)}</strong></td><td class="num">${st.enCours.length}</td><td class="num">${eur(st.carnet)}</td><td class="num">${eur(st.factureAnnee)}</td>
      <td class="num">${eur(st.margeFin)}<br>${marginBadge(st.margeFinPct)}</td><td class="num">${eur(st.attente)}<br><span class="muted small">${st.envoyes.length} devis</span></td>
      <td class="num">${st.transfo === null ? '—' : `${fmt(st.transfo, 0)} %`}<br><span class="muted small">${st.accRef[0]} acceptés / ${st.accRef[1]} refusés</span></td>
      <td class="num ${st.enRetard ? 'neg' : ''}">${st.enRetard ? eur(st.enRetard) : '—'}</td><td class="num">${st.derives.length ? `<span class="badge b-warn">${st.derives.length}</span>` : '—'}</td><td class="num">${st.aFaire.length || '—'}</td></tr>`).join('')}
  </table></div>`;
};
function ficheCharge(uid, liste) {
  const u = Store.get('users', uid);
  if (!u) return '<p>Chargé d\'affaires introuvable.</p>';
  const st = statsCharge(uid);
  return `<div class="toolbar"><a href="#/charges" class="btn secondary">← Tous les chargés d'affaires</a><span class="spacer"></span>
    <select id="ch-sel" style="width:auto" aria-label="Chargé d'affaires">${options(liste, uid, undefined, false)}</select></div>
  <h1>${esc(u.nom)}</h1>
  <div class="cards">
    <div class="card"><div class="label">Carnet de commandes</div><div class="value">${eur(st.carnet)}</div><div class="sub">${st.enCours.length} chantier(s) en cours, reste à facturer</div></div>
    <div class="card"><div class="label">Facturé ${new Date().getFullYear()} HT</div><div class="value">${eur(st.factureAnnee)}</div><div class="sub">restant dû ${eur(st.resteDu)}${st.enRetard ? ` · <span class="neg">en retard ${eur(st.enRetard)}</span>` : ''}</div></div>
    <div class="card"><div class="label">Marge à terminaison</div><div class="value ${signClass(st.margeFin)}">${eur(st.margeFin)}</div><div class="sub">${marginBadge(st.margeFinPct)} prévue ${fmt(st.margePrevPct, 1)} % (${eur(st.margePrev)})</div></div>
    <div class="card"><div class="label">Devis en attente</div><div class="value">${eur(st.attente)}</div><div class="sub">${st.envoyes.length} devis · transformation ${st.transfo === null ? '—' : `${fmt(st.transfo, 0)} %`} sur 12 mois</div></div>
  </div>
  <div class="grid2 charges-cols">
    <div class="card"><strong>À faire</strong>${st.aFaire.length ? `<ul class="a-faire">${st.aFaire.map(x => `<li><a href="${x.lien}">${esc(x.txt)}</a></li>`).join('')}</ul>` : '<p class="muted">Rien en attente. 👍</p>'}</div>
    <div class="card"><strong>Chantiers qui dérapent</strong>${st.derives.length ? `<ul class="a-faire">${st.derives.map(x => `<li><a href="#/chantier/${x.a.id}">${esc(x.a.code)} ${esc(x.a.nom)}</a><br><span class="small warn-text">${x.motifs.map(esc).join(' · ')}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun : heures, fournitures et marges dans les clous.</p>'}</div>
  </div>
  <h2>Ses chantiers en cours</h2>
  ${st.enCours.length ? `<div class="table-wrap"><table><tr><th>Chantier</th><th>Client</th><th class="num">Montant du marché</th><th>Facturé</th><th>Heures passées / prévues</th><th class="num">Marge prévue</th><th class="num">Marge à terminaison</th></tr>
    ${st.enCours.sort((a, b) => a.s.margeFinPct - a.s.margePrevPct - (b.s.margeFinPct - b.s.margePrevPct)).map(({ a, s }) => `<tr class="clickable" onclick="location.hash='#/chantier/${a.id}'"><td><strong>${esc(a.code)}</strong> ${esc(a.nom)}<br>${badge(a.statut)}</td><td>${esc(clientName(a.clientId))}</td>
      <td class="num">${eur(s.caDevis)}</td><td>${gauge(s.caFacture, s.caDevis)}<span class="small muted">${eur(s.caFacture)}</span></td>
      <td>${gauge(s.heuresPassees, s.heuresPrevues)}<span class="small">${fmt(s.heuresPassees, 0)} / ${fmt(s.heuresPrevues, 0)} h</span></td>
      <td class="num">${pct(s.margePrevPct)}</td><td class="num">${marginBadge(s.margeFinPct)}<br><span class="small ${s.margeFinPct < s.margePrevPct - 3 ? 'neg' : 'muted'}">${s.margeFinPct >= s.margePrevPct ? '+' : ''}${fmt(s.margeFinPct - s.margePrevPct, 1)} pt</span></td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun chantier en cours.</p>'}`;
}
Views.charges.bind = root => {
  const s = root.querySelector('#ch-sel');
  if (s) s.onchange = () => { location.hash = `#/charges/${s.value}`; };
};
