// Corps des procès-verbaux d'essais (épreuve hydraulique, mise en service, relevé d'équilibrage), sous l'en-tête du
// document : utilisé par Pipe-Fit (impression, PDF, e-mail) et par l'application DOE (annexes F et G).
// x : { img(id) -> URL, societe, chantier: { code, nom }, technicien }
const EssaisDoc = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
  const vide = v => v === '' || v === null || v === undefined;
  const nb = (v, d = 2) => (vide(v) ? '—' : Number(String(v).replace(',', '.')).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const l = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const table = rows => `<table class="doc-lines compact ppsps-t">${rows.join('')}</table>`;
  const photos = (ids, x) => ((ids || []).length ? `<div class="doc-photos">${ids.map((p, i) => `<figure><img src="${x.img(p)}" alt="Photo ${i + 1}"><figcaption>Photo ${i + 1}</figcaption></figure>`).join('')}</div>` : '');
  const signatures = (r, x) => `<div class="signatures signed">
      <div>Le technicien<br><strong>${esc(x.technicien)}</strong>${r.signeLe ? `<br><span class="small">signé sur écran le ${new Date(r.signeLe).toLocaleString('fr-FR')}</span>` : ''}${r.signatureTechId ? `<img src="${x.img(r.signatureTechId)}" alt="Signature du technicien">` : ''}</div>
      <div>Pour le client${r.signataireNom ? `<br><strong>${esc(r.signataireNom)}</strong>${r.signataireQualite ? `, ${esc(r.signataireQualite)}` : ''}` : ''}${r.signatureClientId ? `<img src="${x.img(r.signatureClientId)}" alt="Signature du client">` : '<br><span class="small">(non signé)</span>'}</div>
    </div>`;
  const choix = (val, options) => `<p class="pv-decision">${options.map(([v, lib]) => `${val === v ? '☒' : '☐'} ${lib}`).join('<br>')}</p>`;

  function epreuve(e, x) {
    const bar = v => (vide(v) ? '—' : `${nb(v)} bar`);
    return `<h3 class="doc-h">Réseau éprouvé</h3>${table([l('Réseau', `<strong>${esc(e.reseau)}</strong>`), l('Nature', esc(e.nature || '')), e.description ? l('Matériaux, diamètres, repérage', esc(e.description)) : ''])}
    <h3 class="doc-h">Conditions d'épreuve</h3>${table([l('Fluide d\'essai', esc(e.fluideEssai || 'Eau')), l('Pression de service', bar(e.pressionService)), l('Pression d\'épreuve', `<strong>${bar(e.pressionEpreuve)}</strong>`),
      l('Durée de maintien prévue', e.dureePrevue ? `${Number(e.dureePrevue)} min` : '—'), l('Chute de pression admissible', bar(e.chuteAdmissible || 0)),
      vide(e.temperature) ? '' : l('Température du fluide', `${nb(e.temperature, 1)} °C`), l('Manomètre', `${esc(e.manometre || '—')}${e.etalonnage ? ` · étalonnage valable jusqu'au ${dateFr(e.etalonnage)}` : ''}`)])}
    <h3 class="doc-h">Mesures</h3>${table([l('Date et heures', `${dateFr(e.date)}, de ${esc(e.heureDebut || '')} à ${esc(e.heureFin || '')}${e.dureeReelle ? ` (${e.dureeReelle} min)` : ''}`),
      l('Pression au début', bar(e.pressionDebut)), l('Pression à la fin', bar(e.pressionFin)), l('Chute constatée', bar(e.chute)), e.observations ? l('Observations', esc(e.observations)) : ''])}
    ${choix(e.resultat, [['Conforme', 'Épreuve <strong>conforme</strong> : aucune fuite, pression maintenue'], ['Non conforme', 'Épreuve <strong>non conforme</strong> : réseau à reprendre et à éprouver de nouveau']])}
    <p><strong>Attestation.</strong> Je soussigné ${esc(x.technicien)}, technicien de ${esc(x.societe)}, atteste avoir réalisé le ${dateFr(e.date)}, de ${esc(e.heureDebut || '')} à ${esc(e.heureFin || '')}, l'épreuve hydraulique du réseau « ${esc(e.reseau)} » du chantier ${esc(x.chantier.code || '')} sous une pression de ${bar(e.pressionEpreuve)} (${esc((e.fluideEssai || 'eau').toLowerCase())}), avec le résultat indiqué ci-dessus.</p>
    ${photos(e.photos, x)}${signatures(e, x)}`;
  }

  function miseEnService(m, x) {
    const type = (typeof Essais !== 'undefined' ? Essais : require('./essais')).TYPES[m.type] || {};
    return `<h3 class="doc-h">Équipement</h3>${table([l('Équipement', `<strong>${esc(m.equipement)}</strong>${m.repere ? ` · repère ${esc(m.repere)}` : ''}`), l('Type', esc(type.libelle || '')),
      l('Marque, modèle, n° de série', esc([m.marque, m.modele, m.numeroSerie && `n° ${m.numeroSerie}`].filter(Boolean).join(' · ') || '—')), m.localisation ? l('Localisation', esc(m.localisation)) : '',
      m.fluide ? l('Fluide frigorigène', esc(`${m.fluide}${vide(m.charge) ? '' : ` · charge ${nb(m.charge)} kg`}`)) : '', l('Date', `${dateFr(m.date)}${m.heure ? ` à ${esc(m.heure)}` : ''}`)])}
    ${m.photoPlaqueId ? `<div class="doc-photos"><figure><img src="${x.img(m.photoPlaqueId)}" alt="Plaque signalétique"><figcaption>Plaque signalétique</figcaption></figure></div>` : ''}
    <h3 class="doc-h">Points de contrôle</h3><table class="doc-lines compact"><tr><th>Contrôle</th><th>Résultat</th><th>Observation</th></tr>
      ${(m.controles || []).map(c => `<tr><td>${esc(c.libelle)}</td><td>${c.etat === 'Non conforme' ? `<strong>${esc(c.etat)}</strong>` : esc(c.etat || '—')}</td><td>${esc(c.obs || '')}</td></tr>`).join('')}</table>
    ${(m.mesures || []).some(v => !vide(v.valeur)) ? `<h3 class="doc-h">Mesures et relevés</h3><table class="doc-lines compact"><tr><th>Mesure</th><th class="num">Valeur</th></tr>
      ${m.mesures.filter(v => !vide(v.valeur)).map(v => `<tr><td>${esc(v.libelle)}</td><td class="num">${esc(String(v.valeur).replace('.', ','))} ${esc(v.unite || '')}</td></tr>`).join('')}</table>` : ''}
    ${m.reglages ? `<h3 class="doc-h">Réglages effectués</h3><p class="pre">${esc(m.reglages)}</p>` : ''}${m.observations ? `<h3 class="doc-h">Observations</h3><p class="pre">${esc(m.observations)}</p>` : ''}
    ${choix(m.resultat, [['Mis en service', 'Équipement <strong>mis en service</strong>, fonctionnement conforme'], ['Mis en service avec réserves', 'Équipement <strong>mis en service avec réserves</strong> (points non conformes ci-dessus)'], ['Non mis en service', 'Équipement <strong>non mis en service</strong>']])}
    <p><strong>Attestation.</strong> Je soussigné ${esc(x.technicien)}, technicien de ${esc(x.societe)}, atteste avoir procédé le ${dateFr(m.date)} à la mise en service de l'équipement « ${esc(m.equipement)} » du chantier ${esc(x.chantier.code || '')}, selon les contrôles et mesures ci-dessus.</p>
    ${photos(m.photos, x)}${signatures(m, x)}`;
  }

  function equilibrage(q, x) {
    const E = typeof Essais !== 'undefined' ? Essais : require('./essais'), s = E.synthese(q), u = esc(q.unite || 'm³/h');
    return `<h3 class="doc-h">Installation</h3>${table([l('Installation', `<strong>${esc(q.installation)}</strong>`), l('Type', esc(q.type || 'Aéraulique')), l('Date', dateFr(q.date)),
      l('Appareil de mesure', esc(q.appareil || '—')), l('Tolérance', `± ${nb(q.tolerance ?? 10, 0)} %`)])}
    <h3 class="doc-h">Relevé ${q.type === 'Hydraulique' ? 'des débits par organe' : 'des débits bouche par bouche'}</h3>
    <table class="doc-lines compact"><tr><th>Repère</th><th>Local</th><th>Type</th><th class="num">Théorique (${u})</th><th class="num">Mesuré (${u})</th><th class="num">Écart</th><th>Réglage</th><th>Conformité</th></tr>
      ${(q.lignes || []).map(r => { const e = E.ecart(r), c = E.conforme(r, q.tolerance); return `<tr><td>${esc(r.repere)}</td><td>${esc(r.local)}</td><td>${esc(r.type || '')}</td><td class="num">${nb(r.theorique, 0)}</td><td class="num">${nb(r.mesure, 0)}</td>
        <td class="num">${e === null ? '—' : `${e > 0 ? '+' : ''}${nb(e, 1)} %`}</td><td>${esc(r.reglage || '')}</td><td>${c === null ? '—' : c ? 'conforme' : '<strong>hors tolérance</strong>'}</td></tr>`; }).join('')}
      <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${nb(s.totalTheorique, 0)}</strong></td><td class="num"><strong>${nb(s.totalMesure, 0)}</strong></td><td class="num">${s.ecartGlobal === null ? '' : `${s.ecartGlobal > 0 ? '+' : ''}${nb(s.ecartGlobal, 1)} %`}</td><td colspan="2"></td></tr></table>
    <p>${s.mesurees} point(s) mesuré(s) sur ${s.nb} · ${s.conformes} dans la tolérance · ${s.horsTolerance} hors tolérance.</p>
    ${q.observations ? `<h3 class="doc-h">Observations</h3><p class="pre">${esc(q.observations)}</p>` : ''}
    ${choix(q.resultat, [['Conforme', 'Équilibrage <strong>conforme</strong> : tous les débits dans la tolérance'], ['Non conforme', 'Équilibrage <strong>non conforme</strong> : débits hors tolérance à reprendre']])}
    <p><strong>Attestation.</strong> Je soussigné ${esc(x.technicien)}, technicien de ${esc(x.societe)}, atteste avoir réalisé le ${dateFr(q.date)} l'équilibrage ${esc((q.type || 'aéraulique').toLowerCase())} de l'installation « ${esc(q.installation)} » du chantier ${esc(x.chantier.code || '')} et relevé les débits ci-dessus.</p>
    ${photos(q.photos, x)}${signatures(q, x)}`;
  }
  return { epreuve, miseEnService, equilibrage };
})();
if (typeof module !== 'undefined') module.exports = EssaisDoc;
