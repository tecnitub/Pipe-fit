// RH → Intérim : intérimaires présents, entrées et sorties (missions), alertes, registre du personnel intérimaire
// (export Excel et PDF A4).
const interimFiltre = { annee: '', agence: '' };
const agences = () => Store.all('entreprises').filter(e => /intérim|interim|travail temporaire/i.test(`${e.secteur || ''} ${e.nom || ''}`) || Store.all('users').some(u => u.agenceId === e.id) || Store.all('missions').some(m => m.agenceId === e.id));
const adresseAgence = id => { const e = entreprise(id) || {}, s = billingSite(id); return [e.nom, s && `${s.adresse}, ${s.cp} ${s.ville}`].filter(Boolean).join(' – '); };
const heuresMission = (m, auj) => sumBy(Store.all('temps').filter(t => t.userId === m.userId && t.date >= m.dateEntree && t.date <= (m.dateSortie || auj)), t => num(t.heures));
const peutInterim = () => ['admin', 'charge'].includes(Store.me.role);

function rhInterim() {
  const auj = isoDate(new Date()), mois = auj.slice(0, 7), f = interimFiltre;
  const toutes = Store.all('missions'), presents = toutes.filter(m => Interim.present(m, auj) && !(m.dateSortie && m.dateSortie <= auj)).sort((a, b) => a.nom.localeCompare(b.nom));
  const reg = Interim.registre(toutes).filter(m => (!f.annee || m.dateEntree.startsWith(f.annee) || (m.dateSortie || auj).startsWith(f.annee)) && (!f.agence || m.agenceId === f.agence));
  const alertes = toutes.filter(m => Interim.present(m, auj) || (m.finPrevue && !m.dateSortie)).flatMap(m => Interim.alertes(m, auj).map(a => ({ ...a, m })));
  const annees = [...new Set(toutes.flatMap(m => [m.dateEntree, m.dateSortie].filter(Boolean).map(d => d.slice(0, 4))))].sort().reverse();
  const heuresMois = sumBy(Store.all('temps').filter(t => (Store.get('users', t.userId) || {}).type === 'interimaire' && t.date.startsWith(mois)), t => num(t.heures));
  return `<h1>RH</h1>${rhTabs('interim')}
  <div class="cards">
    <div class="card"><div class="label">Intérimaires présents</div><div class="value">${presents.length}</div><div class="sub">aujourd'hui</div></div>
    <div class="card"><div class="label">Entrées / sorties ce mois</div><div class="value">${toutes.filter(m => (m.dateEntree || '').startsWith(mois)).length} / ${toutes.filter(m => (m.dateSortie || '').startsWith(mois)).length}</div><div class="sub">${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</div></div>
    <div class="card"><div class="label">Heures d'intérim ce mois</div><div class="value">${fmt(heuresMois, 1)} h</div><div class="sub">pointées</div></div>
    <div class="card"><div class="label">Points à régler</div><div class="value ${alertes.some(a => a.niveau === 'bad') ? 'neg' : alertes.length ? 'warn-text' : ''}">${alertes.length}</div><div class="sub">dossiers, fins de mission, titres</div></div>
  </div>
  ${alertes.length ? `<div class="card"><strong>À régler</strong><ul class="alertes-hab">${alertes.map(a => `<li><button class="linklike" data-mission="${a.m.id}">${esc(a.m.nom)}</button> <span class="badge ${a.niveau === 'bad' ? 'b-bad' : 'b-warn'}">${esc(a.texte)}</span></li>`).join('')}</ul></div>` : ''}
  <div class="toolbar">${peutInterim() ? '<button id="mi-add">+ Entrée d\'un intérimaire</button>' : ''}</div>
  <h2>Présents aujourd'hui</h2>
  ${presents.length ? `<div class="table-wrap"><table><tr><th>Intérimaire</th><th>Qualification</th><th>Agence</th><th>Entrée</th><th>Fin prévue</th><th>Chantier(s)</th><th class="num">Heures</th><th></th></tr>
    ${presents.map(m => `<tr><td><button class="linklike" data-mission="${m.id}"><strong>${esc(m.nom)}</strong></button></td><td>${esc(m.qualification || '')}</td><td>${esc(clientName(m.agenceId))}</td><td>${dateFr(m.dateEntree)}</td>
      <td>${m.finPrevue ? `<span class="${m.finPrevue < auj ? 'neg' : ''}">${dateFr(m.finPrevue)}</span>` : '—'}</td><td>${(m.affaireIds || []).map(id => esc(affaireOf(id).code || '')).join(', ')}</td><td class="num">${fmt(heuresMission(m, auj), 1)} h</td>
      <td class="actions">${peutInterim() ? `<button class="small secondary" data-prolonger="${m.id}">Prolonger</button><button class="small" data-sortie="${m.id}">Sortie</button>` : ''}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun intérimaire présent.</p>'}
  <h2>Registre du personnel intérimaire</h2>
  <p class="muted small">Salariés temporaires inscrits dans l'ordre des entrées, avec la mention « salarié temporaire », le nom et l'adresse de l'entreprise de travail temporaire (art. L1221-13 et D1221-23 du Code du travail).</p>
  <div class="toolbar"><select id="mi-annee" style="width:auto" aria-label="Année"><option value="">Toutes les années</option>${optionsStr(annees, f.annee)}</select>
    <select id="mi-agence" style="width:auto" aria-label="Agence">${options(agences(), f.agence, undefined, true).replace('<option value="">—</option>', '<option value="">Toutes les agences</option>')}</select>
    <span class="spacer"></span><button class="secondary" id="mi-xlsx">Exporter (Excel)</button><button class="secondary" id="mi-pdf">PDF A4</button></div>
  ${reg.length ? `<div class="table-wrap"><table class="registre"><tr><th>N°</th><th>Nom et prénom</th><th>Nationalité</th><th>Né(e) le</th><th>Sexe</th><th>Emploi, qualification</th><th>Entrée</th><th>Sortie</th><th>Entreprise de travail temporaire</th><th>Contrat de mise à disposition</th><th>Motif</th><th>Titre de travail</th></tr>
    ${reg.map(m => `<tr class="clickable ${Interim.manquants(m).length ? 'incomplet' : ''}" data-mission="${m.id}"><td>${m.ordre}</td><td><strong>${esc(m.nom)}</strong><br><span class="small muted">salarié temporaire</span></td><td>${esc(m.nationalite || '')}</td><td>${dateFr(m.dateNaissance)}</td><td>${esc(m.sexe || '')}</td>
      <td>${esc(m.qualification || '')}</td><td>${dateFr(m.dateEntree)}</td><td>${m.dateSortie ? dateFr(m.dateSortie) : '<span class="badge b-info">présent</span>'}</td><td class="small">${esc(adresseAgence(m.agenceId))}</td>
      <td>${esc(m.numeroContrat || '')}</td><td class="small">${esc(Interim.libelleMotif(m.motif))}${m.motifDetail ? `<br><span class="muted">${esc(m.motifDetail)}</span>` : ''}</td>
      <td class="small">${Interim.titreRequis(m.nationalite) ? `${esc(m.titreType || '⚠ à saisir')} ${esc(m.titreNumero || '')}${m.titreExpire ? `<br>jusqu'au ${dateFr(m.titreExpire)}` : ''}` : '<span class="muted">non requis</span>'}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucune mission enregistrée.</p>'}`;
}

// Document A4 du registre (PDF)
function registreDocument(reg) {
  const s = Store.data.settings;
  return `${Doc.entete('facture', 'Registre du personnel intérimaire', `Édité le ${dateFr(isoDate(new Date()))}`)}
    <p class="doc-conditions">${esc(s.societe || '')} · ${esc(s.adresse || '')}${s.siret ? ` · SIRET ${esc(s.siret)}` : ''}</p>
    <table class="doc-lines compact registre-doc"><tr><th>N°</th><th>Nom et prénom</th><th>Nationalité · naissance · sexe</th><th>Emploi, qualification</th><th>Entrée · sortie</th><th>Entreprise de travail temporaire</th><th>Contrat · motif</th><th>Titre de travail</th></tr>
      ${reg.map(m => `<tr><td>${m.ordre}</td><td>${esc(m.nom)}<br><em>salarié temporaire</em></td><td>${esc(m.nationalite || '')}<br>${dateFr(m.dateNaissance)} · ${esc(m.sexe || '')}</td><td>${esc(m.qualification || '')}</td>
        <td>${dateFr(m.dateEntree)}<br>${m.dateSortie ? dateFr(m.dateSortie) : 'présent'}</td><td>${esc(adresseAgence(m.agenceId))}</td><td>${esc(m.numeroContrat || '')}<br>${esc(Interim.libelleMotif(m.motif))}</td>
        <td>${Interim.titreRequis(m.nationalite) ? `${esc(m.titreType || '')} ${esc(m.titreNumero || '')}${m.titreExpire ? `<br>jusqu'au ${dateFr(m.titreExpire)}` : ''}` : 'non requis'}</td></tr>`).join('')}</table>
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}
function registreExcel(reg) {
  const H = v => ({ v, s: 'head' });
  const rows = [[{ v: `Registre du personnel intérimaire – ${Store.data.settings.societe || ''}`, s: 'title' }], [`Édité le ${dateFr(isoDate(new Date()))}`], [],
    ['N°', 'Nom et prénom', 'Mention', 'Nationalité', 'Date de naissance', 'Sexe', 'Emploi, qualification', 'Date d\'entrée', 'Date de sortie', 'Entreprise de travail temporaire (nom et adresse)', 'N° contrat de mise à disposition', 'Motif de recours', 'Précision', 'Titre de travail (type)', 'Titre (n°)', 'Titre valable jusqu\'au', 'Chantier(s)', 'Heures pointées'].map(H),
    ...reg.map(m => [m.ordre, m.nom, 'Salarié temporaire', m.nationalite || '', dateFr(m.dateNaissance), m.sexe || '', m.qualification || '', dateFr(m.dateEntree), dateFr(m.dateSortie), adresseAgence(m.agenceId), m.numeroContrat || '',
      Interim.libelleMotif(m.motif), m.motifDetail || '', m.titreType || '', m.titreNumero || '', dateFr(m.titreExpire), (m.affaireIds || []).map(id => affaireOf(id).code || '').join(', '), { v: heuresMission(m, isoDate(new Date())), s: 'num' }])];
  return XLSX.build([{ name: 'Registre intérim', cols: [6, 24, 18, 14, 12, 6, 24, 12, 12, 48, 20, 34, 30, 18, 16, 14, 18, 10], freeze: 4, rows }]);
}

// Entrée (nouvelle mission) ou modification d'une mission
function editerMission(id) {
  const auj = isoDate(new Date()), ancien = id ? Store.get('missions', id) : null;
  const m = ancien ? { ...ancien } : { dateEntree: auj, motif: 'accroissement', affaireIds: [], sexe: '', agenceId: '' };
  const interims = Store.all('users').filter(u => u.type === 'interimaire' && !u.archive);
  const box = Modal.open(`<h2 style="margin-top:0">${ancien ? `Mission de ${esc(m.nom)}` : 'Entrée d\'un intérimaire'}</h2>
    ${ancien ? '' : `<div class="field"><label for="mi-u">Intérimaire</label><select id="mi-u"><option value="">— Nouvel intérimaire —</option>${interims.map(u => `<option value="${u.id}">${esc(u.nom)}</option>`).join('')}</select></div>`}
    <div class="grid2">
      <div class="field"><label for="mi-nom">Nom et prénom *</label><input id="mi-nom" value="${esc(m.nom || '')}"></div>
      <div class="field"><label for="mi-nat">Nationalité *</label><input id="mi-nat" value="${esc(m.nationalite || '')}" list="mi-nats" placeholder="Ex. Française"><datalist id="mi-nats">${['Française', 'Portugaise', 'Espagnole', 'Italienne', 'Polonaise', 'Roumaine', 'Marocaine', 'Algérienne', 'Tunisienne', 'Turque'].map(n => `<option value="${n}">`).join('')}</datalist></div>
      <div class="field"><label for="mi-naiss">Date de naissance *</label><input id="mi-naiss" type="date" value="${esc(m.dateNaissance || '')}"></div>
      <div class="field"><label for="mi-sexe">Sexe *</label><select id="mi-sexe">${['', 'M', 'F'].map(x => `<option value="${x}" ${m.sexe === x ? 'selected' : ''}>${x === 'M' ? 'Homme' : x === 'F' ? 'Femme' : '—'}</option>`).join('')}</select></div>
      <div class="field"><label for="mi-qual">Emploi et qualification *</label><input id="mi-qual" value="${esc(m.qualification || '')}" placeholder="Ex. Tuyauteur N2P2, soudeur TIG"></div>
      <div class="field"><label for="mi-ag">Entreprise de travail temporaire *</label><select id="mi-ag">${options(agences(), m.agenceId)}</select></div>
      <div class="field"><label for="mi-ctr">N° du contrat de mise à disposition *</label><input id="mi-ctr" value="${esc(m.numeroContrat || '')}"></div>
      <div class="field"><label for="mi-motif">Motif de recours *</label><select id="mi-motif">${Interim.MOTIFS.map(([k, l]) => `<option value="${k}" ${m.motif === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:1/-1"><label for="mi-md">Précision du motif</label><input id="mi-md" value="${esc(m.motifDetail || '')}" placeholder="Ex. remplacement de M. X (arrêt maladie), surcroît chantier NEP"></div>
      <div class="field"><label for="mi-ent">Date d'entrée *</label><input id="mi-ent" type="date" value="${esc(m.dateEntree || '')}"></div>
      <div class="field"><label for="mi-fin">Fin de mission prévue</label><input id="mi-fin" type="date" value="${esc(m.finPrevue || '')}"></div>
      ${ancien && ancien.dateSortie ? `<div class="field"><label for="mi-sort">Date de sortie</label><input id="mi-sort" type="date" value="${esc(m.dateSortie)}"></div>` : ''}
      <div class="field"><label for="mi-aff">Chantier</label><select id="mi-aff">${options(chantiersActifs(), (m.affaireIds || [])[0], affaireLabel)}</select></div>
    </div>
    <fieldset id="mi-titre" class="mi-titre"><legend>Titre autorisant à travailler (hors UE, EEE, Suisse)</legend><div class="grid2">
      <div class="field"><label for="mi-tt">Type</label><input id="mi-tt" value="${esc(m.titreType || '')}" placeholder="Ex. carte de séjour salarié" list="mi-tts"><datalist id="mi-tts">${['Carte de séjour temporaire « salarié »', 'Carte de résident', 'Carte de séjour pluriannuelle', 'Autorisation de travail'].map(n => `<option value="${n}">`).join('')}</datalist></div>
      <div class="field"><label for="mi-tn">N°</label><input id="mi-tn" value="${esc(m.titreNumero || '')}"></div>
      <div class="field"><label for="mi-te">Valable jusqu'au</label><input id="mi-te" type="date" value="${esc(m.titreExpire || '')}"></div></div></fieldset>
    <p class="muted small">* Mentions obligatoires du registre du personnel.</p>
    <div class="modal-actions">${ancien && peutInterim() ? '<button class="danger" id="mi-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="mi-x">Fermer</button>${peutInterim() ? `<button id="mi-ok">${ancien ? 'Enregistrer' : 'Enregistrer l\'entrée'}</button>` : ''}</div>`, true);
  const $ = s => box.querySelector(s);
  const majTitre = () => { $('#mi-titre').hidden = !Interim.titreRequis($('#mi-nat').value); };
  $('#mi-nat').oninput = majTitre; majTitre();
  // Intérimaire déjà venu : reprise de sa dernière mission
  if ($('#mi-u')) $('#mi-u').onchange = () => {
    const uid = $('#mi-u').value, u = Store.get('users', uid) || {};
    const prec = Store.all('missions').filter(x => x.userId === uid).sort((a, b) => b.dateEntree.localeCompare(a.dateEntree))[0] || {};
    const val = { '#mi-nom': u.nom || '', '#mi-nat': prec.nationalite || '', '#mi-naiss': prec.dateNaissance || '', '#mi-sexe': prec.sexe || '', '#mi-qual': prec.qualification || '', '#mi-ag': prec.agenceId || u.agenceId || '',
      '#mi-tt': prec.titreType || '', '#mi-tn': prec.titreNumero || '', '#mi-te': prec.titreExpire || '' };
    Object.entries(val).forEach(([k, v]) => { $(k).value = v; }); majTitre();
  };
  $('#mi-x').onclick = Modal.close;
  if (!peutInterim()) return;
  if ($('#mi-del')) $('#mi-del').onclick = async () => { if (await ask('Supprimer cette mission du registre ? (à réserver aux erreurs de saisie)', 'Supprimer')) { Store.remove('missions', ancien.id); Modal.close(); App.render(); } };
  $('#mi-ok').onclick = () => {
    const v = k => $(k) ? $(k).value.trim() : '';
    Object.assign(m, { nom: v('#mi-nom'), nationalite: v('#mi-nat'), dateNaissance: v('#mi-naiss'), sexe: v('#mi-sexe'), qualification: v('#mi-qual'), agenceId: v('#mi-ag'), numeroContrat: v('#mi-ctr'),
      motif: v('#mi-motif'), motifDetail: v('#mi-md'), dateEntree: v('#mi-ent'), finPrevue: v('#mi-fin'), affaireIds: v('#mi-aff') ? [v('#mi-aff')] : [], titreType: v('#mi-tt'), titreNumero: v('#mi-tn'), titreExpire: v('#mi-te') });
    if ($('#mi-sort')) m.dateSortie = v('#mi-sort');
    if (!m.nom || !m.dateEntree) return notify('Indiquez au moins le nom et la date d\'entrée.');
    if (m.finPrevue && m.finPrevue < m.dateEntree) return notify('La fin prévue est avant la date d\'entrée.');
    // Fiche de l'équipe (pour le pointage et le planning) : créée à la première entrée
    if (!m.userId) {
      const uid = $('#mi-u') && $('#mi-u').value;
      if (uid) m.userId = uid;
      else { const u = Store.upsert('users', { nom: m.nom, role: 'atelier', type: 'interimaire', agenceId: m.agenceId, capaciteHebdo: 35, tauxHoraire: num(Store.data.settings.tauxHoraireDefaut) }); m.userId = u.id; }
    }
    Store.upsert('missions', m);
    const manque = Interim.manquants(m);
    Modal.close(); App.render(); App.toast(manque.length ? `Enregistré. À compléter pour le registre : ${manque.join(', ')}` : 'Mission enregistrée au registre', manque.length ? 6000 : 3000);
  };
}
async function sortieMission(id) {
  const m = Store.get('missions', id);
  const box = Modal.open(`<h2 style="margin-top:0">Sortie de ${esc(m.nom)}</h2>
    <div class="grid2"><div class="field"><label for="so-d">Date de sortie</label><input id="so-d" type="date" value="${isoDate(new Date())}"></div>
    <div class="field"><label for="so-m">Motif</label><select id="so-m">${['Fin de mission', 'Fin anticipée', 'Rupture à l\'initiative de l\'intérimaire', 'Embauche'].map(x => `<option>${x}</option>`).join('')}</select></div></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="so-x">Annuler</button><button id="so-ok">Enregistrer la sortie</button></div>`);
  box.querySelector('#so-x').onclick = Modal.close;
  box.querySelector('#so-ok').onclick = () => {
    const d = box.querySelector('#so-d').value;
    if (!d || d < m.dateEntree) return notify('Date de sortie invalide.');
    Store.upsert('missions', { ...m, dateSortie: d, finMotif: box.querySelector('#so-m').value }); Modal.close(); App.render();
  };
}
async function prolongerMission(id) {
  const m = Store.get('missions', id);
  const v = await askValue(`Nouvelle fin de mission pour ${m.nom} (avenant de renouvellement)`, m.finPrevue || isoDate(new Date()), 'date');
  if (!v) return;
  Store.upsert('missions', { ...m, finPrevue: v, renouvellements: [...(m.renouvellements || []), { date: isoDate(new Date()), ancienneFin: m.finPrevue || '', nouvelleFin: v }] }); App.render();
}
function bindInterim(root) {
  const on = (s, fn) => { const el = root.querySelector(s); if (el) el.onclick = fn; };
  on('#mi-add', () => editerMission(null));
  root.querySelectorAll('[data-mission]').forEach(el => el.onclick = () => editerMission(el.dataset.mission));
  root.querySelectorAll('[data-sortie]').forEach(el => el.onclick = () => sortieMission(el.dataset.sortie));
  root.querySelectorAll('[data-prolonger]').forEach(el => el.onclick = () => prolongerMission(el.dataset.prolonger));
  root.querySelector('#mi-annee').onchange = e => { interimFiltre.annee = e.target.value; App.render(); };
  root.querySelector('#mi-agence').onchange = e => { interimFiltre.agence = e.target.value; App.render(); };
  const reg = () => Interim.registre(Store.all('missions')).filter(m => (!interimFiltre.annee || m.dateEntree.startsWith(interimFiltre.annee) || (m.dateSortie || isoDate(new Date())).startsWith(interimFiltre.annee)) && (!interimFiltre.agence || m.agenceId === interimFiltre.agence));
  on('#mi-xlsx', () => download(`registre-interim${interimFiltre.annee ? '-' + interimFiltre.annee : ''}.xlsx`, registreExcel(reg()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  on('#mi-pdf', () => PDF.telecharger(registreDocument(reg()), `registre-interim${interimFiltre.annee ? '-' + interimFiltre.annee : ''}.pdf`).catch(e => notify(e.message)));
}
