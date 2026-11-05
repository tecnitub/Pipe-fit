// PV de mise en service des équipements CVC et relevés d'équilibrage (aéraulique, hydraulique) : saisis sur chantier
// ou au bureau, pré-remplis (chantier, technicien, date, points de contrôle et mesures du type d'équipement, appareil de
// mesure du parc), photo de la plaque lue automatiquement, signatures ; signés, ils sont figés, imprimables, envoyés
// en PDF et repris dans le DOE (annexes F et G).

const essaiBrouillon = { mes: { cle: null, e: null }, equilibrage: { cle: null, e: null } };
const ESSAIS = {
  mes: { col: 'misesEnService', titre: 'PROCÈS-VERBAL DE MISE EN SERVICE', court: 'PV de mise en service', corps: (r, x) => EssaisDoc.miseEnService(r, x), nom: r => r.equipement },
  equilibrage: { col: 'equilibrages', titre: 'RELEVÉ D\'ÉQUILIBRAGE', court: 'Relevé d\'équilibrage', corps: (r, x) => EssaisDoc.equilibrage(r, x), nom: r => r.installation },
};
const appareilsMesure = re => Store.all('materiels').filter(m => !m.archive && /mesure|anémom|anemom|balom|débitm|debitm|manom/i.test(`${m.designation} ${m.categorie}`) && (!re || re.test(m.designation)));
const essaisDe = (col, affaireId) => Store.all(col).filter(e => e.affaireId === affaireId).sort((a, b) => `${b.date}${b.heure || ''}`.localeCompare(`${a.date}${a.heure || ''}`));
const retourEssai = e => (Store.me.role === 'atelier' ? '#/pointage/rapports' : `#/chantier/${e.affaireId}`);

function baseEssai(query) {
  const me = Store.me.userId || '', prevu = me && planJour(me, isoDate(new Date()))[0];
  const a = Store.get('affaires', query.get('chantier') || (prevu ? prevu.affaireId : '')) || {}, ct = Store.get('contacts', a.contactId) || {};
  return { affaireId: a.id || '', userId: me, date: isoDate(new Date()), heure: heureMaintenant(), photos: [], observations: '', signataireNom: ct.nom ? contactName(ct) : '', signataireQualite: ct.fonction || '', statut: 'Brouillon' };
}
// Copie pour l'équipement ou l'installation suivante : mêmes réglages, nouvelles mesures
function copieEssai(r) {
  const { id, numero, _v, _at, _by, photos, signatureTechId, signatureClientId, signeLe, statut, photoPlaqueId, planCle, materiel, attendus, ...garde } = JSON.parse(JSON.stringify(r));
  if (garde.mesures) garde.mesures = garde.mesures.map(({ attendu, ...m }) => m);
  return { ...garde, date: isoDate(new Date()), heure: heureMaintenant(), photos: [], statut: 'Brouillon', userId: Store.me.userId || garde.userId };
}
function brouillonEssai(kind, params, query, creer) {
  const id = params[0] || 'new', col = ESSAIS[kind].col, b = essaiBrouillon[kind];
  const rec = id !== 'new' && Store.get(col, id);
  if (id !== 'new' && !rec) return { introuvable: true };
  if (rec && rec.statut === 'Signé') return { signe: rec };
  const cle = id === 'new' ? `new|${query.toString()}` : id;
  if (b.cle !== cle) {
    const copie = query.get('copie') && Store.get(col, query.get('copie'));
    Object.assign(b, { cle, e: rec ? JSON.parse(JSON.stringify(rec)) : copie ? copieEssai(copie) : creer(baseEssai(query)) });
  }
  return { e: b.e };
}

/* ---------- Blocs communs ---------- */
const champEssai = (e, k, lib, type = 'text', extra = '') => `<div class="field"><label for="es-${k}">${lib}</label><input id="es-${k}" data-k="${k}" type="${type}" value="${esc(e[k] ?? '')}" ${extra}></div>`;
const enteteEssai = (e, kind, titre) => `<div class="toolbar"><a href="${retourEssai(e)}" class="btn secondary">← ${Store.me.role === 'atelier' ? 'Rapports' : 'Chantier'}</a></div>
  <h1>${titre}${e.numero ? ` ${esc(e.numero)}` : ''}</h1>`;
// Récapitulatif du chantier (repris automatiquement sur le PV) : client, site et adresse, maîtrise d'œuvre, conducteur
const recapChantierEssai = a => { if (!a) return '';
  const site = a.siteId ? siteOf(a.clientId, a.siteId) : null, adr = site ? fullAddress(site) : fullAddress((entreprise(a.clientId).adresses || [])[0]);
  const cond = a.chargeId;
  return `<div class="recap-chantier small"><strong>${esc(a.code || '')} – ${esc(a.nom || '')}</strong><br>Maître d'ouvrage : ${esc(clientName(a.clientId))}${site ? ` · ${esc(site.libelle || '')}` : ''}${adr ? `<br>📍 ${esc(adr)}` : ''}
    ${a.moeId ? `<br>Maîtrise d'œuvre : ${esc(clientName(a.moeId))}` : ''}${cond && userName(cond) ? `<br>Chargé d'affaires : ${esc(userName(cond))}` : ''}</div>`; };
const chantierTechEssai = e => { const a = Store.get('affaires', e.affaireId);
  return `${recapChantierEssai(a)}<div class="field"><label for="es-aff">Chantier</label><select id="es-aff" class="big-select">${options(chantiersActifs().concat(a && !chantiersActifs().includes(a) ? [a] : []), e.affaireId, affaireLabel)}</select></div>
    <div class="field"><label for="es-userId">Technicien</label><select id="es-userId" data-k="userId">${options(Store.all('users').filter(u => !u.archive), e.userId)}</select></div>
    ${champEssai(e, 'date', 'Date', 'date')}${champEssai(e, 'heure', 'Heure', 'time')}`; };
const photosEssai = (e, lib) => `<div class="photos-grid">${(e.photos || []).map((p, i) => `<div class="ph"><img src="${p.startsWith('data:') ? p : fileUrl(p)}" alt="Photo ${i + 1}"><button class="icon" data-rmph="${i}" aria-label="Retirer la photo">✕</button></div>`).join('')}
  <label class="ph add" for="es-photo"><span aria-hidden="true">📷</span><span class="small">${lib}</span><input id="es-photo" type="file" accept="image/*" capture="environment" multiple hidden></label></div>`;
const signaturesEssai = e => `<fieldset class="hd-bloc"><legend>Signatures</legend><div class="sign-grid">
    <div><p><strong>Le technicien</strong> · ${esc(userName(e.userId))}</p><canvas class="sign-pad" id="es-sig-t" aria-label="Signature du technicien"></canvas><button class="small secondary" id="es-sig-t-clear">Effacer</button></div>
    <div><div class="grid2">${champEssai(e, 'signataireNom', 'Pour le client (facultatif) : nom')}${champEssai(e, 'signataireQualite', 'Qualité')}</div>
      <canvas class="sign-pad" id="es-sig-c" aria-label="Signature du client"></canvas><button class="small secondary" id="es-sig-c-clear">Effacer</button></div></div></fieldset>
  <p class="neg small" id="es-err"></p>
  <div class="toolbar"><button class="secondary" id="es-brouillon">Enregistrer le brouillon</button><span class="spacer"></span><button class="big" id="es-signer">Valider et signer</button></div>`;

// Branchements communs : champs data-k, chantier, photos, signatures, enregistrement ; calc(e) -> champs calculés
function bindEssai(root, kind, e, { manques, calc, maj }) {
  const $ = s => root.querySelector(s), conf = ESSAIS[kind];
  root.querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    e[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : num(el.value)) : el.value;
    if (el.dataset.k === 'userId') App.render(); else if (maj) maj();
  }));
  $('#es-aff').onchange = () => { e.affaireId = $('#es-aff').value; App.render(); };
  $('#es-photo').onchange = async ev => { for (const f of ev.target.files) { try { e.photos.push(await compressImage(f)); } catch (err) { notify('Photo illisible.'); } } App.render(); };
  root.querySelectorAll('[data-rmph]').forEach(b => b.onclick = () => { e.photos.splice(+b.dataset.rmph, 1); App.render(); });
  const padT = signaturePad($('#es-sig-t'), img => { e.signatureTech = img; }), padC = signaturePad($('#es-sig-c'), img => { e.signatureClient = img; });
  if (e.signatureTech) padT.charger(e.signatureTech);
  if (e.signatureClient) padC.charger(e.signatureClient);
  $('#es-sig-t-clear').onclick = () => { padT.effacer(); delete e.signatureTech; };
  $('#es-sig-c-clear').onclick = () => { padC.effacer(); delete e.signatureClient; };
  const enregistrer = async signer => {
    const err = $('#es-err');
    Object.assign(e, calc(e));
    if (signer) { const m = manques(e); if (!e.signatureTech) m.push('signature du technicien'); if (m.length) { err.textContent = `À compléter : ${m.join(', ')}.`; return; } }
    else if (!e.affaireId) { err.textContent = 'Choisissez le chantier.'; return; }
    $('#es-signer').disabled = true; $('#es-brouillon').disabled = true;
    try {
      const photos = [];
      for (const p of e.photos) photos.push(p.startsWith('data:') ? await envoyerImage(p) : p);
      const o = { ...e, photos, technicien: userName(e.userId) };
      if (e._plaque) o.photoPlaqueId = await envoyerImage(e._plaque);
      ['signatureTech', 'signatureClient', '_plaque'].forEach(k => delete o[k]);
      if (signer) {
        o.signatureTechId = await envoyerImage(e.signatureTech);
        if (e.signatureClient) o.signatureClientId = await envoyerImage(e.signatureClient);
        Object.assign(o, { statut: 'Signé', signeLe: new Date().toISOString() });
      } else o.statut = 'Brouillon';
      const r = Store.upsert(conf.col, o);
      // PV de mise en service signé pour un matériel retenu : la ligne passe « mise en service » (fiche chantier, étude)
      if (signer && kind === 'mes' && o.materiel && o.affaireId && /^Mis en service$/.test(o.resultat || '')) {
        const [etudeId, ...cle] = String(o.materiel).split('|');
        HorsLigne.appeler('POST', '/api/liens/materiel/suivi', { affaireId: o.affaireId, action: 'mes', lignes: [{ etudeId, cle: cle.join('|') }] }).catch(() => {});
      }
      Object.assign(essaiBrouillon[kind], { cle: null, e: null });
      App.toast(signer ? `${conf.court} signé` : 'Brouillon enregistré', 4000);
      location.hash = signer ? `#/${kind}/${r.id}` : retourEssai(o);
    } catch (x) { $('#es-signer').disabled = false; $('#es-brouillon').disabled = false; err.textContent = x.message; }
  };
  $('#es-brouillon').onclick = () => enregistrer(false);
  $('#es-signer').onclick = () => enregistrer(true);
}

// PV signé : document, impression, PDF, e-mail, copie pour le suivant
function essaiVue(kind, r) {
  const conf = ESSAIS[kind], bureau = Store.me.role !== 'atelier', ok = /^(Conforme|Mis en service)$/.test(r.resultat || '');
  return `<div class="toolbar no-print"><a href="${retourEssai(r)}" class="btn secondary">← ${bureau ? 'Chantier' : 'Rapports'}</a><span class="spacer"></span>
    <a class="btn secondary" href="#/${kind}/new?copie=${esc(r.id)}">${kind === 'mes' ? 'Copier pour un autre équipement' : 'Copier pour une autre installation'}</a>
    <button class="secondary print-btn" data-print>Imprimer</button><button class="secondary" id="es-pdf">PDF</button>${bureau ? boutonsEnvoi(kind, r.id) : ''}</div>
  <h1 class="no-print">${conf.court} ${esc(r.numero || '')} · ${esc(conf.nom(r))} <span class="badge ${ok ? 'b-ok' : 'b-bad'}">${esc(r.resultat || '')}</span></h1>${bureau ? envoisHtml(conf.col, r.id) : ''}
  <div class="doc-print">${documentEssai(conf.titre, r, conf.corps)}</div>`;
}
const bindEssaiVue = (root, kind, r) => { const b = root.querySelector('#es-pdf'); if (b) b.onclick = () => PDF.telecharger(documentEssai(ESSAIS[kind].titre, r, ESSAIS[kind].corps), `${kind === 'mes' ? 'PV-mise-en-service' : 'Releve-equilibrage'}-${r.numero || r.id}.pdf`).catch(err => notify(err.message)); };

/* ---------- PV de mise en service ---------- */
// Valeur attendue (étude) et écart de la mesure saisie
// Écart seul (relevé par bouche / émetteur, colonne du tableau)
const ecartHtml = m => { if (m.attendu === undefined) return ''; const e = PlanMes.ecart(m), c = Essais.conformeMesure(m), t = Essais.tolerance(m.libelle, m.unite);
  return e === null ? `<span class="muted">${esc(t.texte)}</span>` : `<span class="${c ? 'pos' : 'neg'}">${e > 0 ? '+' : ''}${fmt(e, 1)} % ${c ? '✓' : '✕ hors tolérance'}</span>`; };
const attenduHtml = m => { const e = PlanMes.ecart(m), c = Essais.conformeMesure(m), t = Essais.tolerance(m.libelle, m.unite);
  return `attendu ${fmt(m.attendu, m.attendu % 1 ? 2 : 0)} ${esc(m.unite || '')} (${esc(t.texte)})${e === null ? '' : ` · <span class="${c ? 'pos' : 'neg'}">écart ${t.abs !== undefined ? (d => `${d > 0 ? '+' : ''}${fmt(d, 1)} ${/°C/.test(m.unite) ? 'K' : esc(m.unite)}`)(num(m.valeur) - m.attendu) : `${e > 0 ? '+' : ''}${fmt(e, 1)} %`} — ${c ? '✓ conforme' : '✕ hors tolérance'}</span>`}`; };
Views.mes = (params, query) => {
  // Ouvert depuis le matériel retenu d'une étude : type, équipement, marque et modèle préremplis
  const q0 = k => String(query.get(k) || '').slice(0, 200), typeQ = Essais.TYPES[q0('type')] ? q0('type') : 'pac';
  // Ouvert depuis la liste des mises en service : valeurs attendues de l'étude (débit, HMT, pressions…) à côté des mesures
  const attendus = PlanMes.lireAttendus(query.get('att'));
  // Liste de points à tester reprise de l'étude (tests point à point de la GTB)
  const ctlPlan = (() => { try { const l = JSON.parse(sessionStorage.getItem(`pf-plan-controles:${q0('plan')}`) || 'null'); return Array.isArray(l) ? l.slice(0, 400).map(x => String(x).slice(0, 120)) : null; } catch (e) { return null; } })();
  const b = brouillonEssai('mes', params, query, base => { const m = Essais.modele(typeQ); if (ctlPlan && ctlPlan.length) m.controles = [...ctlPlan.map(libelle => ({ libelle, etat: '', obs: '' })), ...m.controles];
    return { ...base, type: typeQ, equipement: q0('equipement'), repere: q0('repere'), localisation: q0('localisation'), zone: q0('zone'), marque: q0('marque'), modele: q0('modele'), numeroSerie: '', fluide: '', charge: '', reglages: '', resultat: '', ...(q0('materiel') ? { materiel: q0('materiel') } : {}),
      ...(q0('plan') ? { planCle: q0('plan') } : {}), ...(attendus.length ? { attendus } : {}), controles: m.controles, mesures: PlanMes.avecAttendus(m.mesures, attendus) }; });
  if (b.introuvable) return '<p>Procès-verbal introuvable.</p>';
  if (b.signe) return essaiVue('mes', b.signe);
  const e = b.e, t = Essais.TYPES[e.type] || Essais.TYPES.autre, ph = e._plaque || (e.photoPlaqueId ? fileUrl(e.photoPlaqueId) : '');
  const cerfa = t.frigo ? (Store.me.role === 'atelier' ? '#/pointage/fluides/miseEnService' : '#/fluides') : '';
  return `${enteteEssai(e, 'mes', 'PV de mise en service')}
  <div class="card epreuve-form">
    <fieldset class="hd-bloc"><legend>Chantier et équipement</legend><div class="grid2">${chantierTechEssai(e)}
      <div class="field"><label for="es-type">Type d'équipement</label><select id="es-type">${Object.entries(Essais.TYPES).map(([k, x]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${esc(x.libelle)}</option>`).join('')}</select></div>
      ${champEssai(e, 'equipement', 'Équipement *', 'text', 'placeholder="PAC air/eau bâtiment B, CTA 1 bureaux…"')}${champEssai(e, 'repere', 'Repère (plans)')}${champEssai(e, 'localisation', 'Localisation (pièce)')}${champEssai(e, 'zone', 'Étage / zone / bâtiment')}</div>
      <div class="eq-plaque">${ph ? `<img src="${ph}" alt="Plaque signalétique">` : ''}<label class="btn secondary">📷 ${ph ? 'Reprendre la plaque' : 'Photo de la plaque signalétique'}<input type="file" id="es-plaque" accept="image/*" capture="environment" hidden></label><span class="small muted" id="es-plaque-etat"></span></div>
      <div class="grid3">${champEssai(e, 'marque', 'Marque')}${champEssai(e, 'modele', 'Modèle')}${champEssai(e, 'numeroSerie', 'N° de série')}
        ${t.frigo ? `<div class="field"><label for="es-fluide">Fluide frigorigène</label><select id="es-fluide" data-k="fluide"><option value="">—</option>${optionsStr(Fluides.LISTE.map(x => x[0]), e.fluide)}</select></div>${champEssai(e, 'charge', 'Charge (kg)', 'number', 'step="0.01" min="0"')}` : ''}</div>
      ${cerfa ? `<p class="small">Équipement frigorifique : la mise en service s'accompagne de la <a href="${cerfa}">fiche d'intervention fluides (Cerfa)</a>.</p>` : ''}
    </fieldset>
    <fieldset class="hd-bloc"><legend>Points de contrôle</legend>
      ${e.controles.map((c, i) => `<div class="mes-ctl"><span>${esc(c.libelle)}</span><div class="seg">${Essais.ETATS.map(s => `<button type="button" class="small ${c.etat === s ? (s === 'Non conforme' ? 'danger' : '') : 'secondary'}" data-ctl="${i}" data-etat="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        ${c.etat === 'Non conforme' ? `<input data-ctlobs="${i}" value="${esc(c.obs || '')}" placeholder="Observation, action à mener" aria-label="Observation">` : ''}</div>`).join('')}
      <button class="small secondary" id="es-tout-ok">Tout OK</button>
    </fieldset>
    <fieldset class="hd-bloc"><legend>Mesures et relevés</legend><div class="grid3">
      ${e.mesures.map((m, i) => Essais.releve(m) ? '' : `<div class="field"><label for="es-m${i}">${esc(m.libelle)}${m.unite ? ` (${esc(m.unite)})` : ''}</label><input id="es-m${i}" data-mes="${i}" inputmode="decimal" value="${esc(m.valeur ?? '')}"${m.attendu !== undefined ? ` placeholder="attendu ${esc(fmt(m.attendu, m.attendu % 1 ? 2 : 0))}"` : ''}>
        ${m.attendu !== undefined ? `<span class="small muted" data-att="${i}">${attenduHtml(m)}</span>` : ''}</div>`).join('')}</div>
      ${(() => { const rl = e.mesures.map((m, i) => [m, i, Essais.releve(m)]).filter(x => x[2]); if (!rl.length) return '';
        const faits = rl.filter(([m]) => String(m.valeur ?? '').trim() !== '').length;
        return `<h4 style="margin:.8em 0 .3em">Relevé ligne par ligne — ${rl.length} ${/eau/.test(rl[0][2].grandeur) || e.type === 'reseau' ? 'émetteur(s)' : 'bouche(s)'} <span class="small muted" id="es-releve-n">${faits}/${rl.length} mesuré(s)</span></h4>
        <div style="overflow-x:auto"><table class="compact"><thead><tr><th>Repère</th><th>Pièce</th><th>Réseau, branche</th><th class="num">Attendu</th><th>Mesuré</th><th>Écart</th></tr></thead><tbody>
        ${rl.map(([m, i, r]) => `<tr><td><strong>${esc(r.repere)}</strong></td><td>${esc(r.piece)}</td><td class="small">${esc(r.detail)}</td><td class="num">${m.attendu !== undefined ? `${fmt(m.attendu, m.attendu % 1 ? 3 : 0)} ${esc(m.unite || '')}` : ''}</td>
          <td><input data-mes="${i}" inputmode="decimal" style="width:7em" value="${esc(m.valeur ?? '')}" aria-label="${esc(m.libelle)} mesuré"></td><td class="small" data-att="${i}" data-court="1">${ecartHtml(m)}</td></tr>`).join('')}</tbody></table></div>`; })()}
      ${(e.attendus || []).length ? '<p class="small muted">Valeurs attendues reprises de l\'étude : l\'écart s\'affiche dès la saisie de la mesure.</p>' : ''}
      <button class="small secondary" id="es-add-mes">+ Autre mesure</button></fieldset>
    <div class="field"><label for="es-reglages">Réglages effectués</label><textarea id="es-reglages" data-k="reglages" data-dictee rows="2" placeholder="Consignes, lois d'eau, programmations, débits…">${esc(e.reglages || '')}</textarea></div>
    <div class="field"><label for="es-obs">Observations</label><textarea id="es-obs" data-k="observations" data-dictee rows="2">${esc(e.observations || '')}</textarea></div>
    <div class="field"><label for="es-res">Conclusion</label><select id="es-res" data-k="resultat"><option value="">—</option>${optionsStr(['Mis en service', 'Mis en service avec réserves', 'Non mis en service'], e.resultat)}</select></div>
    ${photosEssai(e, 'Photo (installation, afficheur…)')}
    ${signaturesEssai(e)}
  </div>`;
};
Views.mes.bind = (root, params) => {
  const rec = params[0] && params[0] !== 'new' && Store.get('misesEnService', params[0]);
  if (rec && rec.statut === 'Signé') return bindEssaiVue(root, 'mes', rec);
  const e = essaiBrouillon.mes.e, $ = s => root.querySelector(s);
  if (!e) return;
  const proposer = () => { const c = Essais.conclusion(e); if (c && (!e.resultat || e.resultatAuto)) { e.resultat = c; e.resultatAuto = true; } };
  $('#es-type').onchange = () => {
    const vides = !e.controles.some(c => c.etat) && !e.mesures.some(m => m.valeur !== '');
    e.type = $('#es-type').value;
    if (vides) { const m = Essais.modele(e.type); Object.assign(e, { controles: m.controles, mesures: PlanMes.avecAttendus(m.mesures, e.attendus) }); }
    App.render();
  };
  root.querySelectorAll('[data-ctl]').forEach(b => b.onclick = () => { const c = e.controles[+b.dataset.ctl]; c.etat = c.etat === b.dataset.etat ? '' : b.dataset.etat; proposer(); App.render(); });
  root.querySelectorAll('[data-ctlobs]').forEach(el => el.oninput = () => { e.controles[+el.dataset.ctlobs].obs = el.value; });
  $('#es-tout-ok').onclick = () => { e.controles.forEach(c => { if (!c.etat) c.etat = 'OK'; }); proposer(); App.render(); };
  // Mesure saisie : écart, conformité et conclusion proposée mis à jour (comme le résultat d'une épreuve)
  root.querySelectorAll('[data-mes]').forEach(el => el.oninput = () => { const m = e.mesures[+el.dataset.mes]; m.valeur = el.value.trim(); const a = root.querySelector(`[data-att="${el.dataset.mes}"]`); if (a) a.innerHTML = a.dataset.court ? ecartHtml(m) : attenduHtml(m);
    const rn = root.querySelector('#es-releve-n'); if (rn) { const rl = e.mesures.filter(x => Essais.releve(x)); rn.textContent = `${rl.filter(x => String(x.valeur ?? '').trim() !== '').length}/${rl.length} mesuré(s)`; }
    const avant = e.resultat; proposer(); if (e.resultat !== avant && $('#es-res')) $('#es-res').value = e.resultat; });
  $('#es-add-mes').onclick = async () => { const lib = await askValue('Mesure (ex. Débit d\'eau, m³/h)', ''); if (!lib) return; const [l, u] = lib.split(','); e.mesures.push({ libelle: l.trim(), unite: (u || '').trim(), valeur: '' }); App.render(); };
  $('#es-res').addEventListener('change', () => { e.resultatAuto = false; });
  // Plaque signalétique : photo gardée et lue pour remplir marque, modèle, n° de série (et fluide, charge)
  $('#es-plaque').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { e._plaque = await compressImage(f, 1600, 0.8); } catch (err) { return notify('Photo illisible.'); }
    App.render();
    const etat = document.querySelector('#es-plaque-etat'); if (etat) etat.textContent = 'Lecture de la plaque…';
    try {
      const p = Fluides.lirePlaque((await PdfLecture.lire(f)).lignes), lus = [];
      [['marque', p.marque], ['modele', p.modele], ['numeroSerie', p.numeroSerie], ...(Essais.TYPES[e.type] || {}).frigo ? [['fluide', p.fluide], ['charge', p.charge]] : []].forEach(([k, v]) => { if (v !== '' && !e[k]) { e[k] = v; lus.push(v); } });
      App.render();
      const el = document.querySelector('#es-plaque-etat'); if (el) el.textContent = lus.length ? `Lu sur la plaque : ${lus.join(', ')}. Vérifiez.` : 'Plaque non lue : complétez les champs (la photo est gardée).';
    } catch (err) { const el = document.querySelector('#es-plaque-etat'); if (el) el.textContent = 'Lecture impossible : la photo est gardée.'; }
  };
  bindEssai(root, 'mes', e, { manques: Essais.manquesMES, calc: x => ({ resultat: x.resultat || Essais.conclusion(x) }) });
};

/* ---------- Relevé d'équilibrage ---------- */
const TYPES_BOUCHE = ['Soufflage', 'Reprise', 'Extraction', 'Air neuf', 'Vanne d\'équilibrage', 'Radiateur', 'Ventilo-convecteur', 'Autre'];
function synthEquilibrageHtml(q) {
  const s = Essais.synthese(q);
  return `${s.mesurees} mesuré(s) sur ${s.nb} · ${s.conformes} dans la tolérance${s.horsTolerance ? ` · <strong class="neg">${s.horsTolerance} hors tolérance</strong>` : ''} · total théorique ${fmt(s.totalTheorique, 0)} ${esc(q.unite)} · mesuré ${fmt(s.totalMesure, 0)} ${esc(q.unite)}${s.ecartGlobal !== null ? ` (${s.ecartGlobal > 0 ? '+' : ''}${fmt(s.ecartGlobal, 1)} %)` : ''}${s.resultat ? ` · <span class="badge ${s.resultat === 'Conforme' ? 'b-ok' : 'b-bad'}">${s.resultat}</span>` : ''}`;
}
const celluleEcart = (q, l) => { const e = Essais.ecart(l), c = Essais.conforme(l, q.tolerance); return e === null ? '' : `<span class="${c ? 'pos' : 'neg'}">${e > 0 ? '+' : ''}${fmt(e, 1)} %</span>`; };
Views.equilibrage = (params, query) => {
  const app = appareilsMesure().find(m => !/manom/i.test(m.designation)); // anémomètre, balomètre, valise : pas le manomètre des épreuves
  const qv = k => String(query.get(k) || '').slice(0, 200);
  const b = brouillonEssai('equilibrage', params, query, base => ({ ...base, installation: qv('installation'), type: qv('type') === 'Hydraulique' ? 'Hydraulique' : 'Aéraulique', unite: ['m³/h', 'l/s', 'l/h'].includes(qv('unite')) ? qv('unite') : 'm³/h', tolerance: 10, appareil: app ? libelleManometre(app) : '',
    ...(qv('plan') ? { planCle: qv('plan') } : {}), ...(qv('etude') && qv('installation') ? { _depuisEtude: true } : {}), lignes: [{ repere: '', local: '', type: 'Soufflage', theorique: '', mesure: '', reglage: '' }] }));
  if (b.introuvable) return '<p>Relevé introuvable.</p>';
  if (b.signe) return essaiVue('equilibrage', b.signe);
  const q = b.e;
  return `${enteteEssai(q, 'equilibrage', 'Relevé d\'équilibrage')}
  <div class="card epreuve-form">
    <fieldset class="hd-bloc"><legend>Installation</legend><div class="grid2">${chantierTechEssai(q)}
      ${champEssai(q, 'installation', 'Installation *', 'text', 'placeholder="CTA 1 bureaux R+1, VMC logements bât. A, circuit radiateurs nord…"')}
      <div class="field"><label for="es-type">Type</label><select id="es-type" data-k="type">${optionsStr(['Aéraulique', 'Hydraulique'], q.type)}</select></div>
      <div class="field"><label for="es-unite">Unité des débits</label><select id="es-unite" data-k="unite">${optionsStr(['m³/h', 'l/s', 'l/h'], q.unite)}</select></div>
      ${champEssai(q, 'tolerance', 'Tolérance (± %)', 'number', 'step="1" min="0"')}
      <div class="field"><label for="es-appareil">Appareil de mesure</label><input id="es-appareil" data-k="appareil" list="es-appareils" value="${esc(q.appareil || '')}"><datalist id="es-appareils">${appareilsMesure().map(m => `<option>${esc(libelleManometre(m))}</option>`).join('')}<option>Balomètre</option><option>Anémomètre à hélice</option><option>Valise d'équilibrage hydraulique</option></datalist></div>
    </div></fieldset>
    <fieldset class="hd-bloc"><legend>Débits ${q.type === 'Hydraulique' ? 'par organe' : 'bouche par bouche'}</legend>
      <div class="toolbar" style="margin-top:0"><label class="btn small secondary">Importer les débits théoriques (Excel, CSV)<input type="file" id="es-import" accept=".xlsx,.csv" hidden></label>
        ${q.affaireId ? '<button type="button" class="small secondary" id="es-etude">📐 Débits théoriques de l\'étude</button>' : ''}</div>
      <div class="table-wrap"><table class="eq-table"><tr><th>Repère</th><th>Local</th><th>Type</th><th class="num">Théorique</th><th class="num">Mesuré</th><th>Réglage</th><th class="num">Écart</th><th></th></tr>
        ${q.lignes.map((l, i) => `<tr><td><input data-l="${i}|repere" value="${esc(l.repere)}" aria-label="Repère"></td><td><input data-l="${i}|local" value="${esc(l.local)}" aria-label="Local"></td>
          <td><select data-l="${i}|type" aria-label="Type">${optionsStr(TYPES_BOUCHE, l.type || 'Soufflage')}</select></td>
          <td><input class="num" data-l="${i}|theorique" inputmode="decimal" value="${esc(l.theorique ?? '')}" aria-label="Débit théorique"></td><td><input class="num" data-l="${i}|mesure" inputmode="decimal" value="${esc(l.mesure ?? '')}" aria-label="Débit mesuré"></td>
          <td><input data-l="${i}|reglage" value="${esc(l.reglage || '')}" placeholder="position, ouverture" aria-label="Réglage"></td><td class="num" data-ecart="${i}">${celluleEcart(q, l)}</td><td><button class="icon" data-rml="${i}" aria-label="Retirer la ligne">✕</button></td></tr>`).join('')}</table></div>
      <button class="small secondary" id="es-add-ligne">+ Ligne</button>
      <p class="small" id="es-synth">${synthEquilibrageHtml(q)}</p></fieldset>
    <div class="field"><label for="es-obs">Observations</label><textarea id="es-obs" data-k="observations" data-dictee rows="2" placeholder="Réglages du ventilateur, organes bloqués, débits impossibles à atteindre…">${esc(q.observations || '')}</textarea></div>
    ${photosEssai(q, 'Photo')}
    ${signaturesEssai(q)}
  </div>`;
};
Views.equilibrage.bind = (root, params) => {
  const rec = params[0] && params[0] !== 'new' && Store.get('equilibrages', params[0]);
  if (rec && rec.statut === 'Signé') return bindEssaiVue(root, 'equilibrage', rec);
  const q = essaiBrouillon.equilibrage.e, $ = s => root.querySelector(s);
  if (!q) return;
  const maj = () => { q.lignes.forEach((l, i) => { const c = root.querySelector(`[data-ecart="${i}"]`); if (c) c.innerHTML = celluleEcart(q, l); }); $('#es-synth').innerHTML = synthEquilibrageHtml(q); };
  root.querySelectorAll('[data-l]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const [i, k] = el.dataset.l.split('|');
    q.lignes[+i][k] = ['theorique', 'mesure'].includes(k) ? (el.value.trim() === '' ? '' : num(el.value)) : el.value;
    maj();
  }));
  root.querySelectorAll('[data-rml]').forEach(b => b.onclick = () => { q.lignes.splice(+b.dataset.rml, 1); App.render(); });
  $('#es-add-ligne').onclick = () => { const d = q.lignes[q.lignes.length - 1] || {}; q.lignes.push({ repere: '', local: d.local || '', type: d.type || 'Soufflage', theorique: '', mesure: '', reglage: '' }); App.render(); };
  // Débits théoriques des études du chantier (schéma aéraulique : bouche par bouche ; réseau arborescent : par vanne)
  const be = $('#es-etude');
  if (be) be.onclick = async () => {
    let installs;
    try { installs = await api('GET', `/api/liens/debits?affaireId=${encodeURIComponent(q.affaireId)}`); } catch (err) { return notify(err.message); }
    const voulues = installs.filter(x => (x.type === 'Hydraulique') === (q.type === 'Hydraulique'));
    if (!voulues.length) return notify(`Aucun débit ${q.type === 'Hydraulique' ? 'hydraulique' : 'aéraulique'} dans les études de ce chantier.`);
    const nommee = voulues.find(x => PlanMes.norm(x.installation) === PlanMes.norm(q.installation));
    const choisir = nommee || voulues.length === 1 ? nommee || voulues[0] : voulues[(await askValue(`Installation (1 à ${voulues.length}) : ${voulues.map((x, i) => `${i + 1}. ${x.installation}`).join(' · ')}`, '1') | 0) - 1];
    if (!choisir) return;
    q.installation = q.installation || choisir.installation; q.unite = choisir.unite || q.unite;
    q.lignes = [...q.lignes.filter(x => x.repere || x.local || x.theorique !== ''), ...choisir.lignes.map(l => ({ repere: l.repere, local: l.local, type: TYPES_BOUCHE.includes(l.type) ? l.type : 'Autre', theorique: l.theorique, mesure: '', reglage: '' }))];
    App.render(); App.toast(`${choisir.lignes.length} débit(s) théorique(s) repris de l'étude « ${choisir.etude} »`, 4000);
  };
  // Ouvert depuis la liste des mises en service : débits théoriques de l'installation repris tout de suite
  if (be && q._depuisEtude) { delete q._depuisEtude; be.onclick(); }
  $('#es-import').onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try {
      const buf = await f.arrayBuffer(), feuilles = /\.csv$/i.test(f.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
      const l = Essais.importerLignes(feuilles[0].rows).map(x => ({ ...x, type: TYPES_BOUCHE.find(t => t.toLowerCase() === String(x.type).toLowerCase()) || (q.type === 'Hydraulique' ? 'Vanne d\'équilibrage' : 'Soufflage') }));
      if (!l.length) return notify('Aucune ligne reconnue (colonnes attendues : repère, local, débit théorique).');
      q.lignes = [...q.lignes.filter(x => x.repere || x.local || x.theorique !== ''), ...l]; App.render();
      App.toast(`${l.length} ligne(s) importée(s)`);
    } catch (err) { notify(`Lecture impossible : ${err.message}`); }
  };
  bindEssai(root, 'equilibrage', q, { manques: Essais.manquesEQ, calc: x => ({ resultat: Essais.synthese(x).resultat }), maj });
};

/* ---------- Fiche chantier et téléphone ---------- */
function essaisChantierHtml(a) {
  const mes = essaisDe('misesEnService', a.id), eqs = essaisDe('equilibrages', a.id);
  const badgeEssai = r => (r.statut === 'Signé' ? `<span class="badge ${/^(Conforme|Mis en service)$/.test(r.resultat || '') ? 'b-ok' : 'b-bad'}">${esc(r.resultat || '')}</span>` : '<span class="badge b-warn">Brouillon</span>');
  return `<div id="plan-mes" data-affaire="${esc(a.id)}">${planMesHtml(a, false)}</div>
  <h2>Mises en service et équilibrages <span class="muted small">${mes.length + eqs.length}</span></h2>
  <div class="toolbar"><a class="btn secondary small" href="#/mes/new?chantier=${esc(a.id)}">+ PV de mise en service</a><a class="btn secondary small" href="#/equilibrage/new?chantier=${esc(a.id)}">+ Relevé d'équilibrage</a></div>
  ${mes.length || eqs.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Document</th><th>Équipement / installation</th><th>Technicien</th><th>Résultat</th></tr>
    ${[...mes.map(r => ['mes', r, 'Mise en service', r.equipement]), ...eqs.map(r => ['equilibrage', r, `Équilibrage ${(r.type || '').toLowerCase()}`, `${r.installation} · ${Essais.synthese(r).nb} point(s)`])]
      .sort((x, y) => (y[1].date || '').localeCompare(x[1].date || '')).map(([k, r, doc, lib]) => `<tr class="clickable" data-go="#/${k}/${esc(r.id)}"><td>${esc(r.numero || '')}</td><td>${dateFr(r.date)}</td><td>${doc}</td><td>${esc(lib)}</td><td>${esc(userName(r.userId))}</td><td>${badgeEssai(r)}</td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucun PV de mise en service ni relevé d\'équilibrage.</p>'}
  <p class="small muted">Signés, les PV d'épreuve, de mise en service, les relevés d'équilibrage et les fiches fluides du chantier sont repris automatiquement dans le DOE (annexes F et G, listes de contrôle cochées).</p>`;
}
