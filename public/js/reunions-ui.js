// Chantier → onglet Réunions : comptes rendus de réunion glissés-déposés (PDF, scan, photo, texte), lus sur
// l'appareil ; les points qui concernent le lot de l'entreprise (CVC, plomberie, chauffage… et son nom) deviennent
// des tâches à faire, avec échéance et responsable. Un point repris d'un CR à l'autre n'est pas recréé.
const reunionFiltre = { statut: 'a-faire' };
const motsLot = a => (a.motsLot !== undefined ? a.motsLot : [...CrReunion.MOTS_DEFAUT, Store.data.settings.societe].filter(Boolean).join(', '));
const motsListe = a => motsLot(a).split(/[,;]/).map(x => x.trim()).filter(Boolean);

function reunionsChantier(a) {
  const auj = isoDate(new Date()), edit = Store.can('write', 'affaires');
  const taches = (a.taches || []).slice().sort((x, y) => (x.statut === 'fait') - (y.statut === 'fait') || (x.echeance || '9999').localeCompare(y.echeance || '9999'));
  const vues = reunionFiltre.statut === 'tout' ? taches : taches.filter(t => t.statut !== 'fait');
  const ouvertes = taches.filter(t => t.statut !== 'fait'), retard = ouvertes.filter(t => t.echeance && t.echeance < auj);
  const crs = (a.reunions || []).slice().sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const users = Store.all('users').filter(u => !u.archive);
  return `<div class="toolbar"><a href="#/chantiers" class="btn secondary">← Chantiers</a></div>
  <h1>${esc(affaireLabel(a))} ${badge(a.statut)}</h1>${chantierOnglets(a, 'reunions')}
  <p class="muted">Glissez ici les comptes rendus de réunion de chantier : les points qui concernent votre lot deviennent des tâches à faire, avec leur échéance. D'un compte rendu à l'autre, un point déjà suivi n'est pas recréé.</p>
  ${edit ? `<div class="ch-depot" id="reu-depot">🗒️ <strong>Glissez le compte rendu de réunion</strong> (PDF, scan, photo ou texte)
    <div><label class="btn secondary small" style="margin-top:8px">Choisir le fichier<input type="file" id="reu-file" accept=".pdf,.txt,image/*" hidden></label></div></div>
  <div class="field"><label for="reu-mots">Votre lot dans les comptes rendus (mots reconnus, séparés par des virgules)</label><input id="reu-mots" value="${esc(motsLot(a))}"></div>` : ''}
  <h2>Tâches à faire ${ouvertes.length ? `<span class="badge b-warn">${ouvertes.length}</span>` : ''}${retard.length ? ` <span class="badge b-bad">${retard.length} en retard</span>` : ''}</h2>
  <div class="toolbar"><span class="seg" role="group" aria-label="Filtre">${[['a-faire', 'À faire'], ['tout', 'Toutes']].map(([k, l]) => `<button type="button" class="${reunionFiltre.statut === k ? 'on' : ''}" data-reu-f="${k}">${l}</button>`).join('')}</span>
    ${edit ? '<button class="secondary small" id="reu-add">+ Tâche</button>' : ''}</div>
  ${vues.length ? `<div class="table-wrap"><table class="compact reu-taches"><tr><th></th><th>Tâche</th><th>Échéance</th><th>Responsable</th><th>Origine</th><th></th></tr>
    ${vues.map(t => `<tr data-t="${t.id}" class="${t.statut === 'fait' ? 'muted' : t.echeance && t.echeance < auj ? 'reu-retard' : ''}">
      <td><input type="checkbox" data-k="fait" ${t.statut === 'fait' ? 'checked' : ''} ${edit ? '' : 'disabled'} aria-label="Fait"></td>
      <td><textarea data-k="texte" rows="2" ${edit ? '' : 'disabled'}>${esc(t.texte)}</textarea>${t.tous ? ' <span class="badge">toutes entreprises</span>' : ''}${t.statut === 'fait' && t.faitLe ? `<div class="small muted">fait le ${dateFr(t.faitLe)}</div>` : ''}</td>
      <td><input type="date" data-k="echeance" value="${esc(t.echeance || '')}" ${edit ? '' : 'disabled'}></td>
      <td><select data-k="responsableId" ${edit ? '' : 'disabled'}><option value="">—</option>${options(users, t.responsableId, u => u.nom, false)}</select></td>
      <td class="small">${t.origine ? `CR${t.origine.numero ? ` n° ${t.origine.numero}` : ''} du ${dateFr(t.origine.date)}` : 'saisie'}${(t.vu || []).length > 1 ? `<br><span class="muted">repris ${t.vu.length - 1} fois</span>` : ''}</td>
      <td>${edit ? `<button class="small danger" data-t-del="${t.id}" aria-label="Supprimer">✕</button>` : ''}</td></tr>`).join('')}</table></div>`
    : `<p class="muted">${taches.length ? 'Toutes les tâches sont faites.' : 'Aucune tâche : glissez un compte rendu de réunion.'}</p>`}
  <h2>Comptes rendus</h2>
  ${crs.length ? `<div class="table-wrap"><table class="compact"><tr><th>Réunion</th><th>Compte rendu</th><th class="num">Tâches reprises</th><th>Prochaine réunion</th></tr>
    ${crs.map(r => `<tr><td>${r.numero ? `n° ${r.numero} · ` : ''}${dateFr(r.date)}</td><td><a href="${lienDocument({ fichierId: r.fichierId, nom: r.nom })}" target="_blank" rel="noopener">🗒️ ${esc(r.nom)}</a></td><td class="num">${r.nbTaches || 0}</td><td>${r.prochaine ? dateFr(r.prochaine) : ''}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun compte rendu.</p>'}`;
}

function bindReunionsChantier(root, a) {
  const enreg = rerender => { Store.upsert('affaires', a); if (rerender) App.render(); };
  root.querySelectorAll('[data-reu-f]').forEach(b => b.onclick = () => { reunionFiltre.statut = b.dataset.reuF; App.render(); });
  const mots = root.querySelector('#reu-mots'); if (mots) mots.onchange = () => { a.motsLot = mots.value; enreg(); };
  root.querySelectorAll('.reu-taches tr[data-t] [data-k]').forEach(el => el.onchange = () => {
    const t = (a.taches || []).find(x => x.id === el.closest('tr').dataset.t); if (!t) return;
    if (el.dataset.k === 'fait') { t.statut = el.checked ? 'fait' : 'a-faire'; t.faitLe = el.checked ? isoDate(new Date()) : ''; enreg(true); return; }
    t[el.dataset.k] = el.value; enreg(el.dataset.k === 'echeance');
  });
  root.querySelectorAll('[data-t-del]').forEach(b => b.onclick = () => ask('Supprimer cette tâche ?', 'Supprimer').then(ok => { if (ok) { a.taches = a.taches.filter(t => t.id !== b.dataset.tDel); enreg(true); } }));
  const add = root.querySelector('#reu-add'); if (add) add.onclick = () => { a.taches = [{ id: uid(), texte: '', echeance: '', responsableId: a.chargeId || '', statut: 'a-faire', origine: null, vu: [] }, ...(a.taches || [])]; enreg(true); };
  const zone = root.querySelector('#reu-depot'), inp = root.querySelector('#reu-file');
  if (inp) inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) lireCompteRendu(a, f); };
  if (zone) {
    root.ondragover = e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); zone.classList.add('survol'); } };
    root.ondragleave = e => { if (!root.contains(e.relatedTarget)) zone.classList.remove('survol'); };
    root.ondrop = e => { const f = [...(e.dataTransfer.files || [])].find(x => /\.(pdf|txt|jpe?g|png|webp)$/i.test(x.name)); if (!f) return; e.preventDefault(); zone.classList.remove('survol'); lireCompteRendu(a, f); };
  }
}

// Lecture du compte rendu, puis choix des tâches à reprendre
async function lireCompteRendu(a, f) {
  try {
    App.toast(`Lecture de ${f.name}…`);
    const lignes = /\.txt$/i.test(f.name) || f.type === 'text/plain' ? (await f.text()).split(/\r?\n/) : (await PdfLecture.lire(f, () => {}, { pagesMax: 40 })).lignes;
    const r = CrReunion.analyser(lignes, { mots: motsListe(a), societe: Store.data.settings.societe });
    const date = r.date || isoDate(new Date());
    const existantes = new Map((a.taches || []).map(t => [CrReunion.cle(t.texte), t]));
    const lignesT = r.taches.map(t => ({ ...t, deja: existantes.get(CrReunion.cle(t.texte)) }));
    const box = Modal.open(`<h2 style="margin-top:0">Compte rendu${r.numero ? ` n° ${r.numero}` : ''} du ${dateFr(date)}</h2>
      <p class="small muted">${esc(f.name)} · ${lignesT.length} point(s) concernant votre lot${r.prochaine ? ` · prochaine réunion le ${dateFr(r.prochaine)}` : ''}. Les points déjà suivis sont mis à jour sans être recréés.</p>
      <div class="grid2"><div class="field"><label for="cr-d">Date de la réunion</label><input id="cr-d" type="date" value="${esc(date)}"></div><div class="field"><label for="cr-n">N° du compte rendu</label><input id="cr-n" type="number" min="1" value="${esc(r.numero || '')}"></div></div>
      ${lignesT.length ? `<div class="table-wrap" style="max-height:52vh;overflow:auto"><table class="compact"><tr><th></th><th>Tâche</th><th>Échéance</th><th></th></tr>
        ${lignesT.map((t, i) => `<tr><td><input type="checkbox" data-cr="${i}" ${t.deja && t.deja.statut === 'fait' ? '' : 'checked'}></td><td><textarea data-crt="${i}" rows="2">${esc(t.texte)}</textarea>${t.section ? `<div class="small muted">${esc(t.section)}</div>` : ''}</td>
          <td><input type="date" data-cre="${i}" value="${esc(t.echeance || '')}"></td><td class="small">${t.deja ? (t.deja.statut === 'fait' ? '<span class="badge b-ok">déjà faite</span>' : '<span class="badge">déjà suivie</span>') : '<span class="badge b-warn">nouvelle</span>'}${t.tous ? ' <span class="badge">toutes entreprises</span>' : ''}</td></tr>`).join('')}</table></div>`
        : '<p class="warn-text small">Aucun point reconnu pour votre lot : vérifiez les mots du lot (CVC, plomberie, chauffage, nom de l\'entreprise…) ou ajoutez les tâches à la main.</p>'}
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="cr-x">Annuler</button><button id="cr-ok">Enregistrer le compte rendu${lignesT.length ? ' et les tâches' : ''}</button></div>`, true);
    const $ = q => box.querySelector(q);
    $('#cr-x').onclick = Modal.close;
    $('#cr-ok').onclick = async () => {
      const btn = $('#cr-ok'); btn.disabled = true;
      try {
        const doc = await envoyerFichierDocument(f), d = $('#cr-d').value || date, n = num($('#cr-n').value) || '';
        const reunion = { id: uid(), date: d, numero: n, prochaine: r.prochaine || '', nom: f.name, fichierId: doc.id, ajouteLe: isoDate(new Date()), nbTaches: 0 };
        a.documents = [...(a.documents || []), { id: uid(), fichierId: doc.id, nom: f.name, categorie: 'Compte rendu de réunion', indice: n ? String(n) : '', note: `Réunion du ${dateFr(d)}`, mime: doc.mime, taille: doc.taille, date: d, par: Store.me.nom, visible: false }];
        a.taches = a.taches || [];
        let nouv = 0, maj = 0;
        lignesT.forEach((t, i) => {
          if (!box.querySelector(`[data-cr="${i}"]`).checked) return;
          const texte = box.querySelector(`[data-crt="${i}"]`).value.trim(), ech = box.querySelector(`[data-cre="${i}"]`).value;
          if (!texte) return;
          if (t.deja) { Object.assign(t.deja, { echeance: ech || t.deja.echeance, vu: [...(t.deja.vu || []), n || d] }); if (t.deja.statut === 'fait') { t.deja.statut = 'a-faire'; t.deja.faitLe = ''; } maj++; }
          else { a.taches.push({ id: uid(), texte, echeance: ech, responsableId: a.chargeId || '', statut: 'a-faire', tous: !!t.tous, origine: { reunionId: reunion.id, numero: n, date: d }, vu: [n || d] }); nouv++; }
        });
        reunion.nbTaches = nouv + maj;
        a.reunions = [...(a.reunions || []), reunion];
        Store.upsert('affaires', a); Modal.close(); App.render();
        App.toast(`Compte rendu enregistré : ${nouv} nouvelle(s) tâche(s)${maj ? `, ${maj} déjà suivie(s) mise(s) à jour` : ''}`, 5000);
      } catch (e) { notify(e.message); btn.disabled = false; }
    };
  } catch (e) { notify(`Lecture du compte rendu : ${e.message}`); }
}
