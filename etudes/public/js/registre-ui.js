// Registre des équipements de l'étude : un modèle par fiche, placé dans les calculs (terminaux, CTA, production, pompes,
// robinetterie, bouches, points de puisage…). Corriger une valeur ou remplacer la fiche met à jour tous les emplacements.
function resumeEquipement(x) {
  const v = x.valeurs || {}, f = (y, d = 1) => (Number.isFinite(y) ? String(Math.round(y * 10 ** d) / 10 ** d).replace('.', ',') : '');
  const r = {
    cta: [v.Qs && `${f(v.Qs, 0)} m³/h`, v.PchBC && `chaud ${f(v.PchBC)} kW`, v.PfrBF && `froid ${f(v.PfrBF)} kW`],
    terminal: [v.Pch && `chaud ${f(v.Pch, 2)} kW`, v.Pfr && `froid ${f(v.Pfr, 2)} kW`, v.Pvent && `${f(v.Pvent, 0)} W`],
    bouche: [v.Q && `${f(v.Q, 0)} m³/h`, v.dp && `${f(v.dp, 0)} Pa`, v.Lw && `${f(v.Lw, 0)} dB(A)`],
    robinet: [v.dn && `DN ${v.dn}`, v.kv && `Kvs ${f(v.kv, 2)}`, v.dp && `${f(v.dp)} kPa`, v.abaque && 'abaque'],
    sanitaire: [v.q && `${f(v.q, 2)} L/s`, v.pMin && `${f(v.pMin)} bar`],
    pompe: [v.Q && v.H && `${f(v.Q, 2)} m³/h × ${f(v.H)} mCE`, v.P1 && `${f(v.P1, 0)} W`, v.courbe && 'courbe'],
    vase: [v.V && `${f(v.V, 0)} L`, v.p0 && `${f(v.p0)} bar`],
    ecs: [v.V && `${f(v.V, 0)} L`, v.P && `${f(v.P)} kW`],
    generateur: [v.P && `${f(v.P, 0)} kW`, v.Pfr && `froid ${f(v.Pfr, 0)} kW`, v.P1 && `${f(v.P1 / 1000)} kW élec.`],
  }[x.type] || [];
  return r.filter(Boolean).join(' · ') || `${Object.keys(v).length} valeur(s)`;
}

function carteRegistre(et) {
  const b = Registre.bilan(et), n = b.reduce((s, y) => s + y.emplacements.length, 0), libres = b.filter(y => !y.emplacements.length).length;
  return `<div class="carte petit">🗂️ <strong>Registre des équipements</strong> : ${b.length ? `${b.length} modèle(s) · ${n} emplacement(s) dans les calculs${libres ? ` · <span class="avert">${libres} à placer</span>` : ''}` : 'vide — chargez les fiches du chantier en vrac : chaque modèle est saisi une fois et réparti dans les calculs'}
    <button class="secondaire petit" id="registre">Ouvrir le registre</button> <button class="secondaire petit" id="vrac2">📥 Matériel en vrac</button></div>`;
}

function dialogueRegistre(et) {
  const box = Modal.open('');
  box.classList.add('large');
  const ouverts = new Map(); // modèle → zone ouverte (valeurs, fiche, placer)
  const changer = msg => { const k = Registre.propager(et); enregistrer(et); rendu(); if (msg) toast(`${msg}${k ? ` — ${k} valeur(s) mise(s) à jour dans les calculs` : ''}`, 5000); };
  const zoneHtml = (x, z) => {
    if (z === 'valeurs') {
      const L = Registre.libelles(), cles = Object.keys(x.valeurs || {});
      return `<table class="edit"><thead><tr><th>Donnée</th><th>Valeur</th><th></th></tr></thead><tbody>${cles.map(k => `<tr><td>${esc((L[k] || [k])[0])} <span class="muted petit">${esc((L[k] || ['', ''])[1] || '')}</span></td><td><input data-rg-v="${esc(k)}" value="${esc(String(x.valeurs[k]).replace(/^(-?\d+)\.(\d+)$/, '$1,$2'))}"></td><td><button class="icone" data-rg-vsuppr="${esc(k)}" title="Retirer">✕</button></td></tr>`).join('')}</tbody></table>
        <p class="petit"><label>Ajouter une donnée <select id="rg-vplus"><option value="">—</option>${Object.entries(L).filter(([k]) => !cles.includes(k)).map(([k, d]) => `<option value="${esc(k)}">${esc(d[0])}${d[1] ? ` (${esc(d[1])})` : ''}</option>`).join('')}</select></label></p>
        <div class="actions" style="justify-content:flex-start"><button class="petit" id="rg-vok">Enregistrer les valeurs</button></div>`;
    }
    if (z === 'fiche') return `<p class="petit muted">La nouvelle fiche remplace le modèle partout où il est placé (même type d'équipement).</p>
      <p><label class="btn petit">💻 Choisir le PDF ou la fiche texte<input type="file" id="rg-ffichier" accept=".pdf,application/pdf,image/*,.txt,.md,text/plain" hidden></label></p>
      <textarea id="rg-ftexte" rows="5" style="width:100%" placeholder="Ou collez la fiche au format Pipe-Fit"></textarea><button class="secondaire petit" id="rg-flire">Lire la fiche collée</button>`;
    if (z === 'placer') {
      const d = Vrac.destinations(et, x.type), circ = [...new Set(et.notes.filter(n => n.type === 'pid').flatMap(n => (n.entrees.circuits || []).filter(c => c.rep).map(c => c.rep)))];
      if (!d.length) return '<p class="petit muted">Aucun calcul de l\'étude ne reçoit ce type d\'équipement : ajoutez d\'abord le calcul (schéma de principe, réseau arborescent, schéma aéraulique en arborescence, sanitaire…).</p>';
      return `<div class="grille-champs"><label>Placer dans<select id="rg-pcible">${d.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
        <label>Quantité<input id="rg-pqte" type="number" min="1" value="1"></label><label>Local (plusieurs : « Bureau 1 ; Salle ×2 »)<input id="rg-plocal" placeholder="Bureau 1 ; Salle de réunion ×2"></label>
        <label>Branche (raccordement)<select id="rg-pbranche"></select></label>
        ${x.type === 'terminal' && circ.length ? `<label>Circuit du schéma de principe<select id="rg-pcircuit"><option value="">—</option>${circ.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>` : ''}</div>
        <div class="actions" style="justify-content:flex-start"><button class="petit" id="rg-pok">Placer</button></div>`;
    }
    return '';
  };
  const rendu = () => {
    const b = Registre.bilan(et), types = Object.keys(Registre.TYPES).filter(t => b.some(y => y.x.type === t));
    box.innerHTML = `<h2>🗂️ Registre des équipements</h2>
      <p class="muted petit">Chaque modèle (fabricant, référence, valeurs de la fiche) est saisi une seule fois. Les calculs qui l'utilisent en reprennent les valeurs, verrouillées : corriger une valeur ou remplacer la fiche ici met à jour toutes les lignes, branches et circuits. « Détacher » rend un emplacement modifiable à la main.</p>
      <div class="actions" style="justify-content:flex-start"><button id="rg-vrac">📥 Ajouter des fiches (matériel en vrac)</button></div>
      ${b.length ? types.map(t => `<h3>${esc(Registre.TYPES[t])}</h3>${b.filter(y => y.x.type === t).map(y => {
        const x = y.x, z = ouverts.get(x.id);
        return `<div class="carte" style="margin:.4em 0"><strong>${esc(y.nom)}</strong>${x.variante ? ` <span class="badge">variante ${x.variante}</span>` : ''} <span class="muted petit">${esc(resumeEquipement(x))}</span>
          <div class="petit">${y.emplacements.length ? `Placé ${y.emplacements.length} fois : ${y.emplacements.map((p, k) => `<span class="puce" style="white-space:nowrap">${esc(p.libelle)} <button class="icone" data-rg-det="${x.id}|${k}" title="Détacher : valeurs gardées, modifiables à la main">✂️</button></span>`).join(' · ')}` : '<span class="avert">À placer dans un calcul</span>'}</div>
          <div class="actions" style="justify-content:flex-start;margin:.3em 0 0">${[['valeurs', '✏️ Valeurs'], ['fiche', '🔁 Remplacer la fiche'], ['placer', '➕ Placer']].map(([k, l]) => `<button class="${z === k ? '' : 'secondaire '}petit" data-rg-z="${x.id}|${k}">${l}</button>`).join('')}<button class="secondaire petit" data-rg-suppr="${x.id}">🗑️ Retirer</button></div>
          ${z ? `<div class="rg-zone" data-rg-zone="${x.id}">${zoneHtml(x, z)}</div>` : ''}</div>`; }).join('')}`).join('') : '<p class="muted">Registre vide : ajoutez les fiches du chantier (matériel en vrac) ou chargez une fiche dans un calcul.</p>'}
      <div class="actions"><button class="secondaire" id="rg-x">Fermer</button></div>`;
    box.querySelector('#rg-x').onclick = () => { Modal.close(); App.render(); };
    box.querySelector('#rg-vrac').onclick = () => dialogueVrac(et);
    box.querySelectorAll('[data-rg-z]').forEach(el => el.onclick = () => { const [id, z] = el.dataset.rgZ.split('|'); ouverts.set(id, ouverts.get(id) === z ? '' : z); rendu(); });
    box.querySelectorAll('[data-rg-det]').forEach(el => el.onclick = () => {
      const [id, k] = el.dataset.rgDet.split('|'), y = b.find(w => w.x.id === id), p = y && y.emplacements[+k]; if (!p) return;
      Registre.detacher(p); enregistrer(et); rendu(); toast(`${p.libelle} : détaché du registre, valeurs modifiables à la main`, 4000);
    });
    box.querySelectorAll('[data-rg-suppr]').forEach(el => el.onclick = async () => {
      const y = b.find(w => w.x.id === el.dataset.rgSuppr);
      if (!await confirmer(`Retirer ${y.nom} du registre ? ${y.emplacements.length ? `Ses ${y.emplacements.length} emplacement(s) gardent leurs valeurs, modifiables à la main.` : ''}`, 'Retirer')) return dialogueRegistre(et);
      Registre.supprimer(et, y.x.id); enregistrer(et); dialogueRegistre(et);
    });
    box.querySelectorAll('[data-rg-zone]').forEach(zone => {
      const x = Registre.parId(et, zone.dataset.rgZone), q = s => zone.querySelector(s);
      if (q('#rg-vok')) {
        const lireValeurs = () => { const v = {}; zone.querySelectorAll('[data-rg-v]').forEach(i => { const t = i.value.trim(); if (t !== '') v[i.dataset.rgV] = /^-?\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : t; }); return v; };
        zone.querySelectorAll('[data-rg-vsuppr]').forEach(bt => bt.onclick = () => { x.valeurs = lireValeurs(); delete x.valeurs[bt.dataset.rgVsuppr]; rendu(); });
        q('#rg-vplus').onchange = ev => { if (!ev.target.value) return; x.valeurs = { ...lireValeurs(), [ev.target.value]: '' }; rendu(); };
        q('#rg-vok').onclick = () => { x.valeurs = lireValeurs(); changer(`${Registre.nomEq(x)} : valeurs enregistrées`); };
      }
      if (q('#rg-flire')) {
        const remplacer = (lignes, nom) => {
          const lu = Vrac.lire(x.type, lignes);
          if (!lu.nb) return toast('Aucune caractéristique reconnue dans cette fiche.', 4000);
          Object.assign(x, { fabricant: lu.fabricant || x.fabricant, reference: lu.reference || x.reference, valeurs: lu.valeurs, nom: String(nom || '').slice(0, 120) }); delete x.variante;
          ouverts.set(x.id, ''); changer(`Fiche remplacée : ${Registre.nomEq(x)}`);
        };
        q('#rg-flire').onclick = () => { const t = q('#rg-ftexte').value; if (t.trim()) remplacer(t.split(/\r?\n/), 'Fiche au format Pipe-Fit'); };
        q('#rg-ffichier').onchange = async ev => {
          const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
          try { remplacer(/^text\//.test(f.type || '') || /\.(txt|md)$/i.test(f.name || '') ? (await f.text()).split(/\r?\n/) : (await PdfLecture.lire(f, () => {}, { pagesMax: 12, ocr: typeof OCR !== 'undefined' })).lignes, f.name); } catch (e) { toast(`Lecture impossible : ${e.message}`, 5000); }
        };
      }
      if (q('#rg-pbranche')) {
        const majBr = () => { const br = Registre.branches(et, q('#rg-pcible').value); q('#rg-pbranche').innerHTML = `<option value="">${br.length ? '— à choisir plus tard —' : 'aucune branche pour cette destination'}</option>${br.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}`; };
        q('#rg-pcible').onchange = majBr; majBr();
      }
      if (q('#rg-pok')) q('#rg-pok').onclick = () => {
        const m = Registre.placer(et, x, q('#rg-pcible').value, { qte: q('#rg-pqte').value, local: q('#rg-plocal').value, branche: q('#rg-pbranche') ? q('#rg-pbranche').value : '', circuit: q('#rg-pcircuit') ? q('#rg-pcircuit').value : '' }, nouvelleNote);
        if (!m) return toast('Placement impossible : calcul introuvable.', 4000);
        ouverts.set(x.id, ''); changer(m);
      };
    });
  };
  rendu();
}
// Bandeau d'un calcul relié au registre : bouton d'ouverture
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ouvrir-registre]'); if (!b) return;
  const m = /#\/etude\/([^/]+)/.exec(location.hash), et = m && S.etudes.find(x => x.id === m[1]);
  if (et) dialogueRegistre(et);
});
