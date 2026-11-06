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

  // Fiche de relevés de fonctionnement (CTA, extracteur, pompes) : format de l'entreprise — en-tête, caractéristiques de la
  // plaque et mesures par côté (soufflage / extraction, pompe 1 / pompe 2), équipements, réglages, autocontrôle des
  // sécurités (C / NC / SO), équilibrage (antenne, section, réglage, prévu, mesuré), fin d'antenne, observations
  const ESSAI = () => (typeof Essais !== 'undefined' ? Essais : require('./essais'));
  const CNS = { OK: 'C', 'Non conforme': 'NC', 'Sans objet': 'SO' };
  const sectionsFiche = m => { const E = ESSAI(); return [...new Set([...(m.plaque || []).map(p => p.section || ''), ...(m.mesures || []).filter(v => !E.releve(v)).map(v => v.section || '')])].sort((a, b) => (a === '') - (b === '')); };
  const valeurFiche = v => (vide(v) ? '/' : esc(String(v).replace('.', ',')));
  function ficheReleves(m, x) {
    const E = ESSAI(), f = E.TYPES[m.type].fiche, prevu = E.debitPrevu(m), rl = (m.mesures || []).filter(v => E.releve(v));
    const ec = v => { const a = Number(v.attendu), y = Number(String(v.valeur).replace(',', '.')); return vide(v.attendu) || !a || vide(v.valeur) || !Number.isFinite(y) ? '' : `${y >= a ? '+' : ''}${((y - a) / a * 100).toFixed(1).replace('.', ',')} %`; };
    const plaqueCommune = (m.plaque || []).filter(p => !p.section), secs = sectionsFiche(m).filter(s => s);
    const bloc = (sec, avecPlaque = true) => { const pl = avecPlaque ? (m.plaque || []).filter(p => (p.section || '') === sec) : [], me = (m.mesures || []).filter(v => !E.releve(v) && (v.section || '') === sec), att = me.some(v => !vide(v.attendu));
      return `${pl.length ? `<h4>Caractéristiques</h4>${table(pl.map(p => l(p.libelle, valeurFiche(p.valeur))))}` : ''}
        ${me.length ? `<h4>${sec ? 'Mesures électriques et aérauliques' : 'Autres relevés'}</h4><table class="doc-lines compact"><tr><th>Mesure</th><th class="num">Valeur</th>${att ? '<th class="num">Prévu (étude)</th><th class="num">Écart</th>' : ''}</tr>
          ${me.map(v => `<tr><td>${esc(v.libelle)}${v.auto ? ' <span class="small">(facteur K)</span>' : ''}</td><td class="num">${valeurFiche(v.valeur)}${vide(v.valeur) ? '' : ` ${esc(v.unite || '')}`}</td>${att ? `<td class="num">${vide(v.attendu) ? '' : `${nb(v.attendu, v.attendu % 1 ? 2 : 0)} ${esc(v.unite || '')}`}</td><td class="num">${ec(v)}</td>` : ''}</tr>`).join('')}</table>` : ''}`; };
    return `<h2 class="doc-h" style="text-align:center">FICHE DE RELEVÉS DE FONCTIONNEMENT<br><span style="font-size:.85em">${esc(f.titre.toUpperCase())}</span></h2>
    ${table([l('Chantier', esc([x.chantier.code, x.chantier.nom].filter(Boolean).join(' – ') || '—')), l('Date', `${dateFr(m.date)}${m.heure ? ` à ${esc(m.heure)}` : ''}`), l('Localisation', esc([m.localisation, m.zone].filter(Boolean).join(' — ') || '—')),
      l('Désignation', `<strong>${esc(m.equipement)}</strong>${m.repere ? ` · repère ${esc(m.repere)}` : ''}`), l('Marque', esc(m.marque || '—')), l('Références', esc([m.modele, m.numeroSerie && `n° ${m.numeroSerie}`].filter(Boolean).join(' · ') || '—')),
      prevu !== null ? l('Débit prévu', `${nb(prevu, 0)} m³/h`) : ''])}
    ${m.photoPlaqueId ? `<div class="doc-photos"><figure><img src="${x.img(m.photoPlaqueId)}" alt="Plaque signalétique"><figcaption>Plaque signalétique</figcaption></figure></div>` : ''}
    ${plaqueCommune.length ? `<h3 class="doc-h">${m.type === 'pompes' ? 'CARACTÉRISTIQUES ÉLECTRIQUES' : 'CARACTÉRISTIQUES'}</h3>${table(plaqueCommune.map(p => l(p.libelle, valeurFiche(p.valeur))))}` : ''}
    ${secs.map(sec => `<h3 class="doc-h">${esc(sec.toUpperCase())}</h3>${bloc(sec)}`).join('')}
    ${(m.mesures || []).some(v => !E.releve(v) && !v.section) ? `<h3 class="doc-h">${secs.length ? 'AUTRES RELEVÉS' : 'MESURES ÉLECTRIQUES ET AÉRAULIQUES'}</h3>${bloc('', false)}` : ''}
    ${m.composants ? `<h3 class="doc-h">ÉQUIPEMENTS</h3><p class="pre">${esc(m.composants)}</p>` : ''}
    ${m.reglages ? `<h3 class="doc-h">RÉGLAGES</h3><p class="pre">${esc(m.reglages)}</p>` : ''}
    <h3 class="doc-h">AUTOCONTRÔLE — TESTS DES ÉQUIPEMENTS ET DES SÉCURITÉS</h3><p class="small">C = conforme · NC = non conforme · SO = sans objet</p>
    <table class="doc-lines compact"><tr><th>Contrôle</th><th>Résultat</th><th>Observation</th></tr>${(m.controles || []).map(c => `<tr><td>${esc(c.libelle)}</td><td>${c.etat === 'Non conforme' ? '<strong>NC</strong>' : esc(CNS[c.etat] || '—')}</td><td>${esc(c.obs || '')}</td></tr>`).join('')}</table>
    ${rl.length ? `<h3 class="doc-h">ÉQUILIBRAGE ${/eau/.test(E.releve(rl[0]).grandeur) || m.type === 'pompes' ? 'HYDRAULIQUE' : 'AÉRAULIQUE'}</h3><table class="doc-lines compact"><tr><th>Antenne / local / ${/eau/.test(E.releve(rl[0]).grandeur) ? 'unité' : 'diffuseur'}</th><th>Section / Ø</th><th>Réglage</th><th class="num">Débit prévu</th><th class="num">Débit mesuré</th><th class="num">Écart</th></tr>
      ${rl.map(v => { const r = E.releve(v); return `<tr><td><strong>${esc(r.repere)}</strong>${r.piece ? ` — ${esc(r.piece)}` : ''}<br><span class="small">${esc(r.detail)}</span></td><td>${esc(v.dim || '')}</td><td>${esc(v.reglage || '')}</td><td class="num">${vide(v.attendu) ? '' : `${nb(v.attendu, 0)} ${esc(v.unite || '')}`}</td><td class="num">${vide(v.valeur) ? '<em>non mesuré</em>' : `${esc(String(v.valeur).replace('.', ','))} ${esc(v.unite || '')}`}</td><td class="num">${ec(v)}</td></tr>`; }).join('')}</table>` : ''}
    ${m.observations ? `<h3 class="doc-h">OBSERVATIONS / REMARQUES</h3><p class="pre">${esc(m.observations)}</p>` : ''}
    ${choix(m.resultat, [['Mis en service', 'Équipement <strong>mis en service</strong>, fonctionnement conforme'], ['Mis en service avec réserves', 'Équipement <strong>mis en service avec réserves</strong> (points non conformes ci-dessus)'], ['Non mis en service', 'Équipement <strong>non mis en service</strong>']])}
    <p><strong>Attestation.</strong> Je soussigné ${esc(x.technicien)}, technicien de ${esc(x.societe)}, atteste avoir procédé le ${dateFr(m.date)} aux relevés de fonctionnement de l'équipement « ${esc(m.equipement)} » du chantier ${esc(x.chantier.code || '')}.</p>
    ${photos(m.photos, x)}${signatures(m, x)}`;
  }
  // Même fiche en classeur Excel (une feuille « Rév.0 », comme le modèle de l'entreprise)
  function ficheExcel(m, x = {}) {
    const E = ESSAI(), f = (E.TYPES[m.type] || {}).fiche || { titre: (E.TYPES[m.type] || {}).libelle || 'Équipement' }, prevu = E.debitPrevu(m), rl = (m.mesures || []).filter(v => E.releve(v));
    const v = y => { const s = String(y ?? '').trim(); if (!s) return '/'; const n = Number(s.replace(',', '.')); return /^-?\d+([.,]\d+)?$/.test(s) && Number.isFinite(n) ? n : s; };
    const B = t => ({ v: t, s: 'bold' }), H = t => ({ v: t, s: 'head' });
    const rows = [[{ v: 'FICHE DE RELEVÉS DE FONCTIONNEMENT', s: 'title' }], [B(f.titre.toUpperCase())], [],
      [B('CHANTIER :'), x.chantier || '', '', B('DATE :'), dateFr(m.date)], [B('LOCALISATION :'), [m.localisation, m.zone].filter(Boolean).join(' — '), '', B('DÉSIGNATION :'), m.equipement || ''],
      [B('MARQUE :'), m.marque || '', '', B('RÉFÉRENCES :'), m.modele || ''], ...(prevu !== null ? [[B('DÉBIT PRÉVU :'), prevu, 'm³/h']] : []), []];
    const pl = sec => (m.plaque || []).filter(p => (p.section || '') === sec), me = sec => (m.mesures || []).filter(y => !E.releve(y) && (y.section || '') === sec);
    if (pl('').length) rows.push([H(m.type === 'pompes' ? 'CARACTÉRISTIQUES ÉLECTRIQUES' : 'CARACTÉRISTIQUES')], ...pl('').map(p => [p.libelle, v(p.valeur)]), []);
    sectionsFiche(m).forEach(sec => {
      if (sec) rows.push([H(sec.toUpperCase())], ...(pl(sec).length && sec ? [[B('CARACTÉRISTIQUES')], ...pl(sec).map(p => [p.libelle, v(p.valeur)])] : []));
      if (me(sec).length) rows.push([B(sec ? 'MESURES ÉLECTRIQUES ET AÉRAULIQUES' : 'AUTRES RELEVÉS'), 'Valeur', 'Unité', 'Prévu (étude)'], ...me(sec).map(y => [y.libelle, v(y.valeur), y.unite || '', vide(y.attendu) ? '' : y.attendu]), []);
    });
    if (m.composants) rows.push([H('ÉQUIPEMENTS')], ...String(m.composants).split(/\n+/).map(t => [t]), []);
    if (m.reglages) rows.push([H('RÉGLAGES')], ...String(m.reglages).split(/\n+/).map(t => [t]), []);
    rows.push([H('AUTOCONTRÔLE // TESTS DES ÉQUIPEMENTS DE SÉCURITÉ')], ['NC = Non conforme', 'C = Conforme', 'SO = Sans objet'], ...(m.controles || []).map(c => [c.libelle, CNS[c.etat] || '', c.obs || '']), []);
    if (rl.length) rows.push([H(`ÉQUILIBRAGE ${m.type === 'pompes' ? 'HYDRAULIQUE' : 'AÉRAULIQUE'}`)], [B('ANTENNE / LOCAL / DIFFUSEUR'), B('SECTION / DIAMÈTRE'), B('RÉGLAGE'), B('DÉBIT PRÉVU'), B('DÉBIT MESURÉ')],
      ...rl.map(y => { const r = E.releve(y); return [`${r.repere}${r.piece ? ` — ${r.piece}` : ''} (${r.detail})`, y.dim || '', y.reglage || '/', vide(y.attendu) ? '' : y.attendu, v(y.valeur)]; }), []);
    rows.push([H('OBSERVATIONS / REMARQUES')], [m.observations || ''], [], [B('CONCLUSION :'), m.resultat || ''], [B('TECHNICIEN :'), x.technicien || m.technicien || '']);
    return { name: 'Rév.0', cols: [46, 22, 14, 18, 22], rows };
  }
  function miseEnService(m, x) {
    const E = typeof Essais !== 'undefined' ? Essais : require('./essais'), type = E.TYPES[m.type] || {};
    if (type.fiche && (m.plaque || []).length) return ficheReleves(m, x);
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
  return { epreuve, miseEnService, ficheReleves, ficheExcel, equilibrage };
})();
if (typeof module !== 'undefined') module.exports = EssaisDoc;
