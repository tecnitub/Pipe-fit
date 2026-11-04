// Fiche chantier : contrat d'entretien (créé depuis le carnet de maintenance du DOE), visites, comptes rendus, facturation
const carnetsDoe = new Map();
async function chargerCarnetDoe(affaireId) {
  try {
    const l = await api('GET', `/api/liens?affaireId=${encodeURIComponent(affaireId)}&app=doe`);
    carnetsDoe.set(affaireId, ((l || []).map(x => (x.resume || {}).maintenance || []).find(m => m.length)) || []);
  } catch (e) { carnetsDoe.set(affaireId, carnetsDoe.get(affaireId) || []); }
}
// Carnet par défaut : opérations usuelles des équipements mis en service (matériel retenu de l'étude)
const ENTRETIEN_TYPES = { terminal: [['Filtres et bac à condensats', 'nettoyage ou remplacement', 6], ['Vanne, ventilateur, régulation', 'contrôle de fonctionnement', 12]],
  ecs: [['Production d\'ECS', 'détartrage, désinfection, contrôle des températures (légionelles)', 12]], desenfumage: [['Désenfumage', 'essai réglementaire', 12]], gtb: [['Régulation / GTB', 'contrôle des points, sauvegarde', 12]],
  vase: [['Vase d\'expansion et soupape', 'contrôle de la pression de gonflage et du tarage', 12]], split: [['Climatisation', 'nettoyage des filtres, contrôle d\'étanchéité', 12]] };
function carnetMateriel(affaireId) {
  const ms = (typeof materielChantier !== 'undefined' && materielChantier.get(affaireId)) || [];
  const mat = ms.filter(m => m.mesLe || m.poseLe).flatMap(m => (MaterielRetenu.ENTRETIEN[MaterielRetenu.typeMes(m.cle)] || MaterielRetenu.ENTRETIEN.autre)
    .map(([op, prec, per]) => [m.designation, `${op}${prec ? ` (${prec})` : ''}`, `${per} mois`, 'Mainteneur CVC']));
  if (mat.length) return mat;
  // Sinon : équipements de la liste des mises en service (études reliées au chantier)
  const a = Store.get('affaires', affaireId), ts = a && typeof tachesMes === 'function' ? tachesMes(a).filter(t => t.nature === 'mes') : [];
  return ts.flatMap(t => (ENTRETIEN_TYPES[t.type] || MaterielRetenu.ENTRETIEN[t.type] || MaterielRetenu.ENTRETIEN.autre)
    .map(([op, prec, per]) => [t.libelle.slice(0, 120), `${op}${prec ? ` (${prec})` : ''}`, `${per} mois`, /frigo|étanchéité/i.test(op) ? 'Frigoriste certifié' : 'Mainteneur CVC']));
}
const ETAT_VISITE = { faite: ['b-ok', '✓ faite'], retard: ['b-bad', 'en retard'], bientot: ['b-warn', 'à planifier'], planifiee: ['b-info', 'planifiée'] };
function contratChantierHtml(a) {
  const c = a.contrat, auj = isoDate(new Date()), bureau = Store.can('write', 'affaires');
  if (!c || !c.actif) {
    const doe = carnetsDoe.get(a.id) || [], mat = carnetMateriel(a.id);
    return `<h2>Contrat d'entretien</h2><div class="card"><p class="muted small">Après la réception : visites d'entretien planifiées à partir du carnet de maintenance du DOE${doe.length ? ` (${doe.length} opération(s))` : ''}${!doe.length && mat.length ? `, ou des opérations usuelles des équipements du chantier (${mat.length} opération(s))` : ''}, rappels, comptes rendus et facturation des échéances.</p>
      ${bureau ? '<button class="small" id="ct-creer">🔧 Créer le contrat d\'entretien</button>' : ''}</div>`;
  }
  const b = Contrats.bilan(c, auj), ech = Contrats.echeances(c);
  return `<h2>Contrat d'entretien <span class="muted small">${b.faites}/${b.total} visite(s) faite(s)${b.retard ? ` · <span class="neg">${b.retard} en retard</span>` : ''}</span></h2>
    <div class="card">
      <p class="small">Du ${dateFr(c.debut)} au ${dateFr(b.fin)} (${c.dureeMois} mois) · ${c.montantAnnuel ? `${eur(c.montantAnnuel)} HT par an, facturation ${c.facturation}` : 'montant à définir'} · ${c.carnet.length} opération(s)${c.origine ? ` (${esc(c.origine)})` : ''}
        ${bureau ? ' <button class="small secondary" id="ct-param">Modifier</button>' : ''}</p>
      ${b.prochaine ? `<p class="small">Prochaine visite : <strong>${dateFr(b.prochaine.prevue)}</strong> — ${esc(b.prochaine.operations.map(o => o.equipement).filter((x, i, t) => t.indexOf(x) === i).join(', '))}</p>` : '<p class="small">✓ Toutes les visites sont faites.</p>'}
      <div class="table-wrap"><table><tr><th>Date prévue</th><th>Opérations</th><th>État</th><th></th></tr>
      ${c.visites.map(v => { const e = Contrats.etatVisite(v, auj), [cls, lib] = ETAT_VISITE[e];
        return `<tr><td>${dateFr(v.prevue)}</td><td class="small">${v.operations.map(o => `${o.faite ? '✓ ' : ''}${esc(o.equipement)} : ${esc(o.operation)}`).join('<br>')}</td>
          <td><span class="badge ${cls}">${lib}</span>${v.statut === 'faite' ? `<br><span class="small muted">le ${dateFr(v.faiteLe)}${v.par ? ` par ${esc(v.par)}` : ''}</span>` : ''}</td>
          <td>${v.statut === 'faite' ? `<button class="small secondary" data-ct-cr="${esc(v.id)}">🖨️ Compte rendu</button>` : bureau || Store.me.role === 'atelier' ? `<button class="small" data-ct-faite="${esc(v.id)}">✓ Visite faite</button>` : ''}</td></tr>`; }).join('')}</table></div>
      ${ech.length ? `<h3>Facturation</h3><div class="table-wrap"><table><tr><th>Période</th><th class="num">Montant HT</th><th>Facture</th></tr>
        ${ech.map(x => { const f = x.factureId && Store.get('factures', x.factureId); return `<tr><td>${dateFr(x.du)} → ${dateFr(x.au)}</td><td class="num">${eur(x.montant)}</td>
          <td>${f ? `<a href="#/factures/${esc(f.id)}">${esc(f.numero || 'facture')}</a> <span class="badge">${esc(f.statut)}</span>` : bureau && x.du <= auj ? `<button class="small" data-ct-fact="${esc(x.periode)}">🧾 Facturer</button>` : '<span class="muted small">à venir</span>'}</td></tr>`; }).join('')}</table></div>` : ''}
      ${bureau && b.fin && b.fin <= Contrats.plusMois(auj, 2) ? '<button class="small secondary" id="ct-renouv">🔁 Renouveler le contrat</button>' : ''}
    </div>`;
}
function bindContratChantier(root, a) {
  const z = root.querySelector('#contrat-entretien'); if (!z) return;
  const maj = (c, msg) => { Store.upsert('affaires', { ...Store.get('affaires', a.id), contrat: c }); if (msg) App.toast(msg); App.render(); };
  const parametres = async c0 => {
    const doe = carnetsDoe.get(a.id) || [], mat = carnetMateriel(a.id), src = doe.length ? 'carnet du DOE' : mat.length ? 'équipements du chantier' : '';
    const recep = (Store.all('receptions').find(p => p.affaireId === a.id && p.statut === 'Signé') || {}).date || isoDate(new Date());
    const m = Modal.open(`<h2>${c0 ? 'Contrat d\'entretien' : 'Créer le contrat d\'entretien'}</h2>
      ${c0 ? '' : `<p class="small">${src ? `Opérations reprises ${src === 'carnet du DOE' ? 'du carnet du DOE' : 'des équipements du chantier'} (${(doe.length ? doe : mat).length}).` : 'Aucun carnet : le contrat sera créé vide (ajoutez les opérations dans le DOE puis recréez-le).'}</p>`}
      <div class="grid2"><div class="field"><label for="ct-debut">Début</label><input type="date" id="ct-debut" value="${esc(c0 ? c0.debut : recep)}"></div>
        <div class="field"><label for="ct-duree">Durée (mois)</label><input type="number" id="ct-duree" min="1" max="60" value="${c0 ? c0.dureeMois : 12}"></div>
        <div class="field"><label for="ct-montant">Montant annuel HT (€)</label><input type="number" id="ct-montant" min="0" step="10" value="${c0 ? c0.montantAnnuel || '' : ''}"></div>
        <div class="field"><label for="ct-fact">Facturation</label><select id="ct-fact">${Object.keys(Contrats.PERIODES).map(k => `<option ${c0 && c0.facturation === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <div class="actions"><button class="secondary" id="ct-x">Annuler</button>${c0 ? '<button class="danger secondary" id="ct-stop">Arrêter le contrat</button>' : ''}<button id="ct-ok">${c0 ? 'Enregistrer' : 'Créer'}</button></div>`);
    const v = s => m.querySelector(s).value;
    m.querySelector('#ct-x').onclick = Modal.close;
    const st = m.querySelector('#ct-stop'); if (st) st.onclick = () => { Modal.close(); maj({ ...c0, actif: false }, 'Contrat arrêté'); };
    m.querySelector('#ct-ok').onclick = () => {
      const o = { debut: v('#ct-debut'), dureeMois: num(v('#ct-duree')) || 12, montantAnnuel: num(v('#ct-montant')), facturation: v('#ct-fact') };
      Modal.close();
      if (c0) { const garde = c0.debut === o.debut && c0.dureeMois === o.dureeMois; maj(garde ? { ...c0, ...o } : { ...Contrats.creer({ carnet: c0.carnet, ...o, origine: c0.origine }), factures: c0.factures || [] }, 'Contrat mis à jour'); }
      else maj(Contrats.creer({ carnet: doe.length ? doe : mat, ...o, origine: src }), 'Contrat d\'entretien créé : visites planifiées');
    };
  };
  const cr = z.querySelector('#ct-creer'); if (cr) cr.onclick = () => parametres(null);
  const pa = z.querySelector('#ct-param'); if (pa) pa.onclick = () => parametres(a.contrat);
  const rn = z.querySelector('#ct-renouv'); if (rn) rn.onclick = () => maj({ ...Contrats.renouveler(a.contrat) }, 'Contrat renouvelé pour une nouvelle période');
  z.querySelectorAll('[data-ct-faite]').forEach(b => b.onclick = () => {
    const c = JSON.parse(JSON.stringify(a.contrat)), v = c.visites.find(x => x.id === b.dataset.ctFaite);
    const m = Modal.open(`<h2>Visite d'entretien du ${dateFr(v.prevue)}</h2>
      ${v.operations.map((o, i) => `<label class="checkbox"><input type="checkbox" data-op="${i}" checked> ${esc(o.equipement)} : ${esc(o.operation)}</label>`).join('')}
      <div class="grid2"><div class="field"><label for="ctv-date">Faite le</label><input type="date" id="ctv-date" value="${isoDate(new Date())}"></div>
        <div class="field"><label for="ctv-par">Technicien</label><input id="ctv-par" value="${esc(userName(Store.me.userId) || Store.me.nom || '')}"></div></div>
      <div class="field"><label for="ctv-obs">Observations, pièces remplacées, réserves</label><textarea id="ctv-obs" rows="3" data-dictee></textarea></div>
      <div class="actions"><button class="secondary" id="ctv-x">Annuler</button><button id="ctv-ok">Enregistrer</button></div>`);
    m.querySelector('#ctv-x').onclick = Modal.close;
    m.querySelector('#ctv-ok').onclick = () => { Contrats.marquerFaite(c, v.id, { date: m.querySelector('#ctv-date').value, par: m.querySelector('#ctv-par').value, observations: m.querySelector('#ctv-obs').value, operations: [...m.querySelectorAll('[data-op]')].map(x => x.checked) }); Modal.close(); maj(c, 'Visite enregistrée'); };
  });
  z.querySelectorAll('[data-ct-cr]').forEach(b => b.onclick = () => {
    const v = a.contrat.visites.find(x => x.id === b.dataset.ctCr), corps = () => `<h3 class="doc-h">Visite d'entretien</h3><p>Prévue le ${dateFr(v.prevue)}, réalisée le ${dateFr(v.faiteLe)}${v.par ? ` par ${esc(v.par)}` : ''}.</p>
      <table class="doc-lines compact"><tr><th>Équipement</th><th>Opération</th><th>Intervenant</th><th>Réalisée</th></tr>${v.operations.map(o => `<tr><td>${esc(o.equipement)}</td><td>${esc(o.operation)}</td><td>${esc(o.intervenant)}</td><td>${o.faite ? 'oui' : '<strong>non</strong>'}</td></tr>`).join('')}</table>
      ${v.observations ? `<h3 class="doc-h">Observations</h3><p class="pre">${esc(v.observations)}</p>` : ''}<p class="small">Contrat d'entretien du ${dateFr(a.contrat.debut)} (${a.contrat.dureeMois} mois).</p>`;
    PDF.telecharger(documentEssai('COMPTE RENDU DE VISITE D\'ENTRETIEN', { affaireId: a.id, numero: `${a.code || ''}-${v.id.slice(1)}`, date: v.faiteLe }, corps), `Entretien-${a.code || a.id}-${v.faiteLe}.pdf`.replace(/[^\w.-]+/g, '_')).catch(e => notify(e.message));
  });
  z.querySelectorAll('[data-ct-fact]').forEach(b => b.onclick = () => {
    const c = JSON.parse(JSON.stringify(a.contrat)), e = Contrats.echeances(c).find(x => x.periode === b.dataset.ctFact), s = Store.data.settings;
    const f = Store.upsert('factures', { numero: '', affaireId: a.id, clientId: a.clientId, contactId: a.contactId || '', siteId: a.siteId || '', chargeId: a.chargeId || '',
      objet: `Contrat d'entretien ${a.code || ''} – ${a.nom || ''}`, date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))), statut: 'Émise',
      lignes: Contrats.lignesFacture(c, e, `${a.code || ''} ${a.nom || ''}`.trim()), ajustements: [], zoneId: '', retenuePct: 0, ...tvaDuClient(a.clientId) });
    c.factures = [...(c.factures || []), { periode: e.periode, factureId: f.id }];
    maj(c, 'Facture de l\'échéance créée');
  });
}
