// Études du bureau d'études (application Études) vues du CRM : toutes les études, avec ou sans chantier. Une étude se fait
// souvent avant la commande : créée ici pour un client (et un devis), elle se relie au chantier quand la commande arrive —
// à la main (« Relier… »), ou toute seule quand son devis est accepté et devient un chantier.

// Adresse dans l'application Études (chemin après « #/ ») ; démonstration : application dans un cadre (Views.etudes)
function urlEtudes(chemin) {
  if (!Store.me || Store.me.role === 'atelier') return '';
  if (window.PIPEFIT_DEMO) return `#/etudes/_/${chemin}`;
  const base = String((Store.data.settings || {}).etudesUrl || (/^https?:$/.test(location.protocol) ? `${location.protocol}//${location.hostname}:3200` : '')).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(base) ? `${base}/#/${chemin}` : '';
}
const urlNouvelleEtude = (o = {}) => urlEtudes(`nouvelle?${new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v)))}`);

let etudesBE = null; // liste lue dans Pipe-Fit (app « etudes »)
async function chargerEtudesBE() {
  try { etudesBE = await api('GET', '/api/liens?app=etudes'); } catch (e) { etudesBE = etudesBE || []; }
  return etudesBE;
}
const nomClientEtude = l => (l.clientId ? clientName(l.clientId) : '') || (l.resume || {}).client || (l.affaireId ? clientName(affaireOf(l.affaireId).clientId) : '') || '';

const filtresEtudesBE = { vue: 'tous', q: '' };
Views.etudesBe = (params, query) => {
  const devisId = query.get('devis') || '', d = devisId && Store.get('devis', devisId);
  const cible = urlEtudes('');
  return `<h1>Études du bureau d'études</h1>
  <p class="muted">Notes de calcul faites dans l'application Études. Une étude peut être faite avant la commande, pour un client (et son devis) : reliez-la au chantier quand la commande arrive — elle l'est toute seule quand son devis est accepté et crée le chantier.</p>
  <div class="toolbar">${cible ? `<a class="btn" href="${esc(urlNouvelleEtude({ client: d ? docClientId(d) : '', devis: devisId, objet: d ? d.objet : '' }))}" ${window.PIPEFIT_DEMO ? '' : 'target="_blank" rel="noopener"'}>+ Nouvelle étude${d ? ` pour le devis ${esc(d.numero || '')}` : ' (sans chantier)'}</a>` : '<span class="muted small">Adresse de l\'application Études : Paramètres → Société.</span>'}
    <span class="spacer"></span>
    <div class="seg" role="group" aria-label="Études">${[['tous', 'Toutes'], ['sans', 'Sans chantier'], ['reliees', 'Reliées à un chantier']].map(([k, l]) => `<button data-vue="${k}" class="${filtresEtudesBE.vue === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <input type="search" id="eb-q" placeholder="Rechercher (objet, client, chantier, devis…)" value="${esc(filtresEtudesBE.q)}" style="width:auto"></div>
  ${d ? `<p class="note">Études du devis <a href="#/devis/${esc(d.id)}">${esc(d.numero || '')}</a> — ${esc(d.objet || '')}. <a href="#/etudes-be">Toutes les études</a></p>` : ''}
  <div id="eb-liste">${etudesBE ? listeEtudesBE(devisId) : '<p class="muted">Lecture…</p>'}</div>`;
};
function listeEtudesBE(devisId) {
  const f = filtresEtudesBE, q = RechercheChantier.norm(f.q);
  const l = (etudesBE || []).filter(x => (!devisId || x.devisId === devisId) && (f.vue === 'tous' || (f.vue === 'sans') === !x.affaireId)
    && (!q || RechercheChantier.norm([(x.resume || {}).objet, nomClientEtude(x), affaireOf(x.affaireId).code, affaireOf(x.affaireId).nom, (Store.get('devis', x.devisId) || {}).numero].join(' ')).includes(q)));
  if (!l.length) return '<p class="muted">Aucune étude.</p>';
  return `<div class="table-wrap"><table><tr><th>Étude</th><th>Client</th><th>Chantier</th><th>Devis</th><th>Indice</th><th>Calculs</th><th>Contrôles</th><th>Mise à jour</th></tr>
    ${l.map(x => { const r = x.resume || {}, a = x.affaireId && Store.get('affaires', x.affaireId), dv = x.devisId && Store.get('devis', x.devisId), lien = urlEtudes(`etude/${encodeURIComponent(x.id)}`);
      return `<tr><td>${lien ? `<a href="${esc(lien)}" ${window.PIPEFIT_DEMO ? '' : 'target="_blank" rel="noopener"'}><strong>${esc(r.objet || 'Étude')}</strong></a>` : `<strong>${esc(r.objet || 'Étude')}</strong>`}</td>
        <td>${esc(nomClientEtude(x))}</td>
        <td>${a ? `<a href="#/chantier/${esc(a.id)}">${esc(a.code || '')}</a> ${esc(a.nom || '')}${x.relie ? `<div class="muted small">relié par ${esc(x.relie.par)} le ${dateFr(x.relie.le.slice(0, 10))}</div>` : ''}` : '<span class="badge b-warn">Sans chantier</span>'}
          ${Store.can('write', 'affaires') ? ` <button class="small secondary" data-relier="${esc(x.id)}">${a ? 'Changer' : 'Relier…'}</button>` : ''}</td>
        <td>${dv ? `<a href="#/devis/${esc(dv.id)}">${esc(dv.numero || 'brouillon')}</a> <span class="muted small">${esc(dv.statut || '')}</span>` : ''}</td>
        <td>${esc(r.indice || '')}</td><td>${(r.notes || []).length}</td>
        <td>${r.erreurs ? `<span class="badge b-bad">${r.erreurs} non-conformité(s)</span>` : r.attention ? `<span class="badge b-warn">${r.attention} point(s) d'attention</span>` : (r.notes || []).length ? '<span class="badge b-ok">Conforme</span>' : ''}</td>
        <td class="small">${x.maj ? new Date(x.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''}${x.par ? `<br>${esc(x.par)}` : ''}</td></tr>`; }).join('')}</table></div>`;
}
Views.etudesBe.bind = (root, params, query) => {
  const devisId = query.get('devis') || '';
  const remplir = () => { const z = root.querySelector('#eb-liste'); if (!z) return; z.innerHTML = listeEtudesBE(devisId); brancherListe(z); };
  const brancherListe = z => z.querySelectorAll('[data-relier]').forEach(b => b.onclick = () => relierEtude((etudesBE || []).find(x => x.id === b.dataset.relier)).then(ok => { if (ok) chargerEtudesBE().then(remplir); }));
  root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { filtresEtudesBE.vue = b.dataset.vue; root.querySelectorAll('[data-vue]').forEach(x => x.classList.toggle('on', x === b)); remplir(); });
  const q = root.querySelector('#eb-q');
  q.oninput = () => { filtresEtudesBE.q = q.value; remplir(); };
  brancherListe(root);
  chargerEtudesBE().then(remplir);
};

// Relier une étude : au chantier (commande reçue), ou à un devis (le chantier sera relié à son acceptation)
function relierEtude(l) {
  if (!l) return Promise.resolve(false);
  const clientId = l.clientId || '', devis = Store.all('devis').filter(d => !d.archive && d.statut !== 'Refusé' && (!clientId || docClientId(d) === clientId));
  let choisi = l.affaireId || '';
  return dialog(`<h2 style="margin-top:0">Relier l'étude</h2><p><strong>${esc((l.resume || {}).objet || '')}</strong>${nomClientEtude(l) ? ` · ${esc(nomClientEtude(l))}` : ''}</p>
    <div class="field"><label>Chantier (commande reçue)</label><div class="champ-ch"><button type="button" class="choix-ch" id="re-ch"><span id="re-ch-lib">${choisi ? `<strong>${esc(affaireOf(choisi).code || '')}</strong> ${esc(affaireOf(choisi).nom || '')}` : 'Choisir le chantier…'}</span><span class="choix-ch-act">🔍 Rechercher</span></button></div></div>
    <div class="field"><label for="re-dv">ou devis (le chantier créé à son acceptation sera relié tout seul)</label><select id="re-dv"><option value="">—</option>${devis.map(d => `<option value="${esc(d.id)}" ${d.id === l.devisId ? 'selected' : ''}>${esc(d.numero || 'brouillon')} — ${esc(d.objet || '')} · ${esc(clientName(docClientId(d)))} (${esc(d.statut || '')})</option>`).join('')}</select></div>
    <p class="small muted">L'application Études reprend le chantier à la prochaine ouverture de l'étude.</p>
    <div class="modal-actions">${l.affaireId ? '<button type="button" class="danger" id="re-delier">Délier du chantier</button>' : ''}<span style="flex:1"></span><button type="button" class="secondary" id="re-x">Annuler</button><button type="button" id="re-ok">Relier</button></div>`,
  (wrap, done) => {
    const $ = s => wrap.querySelector(s);
    $('#re-ch').onclick = async () => {
      const r = await choisirChantier({});
      if (r && r !== NOUVELLE_HD) { choisi = r; $('#re-ch-lib').innerHTML = `<strong>${esc(affaireOf(r).code || '')}</strong> ${esc(affaireOf(r).nom || '')}`; }
    };
    $('#re-x').onclick = () => done(false);
    const envoyer = async corps => {
      try { await api('POST', `/api/liens/etudes/${encodeURIComponent(l.id)}/relier`, corps); App.toast(corps.affaireId ? `Étude reliée au chantier ${affaireOf(corps.affaireId).code || ''}` : corps.devisId ? 'Étude reliée au devis' : 'Étude déliée', 4000); done(true); }
      catch (e) { notify(e.message); }
    };
    $('#re-ok').onclick = () => { const dv = $('#re-dv').value; if (!choisi && !dv) return notify('Choisissez le chantier ou le devis.'); envoyer({ affaireId: choisi, devisId: dv }); };
    const del = $('#re-delier');
    if (del) del.onclick = () => envoyer({ affaireId: '' });
  });
}
