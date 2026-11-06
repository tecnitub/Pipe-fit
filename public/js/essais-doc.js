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
      ${r.integrateur || r.signatureIntegrateurId ? `<div>Pour l'intégrateur GTB${r.integrateur ? `<br><strong>${esc(r.integrateur)}</strong>` : ''}${r.signatureIntegrateurId ? `<img src="${x.img(r.signatureIntegrateurId)}" alt="Signature de l'intégrateur">` : '<br><span class="small">(non signé)</span>'}</div>` : ''}
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
    const E = typeof Essais !== 'undefined' ? Essais : require('./essais'), type = E.TYPES[m.type] || {};
    return `<h3 class="doc-h">Équipement</h3>${table([l('Équipement', `<strong>${esc(m.equipement)}</strong>${m.repere ? ` · repère ${esc(m.repere)}` : ''}`), l('Type', esc(type.libelle || '')),
      l('Marque, modèle, n° de série', esc([m.marque, m.modele, m.numeroSerie && `n° ${m.numeroSerie}`].filter(Boolean).join(' · ') || '—')), m.localisation || m.zone ? l('Localisation', esc([m.localisation, m.zone].filter(Boolean).join(' — '))) : '',
      m.fluide ? l('Fluide frigorigène', esc(`${m.fluide}${vide(m.charge) ? '' : ` · charge ${nb(m.charge)} kg`}`)) : '', l('Date', `${dateFr(m.date)}${m.heure ? ` à ${esc(m.heure)}` : ''}`)])}
    ${m.photoPlaqueId ? `<div class="doc-photos"><figure><img src="${x.img(m.photoPlaqueId)}" alt="Plaque signalétique"><figcaption>Plaque signalétique</figcaption></figure></div>` : ''}
    ${m.integrateur || m.automaticien ? table([m.integrateur ? l('Intégrateur GTB', esc(m.integrateur)) : '', m.automaticien ? l('Automaticien / tableautier', esc(m.automaticien)) : '']) : ''}
    ${(m.controles || []).some(c => c.pap) ? (() => { const av = E.avancementPap ? E.avancementPap(m) : { nb: 0, faits: 0, nc: 0 }, et = v => (v === 'Non conforme' ? `<strong>${esc(v)}</strong>` : esc(v || '—'));
      return `<h3 class="doc-h">Essais point à point — ${av.faits}/${av.nb} point(s) testé(s)${av.nc ? `, ${av.nc} non conforme(s)` : ''}</h3><table class="doc-lines compact"><tr><th>Point</th><th>Automate</th><th>GTB</th><th>Observation</th></tr>
      ${m.controles.filter(c => c.pap).map(c => `<tr><td>${esc(c.libelle)}</td><td>${et(c.etat)}</td><td>${et(c.etatGtb)}</td><td>${esc(c.obs || '')}</td></tr>`).join('')}</table>`; })() : ''}
    ${(E.reserves ? E.reserves(m) : []).length ? `<h3 class="doc-h">Réserves</h3><ol>${E.reserves(m).map(x => `<li>${esc(x.libelle)} — non conforme côté ${esc(x.cote)}${x.obs ? ` : ${esc(x.obs)}` : ''}</li>`).join('')}</ol>` : ''}
    ${(m.controles || []).some(c => !c.pap) ? `<h3 class="doc-h">Points de contrôle</h3><table class="doc-lines compact"><tr><th>Contrôle</th><th>Résultat</th><th>Observation</th></tr>
      ${(m.controles || []).filter(c => !c.pap).map(c => `<tr><td>${esc(c.libelle)}</td><td>${c.etat === 'Non conforme' ? `<strong>${esc(c.etat)}</strong>` : esc(c.etat || '—')}</td><td>${esc(c.obs || '')}</td></tr>`).join('')}</table>` : ''}
    ${(m.mesures || []).some(v => !vide(v.valeur) && !E.releve(v)) ? (() => { const att = m.mesures.some(v => !vide(v.valeur) && !vide(v.attendu) && !E.releve(v));
      const ec = v => { const a = Number(v.attendu), x = Number(String(v.valeur).replace(',', '.')); if (vide(v.attendu) || !a || !Number.isFinite(x)) return ''; const t = E.tolerance(v.libelle, v.unite);
        return t.abs !== undefined ? `${x >= a ? '+' : ''}${(x - a).toFixed(1).replace('.', ',')} ${/°C/.test(v.unite || '') ? 'K' : esc(v.unite || '')}` : `${x >= a ? '+' : ''}${((x - a) / a * 100).toFixed(1).replace('.', ',')} %`; };
      return `<h3 class="doc-h">Mesures et relevés</h3><table class="doc-lines compact"><tr><th>Mesure</th><th class="num">Valeur</th>${att ? '<th class="num">Attendu (étude)</th><th class="num">Écart</th><th>Tolérance</th><th>Conformité</th>' : ''}</tr>
      ${m.mesures.filter(v => !vide(v.valeur) && !E.releve(v)).map(v => `<tr><td>${esc(v.libelle)}</td><td class="num">${esc(String(v.valeur).replace('.', ','))} ${esc(v.unite || '')}</td>${att ? `<td class="num">${vide(v.attendu) ? '' : `${nb(v.attendu)} ${esc(v.unite || '')}`}</td><td class="num">${ec(v)}</td><td>${vide(v.attendu) ? '' : esc(E.tolerance(v.libelle, v.unite).texte)}</td><td>${(c => (c === null ? '' : c ? 'conforme' : '<strong>hors tolérance</strong>'))(E.conformeMesure(v))}</td>` : ''}</tr>`).join('')}</table>`; })() : ''}
    ${(m.mesures || []).some(v => E.releve(v)) ? (() => { const rl = m.mesures.filter(v => E.releve(v));
      const ec = v => { const a = Number(v.attendu), x = Number(String(v.valeur).replace(',', '.')); return vide(v.attendu) || !a || vide(v.valeur) || !Number.isFinite(x) ? '' : `${x >= a ? '+' : ''}${((x - a) / a * 100).toFixed(1).replace('.', ',')} %`; };
      return `<h3 class="doc-h">Relevé ligne par ligne (${rl.length})</h3><table class="doc-lines compact"><tr><th>Repère</th><th>Pièce</th><th>Réseau, branche</th><th class="num">Attendu</th><th class="num">Mesuré</th><th>Réglage</th><th class="num">Écart</th><th>Conformité</th></tr>
      ${rl.map(v => { const r = E.releve(v), c = E.conformeMesure(v); return `<tr><td><strong>${esc(r.repere)}</strong></td><td>${esc(r.piece)}</td><td>${esc(r.detail)}</td><td class="num">${vide(v.attendu) ? '' : `${nb(v.attendu)} ${esc(v.unite || '')}`}</td><td class="num">${vide(v.valeur) ? '<em>non mesuré</em>' : `${esc(String(v.valeur).replace('.', ','))} ${esc(v.unite || '')}`}</td><td>${esc(v.reglage || '')}</td><td class="num">${ec(v)}</td><td>${c === null ? '' : c ? 'conforme' : '<strong>hors tolérance</strong>'}</td></tr>`; }).join('')}</table>`; })() : ''}
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
