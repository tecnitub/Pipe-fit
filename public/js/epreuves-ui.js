// PV d'épreuve hydraulique : saisi sur chantier (téléphone, tablette) ou au bureau, pré-rempli (chantier, client, date,
// heure, technicien, manomètre du parc et son étalonnage, pression conseillée), photos du manomètre, signatures du
// technicien et du client ; une fois signé, le procès-verbal est figé, imprimable, envoyé en PDF, et se duplique pour
// le réseau suivant.

const epreuveBrouillon = { cle: null, e: null };
const heureMaintenant = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0')}`; };
const manometres = () => Store.all('materiels').filter(m => !m.archive && /manom|capteur de pression|enregistreur/i.test(`${m.designation} ${m.categorie}`));
const libelleManometre = m => [m.designation, m.numeroSerie && `n° ${m.numeroSerie}`].filter(Boolean).join(' · ');
// Manomètre proposé : celui affecté au technicien ou au chantier, sinon le premier du parc
const manometreDe = (me, affaireId) => manometres().find(m => m.affectation && (m.affectation.userId === me || m.affectation.affaireId === affaireId)) || manometres()[0];
// Description de la ligne (matière, diamètres) reprise de la dernière prise de cotes du même réseau
const descriptionReseau = e => { const r = typeof Tuyauterie !== 'undefined' && Tuyauterie.dernierReleve(Store.all('releves') || [], e.affaireId, e.reseau); return r ? Tuyauterie.descriptionLigne(r) : ''; };
const epreuvesDe = affaireId => Store.all('epreuves').filter(e => e.affaireId === affaireId).sort((a, b) => `${b.date}${b.heureDebut}`.localeCompare(`${a.date}${a.heureDebut}`));
const retourEpreuve = e => (Store.me.role === 'atelier' ? '#/pointage/rapports' : `#/chantier/${e.affaireId}`);

function nouvelleEpreuve(query) {
  const copie = query.get('copie') && Store.get('epreuves', query.get('copie'));
  const me = Store.me.userId || '';
  if (copie) {
    // Réseau suivant du même chantier : mêmes conditions, nouvelles mesures
    const { id, numero, _v, _at, _by, planCle, reseau, pressionDebut, pressionFin, photos, signatureTechId, signatureClientId, signeLe, statut, heureDebut, heureFin, ...garde } = copie;
    return { ...garde, reseau: '', date: isoDate(new Date()), heureDebut: heureMaintenant(), heureFin: '', pressionDebut: '', pressionFin: '', photos: [], statut: 'Brouillon', userId: me || copie.userId };
  }
  const prevu = me && planJour(me, isoDate(new Date()))[0];
  const affaireId = query.get('chantier') || (prevu ? prevu.affaireId : '');
  const mano = manometreDe(me, affaireId);
  // Ouvert depuis la liste des mises en service : réseau, nature, PS et pression d'épreuve de l'étude
  const qv = k => String(query.get(k) || '').slice(0, 200), nb = k => (Number(qv(k)) > 0 ? Number(qv(k)) : '');
  const desc = descriptionReseau({ affaireId, reseau: qv('reseau') });
  return { affaireId, userId: me, date: isoDate(new Date()), heureDebut: heureMaintenant(), heureFin: '', reseau: qv('reseau'), nature: Epreuve.NATURES.includes(qv('nature')) ? qv('nature') : Epreuve.NATURES[0], description: desc, descAuto: !!desc, fluideEssai: Epreuve.FLUIDES.includes(qv('fluide')) ? qv('fluide') : 'Eau',
    ...(qv('plan') ? { planCle: qv('plan') } : {}), pressionService: nb('ps') || '', pressionEpreuve: nb('pt') || (nb('ps') ? Epreuve.pressionConseillee(nb('ps')) : ''), peAuto: !nb('pt'), dureePrevue: 120, chuteAdmissible: 0, pressionDebut: '', pressionFin: '', temperature: '', manometreId: mano ? mano.id : '', manometre: mano ? libelleManometre(mano) : '',
    observations: '', photos: [], ...signataireChantier(affaireId), statut: 'Brouillon', manoAuto: true };
}

Views.epreuve = (params, query) => {
  const id = params[0] || 'new';
  const rec = id !== 'new' && Store.get('epreuves', id);
  if (id !== 'new' && !rec) return '<p>Procès-verbal introuvable.</p>';
  if (rec && rec.statut === 'Signé') return epreuveVue(rec);
  const cle = id === 'new' ? `new|${query.toString()}` : id;
  if (epreuveBrouillon.cle !== cle) Object.assign(epreuveBrouillon, { cle, e: rec ? JSON.parse(JSON.stringify(rec)) : nouvelleEpreuve(query) });
  const e = epreuveBrouillon.e, libre = id === 'new' && !e.planCle && !query.get('copie');
  return epreuveForm(e, libre ? choixPointPvHtml('epreuve', e.affaireId) : '');
};

function epreuveForm(e, choixPoint = '') {
  const a = Store.get('affaires', e.affaireId) || {}, m = Store.get('materiels', e.manometreId), et = Epreuve.etalonnage(m, e.date);
  const res = Epreuve.resultat(e), c = Epreuve.chute(e), d = Epreuve.duree(e.heureDebut, e.heureFin);
  // Suggestions : réseaux de l'étude (liste du chantier) et déjà éprouvés ; descriptions déjà saisies
  const reseaux = nomsListeChantier('epreuve', e.affaireId, Store.all('epreuves').filter(x => x.affaireId === e.affaireId).map(x => x.reseau));
  const descriptions = [...new Set([descriptionReseau(e), ...Store.all('epreuves').filter(x => x.affaireId === e.affaireId || !e.affaireId).map(x => x.description)].filter(Boolean))].slice(0, 40);
  const f = (k, lib, type = 'text', extra = '') => `<div class="field"><label for="ep-${k}">${lib}</label><input id="ep-${k}" data-ep="${k}" type="${type}" value="${esc(e[k] ?? '')}" ${extra}></div>`;
  const bar = (k, lib, extra = '') => f(k, lib, 'number', `inputmode="decimal" step="0.01" min="0" ${extra}`);
  const deja = epreuvesDe(e.affaireId).filter(x => x.id !== e.id);
  return `<div class="toolbar"><a href="${retourEpreuve(e)}" class="btn secondary">← ${Store.me.role === 'atelier' ? 'Rapports' : 'Chantier'}</a></div>
  <h1>PV d'épreuve hydraulique${e.numero ? ` ${esc(e.numero)}` : ''}</h1>
  ${choixPoint}
  <div class="card epreuve-form">
    <fieldset class="hd-bloc"><legend>Chantier et réseau</legend>
      <div class="grid2">
        <div class="field"><label for="ep-aff">Chantier</label><select id="ep-aff" class="big-select">${options(chantiersActifs().concat(a.id && !chantiersActifs().includes(a) ? [a] : []), e.affaireId, affaireLabel)}</select></div>
        <div class="field"><label for="ep-reseau">Nom du réseau éprouvé *</label><input id="ep-reseau" data-ep="reseau" list="ep-reseaux" value="${esc(e.reseau)}" placeholder="Ex. Réseau chauffage aller/retour bât. B, NEP aller DN50…">
          ${datalistHtml('ep-reseaux', reseaux)}</div>
        <div class="field"><label for="ep-nature">Nature du réseau</label><select id="ep-nature" data-ep="nature">${optionsStr(Epreuve.NATURES, e.nature)}</select></div>
        ${f('description', 'Matériaux, diamètres, repérage', 'text', 'list="ep-descriptions" placeholder="Acier P235GH DN80, plans ISO-CH-02…"')}${datalistHtml('ep-descriptions', descriptions)}
      </div>
      ${deja.length ? `<p class="small muted">Déjà éprouvés sur ce chantier : ${deja.map(x => `${esc(x.reseau)} (${dateFr(x.date)}, ${esc(x.resultat || '')})`).join(' · ')}</p>` : ''}
    </fieldset>
    <fieldset class="hd-bloc"><legend>Conditions de l'épreuve</legend>
      <div class="grid3">
        <div class="field"><label for="ep-userId">Technicien</label><select id="ep-userId" data-ep="userId">${options(Store.all('users').filter(u => !u.archive), e.userId)}</select></div>
        ${f('date', 'Date', 'date')}
        <div class="field"><label for="ep-fluideEssai">Fluide d'essai</label><select id="ep-fluideEssai" data-ep="fluideEssai">${optionsStr(Epreuve.FLUIDES, e.fluideEssai)}</select></div>
        ${bar('pressionService', 'Pression de service (bar)')}
        ${bar('pressionEpreuve', 'Pression d\'épreuve (bar) *')}
        ${bar('dureePrevue', 'Durée de maintien (min)', 'step="5"')}
        ${bar('chuteAdmissible', 'Chute admissible (bar)')}
        ${f('temperature', 'Température du fluide (°C)', 'number', 'inputmode="decimal" step="0.5"')}
      </div>
      <p class="small muted" id="ep-conseil">${Epreuve.pressionConseillee(e.pressionService) ? `Conseillé : 1,5 × la pression de service = ${fmt(Epreuve.pressionConseillee(e.pressionService), 1)} bar (à adapter au CCTP ou à la norme du réseau).` : 'Indiquez la pression de service : la pression d\'épreuve est proposée à 1,5 fois.'}</p>
      <div class="field"><label for="ep-mano">Manomètre utilisé</label><select id="ep-mano"><option value="">Autre (saisir ci-dessous)</option>${manometres().map(x => `<option value="${esc(x.id)}" ${x.id === e.manometreId ? 'selected' : ''}>${esc(libelleManometre(x))}</option>`).join('')}</select></div>
      ${e.manometreId ? `<p class="small ${et.connu && !et.aJour ? 'neg' : 'muted'}">${et.connu ? (et.aJour ? `Étalonnage valable jusqu'au ${dateFr(et.valableJusquau)}.` : `Étalonnage dépassé depuis le ${dateFr(et.valableJusquau)} : utilisez un autre manomètre ou faites-le étalonner (Parc).`) : 'Date d\'étalonnage non renseignée dans le parc.'}</p>` : f('manometre', 'Manomètre (désignation, n°, date d\'étalonnage)')}
    </fieldset>
    <fieldset class="hd-bloc"><legend>Mesures</legend>
      <div class="grid2">
        ${f('heureDebut', 'Heure de mise en pression', 'time')}${f('heureFin', 'Heure de fin', 'time')}
        ${bar('pressionDebut', 'Pression au début (bar) *')}${bar('pressionFin', 'Pression à la fin (bar) *')}
      </div>
      <p id="ep-res" class="ep-res">${epreuveResultatHtml(e, res, c, d)}</p>
      <div class="field"><label for="ep-obs">Observations</label><textarea id="ep-obs" data-ep="observations" data-dictee rows="2" placeholder="Purge, points de fuite repris, vannes fermées, réseau isolé…">${esc(e.observations || '')}</textarea></div>
      <div class="photos-grid">${(e.photos || []).map((p, i) => `<div class="ph"><img src="${p.startsWith('data:') ? p : fileUrl(p)}" alt="Photo ${i + 1}"><button class="icon" data-rmph="${i}" aria-label="Retirer la photo">✕</button></div>`).join('')}
        <label class="ph add" for="ep-photo"><span aria-hidden="true">📷</span><span class="small">Photo du manomètre</span><input id="ep-photo" type="file" accept="image/*" capture="environment" multiple hidden></label></div>
    </fieldset>
    <fieldset class="hd-bloc"><legend>Signatures</legend>
      <div class="sign-grid">
        <div><p><strong>Le technicien</strong> · ${esc(userName(e.userId))}</p><canvas class="sign-pad" id="ep-sig-t" aria-label="Signature du technicien"></canvas><button class="small secondary" id="ep-sig-t-clear">Effacer</button></div>
        <div><div class="grid2">${f('signataireNom', 'Pour le client (facultatif) : nom')}${f('signataireQualite', 'Qualité')}</div>
          <canvas class="sign-pad" id="ep-sig-c" aria-label="Signature du client"></canvas><button class="small secondary" id="ep-sig-c-clear">Effacer</button></div>
      </div>
    </fieldset>
    <p class="neg small" id="ep-err"></p>
    <div class="toolbar"><button class="secondary" id="ep-brouillon">Enregistrer le brouillon</button><span class="spacer"></span><button class="big" id="ep-signer">Valider et signer le PV</button></div>
  </div>`;
}
const epreuveResultatHtml = (e, res, c, d) => (res ? `<span class="badge ${res === 'Conforme' ? 'b-ok' : 'b-bad'}">${res}</span> · chute ${fmt(c, 2)} bar${d !== null ? ` en ${d} min` : ''}${num(e.dureePrevue) && d !== null && d < num(e.dureePrevue) ? ` <span class="neg">(maintien inférieur aux ${num(e.dureePrevue)} min prévues)</span>` : ''}${num(e.pressionDebut) < num(e.pressionEpreuve) - 0.05 ? ' <span class="neg">(pression d\'épreuve non atteinte)</span>' : ''}`
  : '<span class="muted">Le résultat s\'affiche avec les pressions de début et de fin.</span>');

Views.epreuve.bind = (root, params) => {
  const rec = params[0] && params[0] !== 'new' && Store.get('epreuves', params[0]);
  if (rec && rec.statut === 'Signé') {
    const pdf = root.querySelector('#ep-pdf');
    if (pdf) pdf.onclick = () => PDF.telecharger(epreuveDocument(rec), `PV-epreuve-${rec.numero || rec.id}.pdf`).catch(err => notify(err.message));
    return;
  }
  const e = epreuveBrouillon.e, $ = s => root.querySelector(s);
  if (!e) return;
  const majResultat = () => { $('#ep-res').innerHTML = epreuveResultatHtml(e, Epreuve.resultat(e), Epreuve.chute(e), Epreuve.duree(e.heureDebut, e.heureFin)); };
  root.querySelectorAll('[data-ep]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const k = el.dataset.ep;
    e[k] = el.type === 'number' ? (el.value === '' ? '' : num(el.value)) : el.value;
    if (k === 'pressionEpreuve') e.peAuto = false;
    if (/^signataire/.test(k)) e.signataireManuel = true;
    if (k === 'description') e.descAuto = false;
    // Réseau connu : matière et diamètres repris de sa prise de cotes (sauf description saisie à la main)
    if (k === 'reseau' && (!e.description || e.descAuto)) { const d = descriptionReseau(e); if (d) { e.description = d; e.descAuto = true; $('#ep-description').value = d; } }
    if (k === 'pressionService') {
      const pc = Epreuve.pressionConseillee(e.pressionService);
      if (pc && (e.peAuto || e.pressionEpreuve === '')) { e.pressionEpreuve = pc; e.peAuto = true; $('#ep-pressionEpreuve').value = pc; }
      $('#ep-conseil').textContent = pc ? `Conseillé : 1,5 × la pression de service = ${fmt(pc, 1)} bar (à adapter au CCTP ou à la norme du réseau).` : '';
    }
    if (k === 'userId') App.render(); else majResultat();
  }));
  // Autre chantier : signataire de ce chantier (sauf saisi à la main) et manomètre qui lui est affecté (sauf choisi à la main)
  $('#ep-aff').onchange = () => {
    changerChantierPv(e, $('#ep-aff').value);
    if (e.manoAuto !== false) { const m = manometreDe(e.userId, e.affaireId); Object.assign(e, { manometreId: m ? m.id : '', manometre: m ? libelleManometre(m) : '' }); }
    App.render();
  };
  $('#ep-mano').onchange = () => { const m = Store.get('materiels', $('#ep-mano').value); Object.assign(e, { manometreId: m ? m.id : '', manometre: m ? libelleManometre(m) : '', manoAuto: false }); App.render(); };
  brancherChoixPointPv(root);
  if (e.affaireId && !e.planCle) preparerListeChantier(e.affaireId);
  $('#ep-photo').onchange = async ev => {
    for (const fi of ev.target.files) { try { e.photos.push(await compressImage(fi)); } catch (err) { notify('Photo illisible.'); } }
    App.render();
  };
  root.querySelectorAll('[data-rmph]').forEach(b => b.onclick = () => { e.photos.splice(+b.dataset.rmph, 1); App.render(); });
  const padT = signaturePad($('#ep-sig-t'), img => { e.signatureTech = img; }), padC = signaturePad($('#ep-sig-c'), img => { e.signatureClient = img; });
  if (e.signatureTech) padT.charger(e.signatureTech);
  if (e.signatureClient) padC.charger(e.signatureClient);
  $('#ep-sig-t-clear').onclick = () => { padT.effacer(); delete e.signatureTech; };
  $('#ep-sig-c-clear').onclick = () => { padC.effacer(); delete e.signatureClient; };
  const enregistrer = async signer => {
    const err = $('#ep-err');
    if (signer) {
      const m = Epreuve.manques(e);
      if (!e.signatureTech) m.push('signature du technicien');
      if (m.length) { err.textContent = `À compléter : ${m.join(', ')}.`; return; }
    } else if (!e.affaireId) { err.textContent = 'Choisissez le chantier.'; return; }
    $('#ep-signer').disabled = true; $('#ep-brouillon').disabled = true;
    try {
      const photos = [];
      for (const p of e.photos) photos.push(p.startsWith('data:') ? await envoyerImage(p) : p);
      const et = Epreuve.etalonnage(Store.get('materiels', e.manometreId), e.date);
      const o = { ...e, photos, resultat: Epreuve.resultat(e), chute: Epreuve.chute(e), dureeReelle: Epreuve.duree(e.heureDebut, e.heureFin), technicien: userName(e.userId), etalonnage: et.connu ? et.valableJusquau : (e.etalonnage || '') };
      ['signatureTech', 'signatureClient', 'peAuto', 'signataireManuel', 'descAuto', 'manoAuto'].forEach(k => delete o[k]);
      if (signer) {
        o.signatureTechId = await envoyerImage(e.signatureTech);
        if (e.signatureClient) o.signatureClientId = await envoyerImage(e.signatureClient);
        Object.assign(o, { statut: 'Signé', signeLe: new Date().toISOString() });
      } else o.statut = 'Brouillon';
      const r = Store.upsert('epreuves', o);
      Object.assign(epreuveBrouillon, { cle: null, e: null });
      App.toast(signer ? `PV d'épreuve signé : ${o.resultat}` : 'Brouillon enregistré', 4000);
      location.hash = signer ? `#/epreuve/${r.id}` : retourEpreuve(o);
    } catch (x) { $('#ep-signer').disabled = false; $('#ep-brouillon').disabled = false; err.textContent = x.message; }
  };
  $('#ep-brouillon').onclick = () => enregistrer(false);
  $('#ep-signer').onclick = () => enregistrer(true);
};

function epreuveVue(e) {
  const bureau = Store.me.role !== 'atelier';
  return `<div class="toolbar no-print"><a href="${retourEpreuve(e)}" class="btn secondary">← ${bureau ? 'Chantier' : 'Rapports'}</a><span class="spacer"></span>
    <a class="btn secondary" href="#/epreuve/new?copie=${esc(e.id)}">Dupliquer pour un autre réseau</a>
    <button class="secondary print-btn" data-print>Imprimer</button><button class="secondary" id="ep-pdf">PDF</button>${bureau ? boutonsEnvoi('epreuve', e.id) : ''}</div>
  <h1 class="no-print">PV d'épreuve ${esc(e.numero || '')} · ${esc(e.reseau)} <span class="badge ${e.resultat === 'Conforme' ? 'b-ok' : 'b-bad'}">${esc(e.resultat || '')}</span></h1>${bureau ? envoisHtml('epreuves', e.id) : ''}
  <div class="doc-print">${epreuveDocument(e)}</div>`;
}

// Document d'un PV d'essai : en-tête, parties, corps commun avec l'application DOE (essais-doc.js), pied
const ctxEssai = r => ({ img: fileUrl, societe: Store.data.settings.societe || '', chantier: affaireOf(r.affaireId), technicien: r.technicien || userName(r.userId) });
function documentEssai(titre, r, corps) {
  const a = affaireOf(r.affaireId), site = siteOf(a.clientId, a.siteId);
  return `${Doc.entete('pv', titre, `N° ${esc(r.numero || '—')} du ${dateFr(r.date)}`)}
    <div class="doc-parties"><div>Maître d'ouvrage : <strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)}<br>${esc(fullAddress(site))}` : ''}</div>
      <div>Chantier : <strong>${esc(a.code || '')} – ${esc(a.nom || '')}</strong>${a.moeId ? `<br>Maîtrise d'œuvre : ${esc(clientName(a.moeId))}` : ''}</div></div>
    ${corps(r, ctxEssai(r))}
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}
const epreuveDocument = e => documentEssai('PROCÈS-VERBAL D\'ÉPREUVE HYDRAULIQUE', e, EssaisDoc.epreuve);

// Fiche chantier : épreuves des réseaux
function epreuvesChantierHtml(a) {
  const l = epreuvesDe(a.id);
  return `<h2>Épreuves des réseaux <span class="muted small">${l.length}</span></h2>
  <div class="toolbar"><a class="btn secondary small" href="#/epreuve/new?chantier=${esc(a.id)}">+ PV d'épreuve hydraulique</a></div>
  ${l.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Réseau</th><th class="num">Pression d'épreuve</th><th class="num">Chute</th><th>Technicien</th><th>Résultat</th></tr>
    ${l.map(e => `<tr class="clickable" data-go="#/epreuve/${esc(e.id)}"><td>${esc(e.numero || '')}</td><td>${dateFr(e.date)} ${esc(e.heureDebut || '')}</td><td>${esc(e.reseau)}</td><td class="num">${e.pressionEpreuve ? `${fmt(num(e.pressionEpreuve), 1)} bar` : ''}</td>
      <td class="num">${e.chute !== undefined && e.chute !== null && e.chute !== '' ? `${fmt(num(e.chute), 2)} bar` : ''}</td><td>${esc(userName(e.userId))}</td><td>${e.statut === 'Signé' ? `<span class="badge ${e.resultat === 'Conforme' ? 'b-ok' : 'b-bad'}">${esc(e.resultat)}</span>` : '<span class="badge b-warn">Brouillon</span>'}</td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucune épreuve. Le technicien la saisit sur place (Pointage › Rapports › PV d\'épreuve) ou depuis ici.</p>'}`;
}
// Téléphone du compagnon (onglet Rapports) : PV d'essais et derniers PV
function epreuvesCompagnonHtml(u, affaireId) {
  const q = `?chantier=${esc(affaireId || '')}`, badgeR = r => (r.ligne !== undefined ? badgeReleve(r) : r.statut === 'Signé' ? `<span class="badge ${/^(Conforme|Mis en service)$/.test(r.resultat || '') ? 'b-ok' : 'b-bad'}">${esc(r.resultat || '')}</span>` : '<span class="badge b-warn">Brouillon</span>');
  const l = [...Store.all('epreuves').map(r => ['epreuve', r, r.reseau, r.pressionEpreuve ? `${fmt(num(r.pressionEpreuve), 1)} bar` : '']), ...Store.all('misesEnService').map(r => ['mes', r, r.equipement, 'mise en service']),
    ...Store.all('equilibrages').map(r => ['equilibrage', r, r.installation, 'équilibrage']), ...(Store.all('releves') || []).map(r => ['releve', r, r.ligne, 'prise de cotes'])].filter(x => x[1].userId === u.id)
    .sort((x, y) => `${y[1].date}${y[1].heureDebut || y[1].heure || ''}`.localeCompare(`${x[1].date}${x[1].heureDebut || x[1].heure || ''}`)).slice(0, 8);
  return `<div class="essais-boutons"><a class="btn secondary" href="#/epreuve/new${q}">🧪 PV d'épreuve</a><a class="btn secondary" href="#/mes/new${q}">⚙️ Mise en service</a><a class="btn secondary" href="#/equilibrage/new${q}">🌬️ Équilibrage</a><a class="btn secondary" href="#/releve/new${q}">📐 Prise de cotes</a></div>
    ${l.length ? `<ul class="mat-liste">${l.map(([k, r, nom, sub]) => `<li class="clickable" data-go="#/${k}/${esc(r.id)}"><span><strong>${esc(nom || '')}</strong><br><span class="small">${esc(affaireOf(r.affaireId).code || '')} · ${dateFr(r.date)} · ${esc(sub)}</span></span><span>${badgeR(r)}</span></li>`).join('')}</ul>` : ''}`;
}
