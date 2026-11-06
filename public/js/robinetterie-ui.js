// Paramètres de la prise de cotes : robinetterie de l'entreprise (cotes réelles des fabricants, saisies ou lues sur une
// fiche technique PDF) et hauteurs des brides par pression nominale (fiches du fournisseur de brides).

const RAC_ROBI = { taraude: 'Taraudé', bride: 'À brides / entre brides' };
let robiBrouillon = null, bridesBrouillon = null;
const cotesTexte = d => Object.entries(d || {}).sort((a, b) => a[0] - b[0]).map(([dn, v]) => `${dn}:${String(v).replace('.', ',')}`).join(' ; ');
const lireCotesTexte = t => Object.fromEntries(String(t || '').split(/[;\n]+/).map(x => x.trim().split(/\s*[:=]\s*/)).filter(x => x.length === 2 && +x[0] > 0 && Number(x[1].replace(',', '.')) > 0).map(([a, b]) => [String(+a), Number(b.replace(',', '.'))]));

function robinetterieCarte() {
  const s = Store.data.settings || {}, l = robiBrouillon || (robiBrouillon = JSON.parse(JSON.stringify(s.robinetterie || [])));
  const base = Tuyauterie.catalogue().filter(x => !l.some(y => `${y.fabricant} ${y.modele}`.trim() === x.id));
  const types = Object.fromEntries(Object.entries(Tuyauterie.VANNES).map(([k, v]) => [k, v.lib]));
  return `<h2>Prise de cotes : robinetterie et brides</h2>
  <div class="card">
    <p class="small muted" style="margin-top:0">Cotes réelles des fabricants (longueur dans l'axe, mm, par DN) proposées sur chaque vanne de la prise de cotes à la place des cotes normalisées EN 558. ${base.length} modèle(s) déjà fournis (fiches techniques transmises) ; ajoutez les vôtres, ou lisez une fiche technique PDF.</p>
    <details><summary class="small">Modèles fournis (${base.length})</summary><ul class="small">${base.map(x => `<li>${esc(x.id)} — ${esc(types[x.type] || x.type)}, ${esc(RAC_ROBI[x.raccordement] || '')} : ${esc(cotesTexte(x.dimensions))}</li>`).join('')}</ul></details>
    <div class="table-wrap"><table class="compact" id="robi-table"><tr><th>Fabricant</th><th>Modèle</th><th>Type</th><th>Raccordement</th><th>Cotes « DN:mm ; … »</th><th></th></tr>
      ${l.map((x, i) => `<tr><td><input data-robi="${i}" data-k="fabricant" value="${esc(x.fabricant || '')}"></td><td><input data-robi="${i}" data-k="modele" value="${esc(x.modele || '')}"></td>
        <td><select data-robi="${i}" data-k="type">${Object.entries(types).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
        <td><select data-robi="${i}" data-k="raccordement">${Object.entries(RAC_ROBI).map(([k, v]) => `<option value="${k}" ${x.raccordement === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
        <td><input data-robi="${i}" data-k="cotes" value="${esc(cotesTexte(x.dimensions))}" placeholder="15:84 ; 20:94 ; 25:105" style="min-width:16em"></td><td><button class="icon" data-robi-sup="${i}" aria-label="Retirer">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted small">Aucun modèle de l\'entreprise.</td></tr>'}</table></div>
    <div class="toolbar"><button class="small secondary" id="robi-ajout">+ Modèle</button><label class="btn small secondary">📄 Lire une fiche technique (PDF)<input type="file" id="robi-pdf" accept="application/pdf,image/*" hidden></label><span class="spacer"></span><button class="small" id="robi-save">Enregistrer la robinetterie</button></div>
  </div>
  ${bridesCarte()}`;
}

function bridesCarte() {
  const h = bridesBrouillon || (bridesBrouillon = JSON.parse(JSON.stringify(((Store.data.settings || {}).brides || {}).hauteurs || {})));
  const PNS = ['PN10', 'PN16', 'PN25', 'PN40'];
  return `<div class="card" style="margin-top:10px">
    <p class="small muted" style="margin-top:0">Hauteur des brides à collerette (mm, de la face de joint au bout de la collerette), par pression nominale, d'après la fiche de votre fournisseur. Case vide : valeur PN16 indicative (grisée), signalée sur le relevé. L'épaisseur du joint se choisit sur chaque relevé (fibre 2 mm, PTFE 3 mm, spiralé ≈ 3,3 mm serré).</p>
    <div class="table-wrap"><table class="compact"><tr><th>DN</th>${PNS.map(p => `<th>${p}</th>`).join('')}</tr>
      ${Tuyauterie.DN.map(dn => `<tr><td>DN${dn}</td>${PNS.map(p => `<td><input data-bride="${p}|${dn}" value="${esc(String((h[p] || {})[dn] ?? '').replace('.', ','))}" placeholder="${Tuyauterie.BRIDE[dn][1]}" inputmode="decimal" style="width:5em"></td>`).join('')}</tr>`).join('')}</table></div>
    <div class="toolbar"><span class="spacer"></span><button class="small" id="brides-save">Enregistrer les brides</button></div></div>`;
}

function bindRobinetterie(root) {
  if (!root.querySelector('#robi-table')) return;
  const l = robiBrouillon;
  root.querySelectorAll('[data-robi]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const x = l[+el.dataset.robi]; if (!x) return;
    if (el.dataset.k === 'cotes') x.dimensions = lireCotesTexte(el.value); else x[el.dataset.k] = el.value;
  }));
  root.querySelectorAll('[data-robi-sup]').forEach(b => b.onclick = () => { l.splice(+b.dataset.robiSup, 1); App.render(); });
  root.querySelector('#robi-ajout').onclick = () => { l.push({ fabricant: '', modele: '', type: 'boisseau', raccordement: 'taraude', dimensions: {} }); App.render(); };
  root.querySelector('#robi-save').onclick = async () => {
    const ok = l.filter(x => String(x.fabricant || '').trim() && String(x.modele || '').trim() && Object.keys(x.dimensions || {}).length);
    try { await Store.saveSettings({ ...Store.data.settings, robinetterie: ok }); robiBrouillon = null; Tuyauterie.definirCatalogue(ok); App.toast(`${ok.length} modèle(s) enregistré(s)`); App.render(); } catch (e) { notify(e.message); }
  };
  root.querySelector('#robi-pdf').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    App.toast('Lecture de la fiche…', 2500);
    try {
      const lignes = (await PdfLecture.lire(f)).lignes, t = Tuyauterie.lireCotesFiche(lignes);
      if (!t.lignes.length) return notify('Aucun tableau de dimensions reconnu sur la fiche : saisissez les cotes à la main.');
      dialogueCotesFiche(f.name, t, x => { l.push(x); App.render(); });
    } catch (e) { notify(`Lecture impossible : ${e.message}`); }
    ev.target.value = '';
  };
  root.querySelectorAll('[data-bride]').forEach(el => el.oninput = () => { const [p, dn] = el.dataset.bride.split('|'), v = Number(el.value.replace(',', '.')); bridesBrouillon[p] = bridesBrouillon[p] || {}; if (v > 0) bridesBrouillon[p][dn] = v; else delete bridesBrouillon[p][dn]; });
  root.querySelector('#brides-save').onclick = async () => {
    try { await Store.saveSettings({ ...Store.data.settings, brides: { hauteurs: bridesBrouillon } }); Tuyauterie.definirBrides({ hauteurs: bridesBrouillon }); bridesBrouillon = null; App.toast('Hauteurs des brides enregistrées'); App.render(); } catch (e) { notify(e.message); }
  };
}

// Tableau reconnu sur la fiche : on choisit la colonne de la longueur dans l'axe (lettre du plan : L, A, B…)
function dialogueCotesFiche(nom, t, valider) {
  const cols = Math.max(...t.lignes.map(x => x.valeurs.length));
  const box = Modal.open(`<h2 style="margin-top:0">Cotes lues sur ${esc(nom)}</h2>
    <p class="small">Choisissez la colonne qui donne la <strong>longueur dans l'axe de la tuyauterie</strong> (repérez la lettre sur le plan de la fiche), puis vérifiez les valeurs.</p>
    <div class="grid2"><div class="field"><label>Fabricant</label><input id="cf-fab" value="${esc(t.fabricant || '')}"></div><div class="field"><label>Modèle</label><input id="cf-mod" value="${esc(t.modele || '')}"></div>
      <div class="field"><label>Type</label><select id="cf-type">${Object.entries(Tuyauterie.VANNES).map(([k, v]) => `<option value="${k}">${esc(v.lib)}</option>`).join('')}</select></div>
      <div class="field"><label>Raccordement</label><select id="cf-rac">${Object.entries(RAC_ROBI).map(([k, v]) => `<option value="${k}" ${t.taraude && k === 'taraude' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>
    <div class="table-wrap"><table class="compact"><tr><th>Taille lue</th><th>DN</th>${Array.from({ length: cols }, (_, i) => `<th><label><input type="radio" name="cf-col" value="${i}" ${i === t.colonne ? 'checked' : ''}> col. ${i + 1}</label></th>`).join('')}</tr>
      ${t.lignes.map(x => `<tr><td>${esc(x.taille)}</td><td>DN${x.dn}</td>${Array.from({ length: cols }, (_, i) => `<td>${x.valeurs[i] ?? ''}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="modal-actions"><button class="secondary" id="cf-annuler">Annuler</button><button id="cf-ok">Ajouter le modèle</button></div>`);
  box.querySelector('#cf-annuler').onclick = Modal.close;
  box.querySelector('#cf-ok').onclick = () => {
    const c = +((box.querySelector('[name="cf-col"]:checked') || {}).value ?? t.colonne), dims = Object.fromEntries(t.lignes.filter(x => x.valeurs[c] > 0).map(x => [String(x.dn), x.valeurs[c]]));
    valider({ fabricant: box.querySelector('#cf-fab').value.trim(), modele: box.querySelector('#cf-mod').value.trim(), type: box.querySelector('#cf-type').value, raccordement: box.querySelector('#cf-rac').value, dimensions: dims });
    Modal.close();
  };
}
