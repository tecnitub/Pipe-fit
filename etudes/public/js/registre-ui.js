// Registre des équipements de l'étude : un modèle par fiche, placé dans les calculs (terminaux, CTA, production, pompes,
// robinetterie, bouches, points de puisage…). Corriger une valeur ou remplacer la fiche met à jour tous les emplacements.
function resumeEquipement(x) {
  const v = x.valeurs || {}, f = (y, d = 1) => (Number.isFinite(y) ? String(Math.round(y * 10 ** d) / 10 ** d).replace('.', ',') : '');
  const r = {
    cta: [v.Qs && `${f(v.Qs, 0)} m³/h`, v.PchBC && `chaud ${f(v.PchBC)} kW`, v.PfrBF && `froid ${f(v.PfrBF)} kW`],
    regulateur: [v.app && `application ${v.app}`, v.X !== undefined && `${v.X} entrées`, v.Y !== undefined && `${v.Y} sorties 0-10 V`, v.Q !== undefined && `${v.Q} relais`],
    terminal: [v.Pch && `chaud ${f(v.Pch, 2)} kW`, v.Pfr && `froid ${f(v.Pfr, 2)} kW`, v.Pvent && `${f(v.Pvent, 0)} W`],
    bouche: [v.Q && `${f(v.Q, 0)} m³/h`, v.dp && `${f(v.dp, 0)} Pa`, v.Lw && `${f(v.Lw, 0)} dB(A)`],
    robinet: [v.dn && `DN ${v.dn}`, v.kv && `Kvs ${f(v.kv, 2)}`, v.dp && `${f(v.dp)} kPa`, v.abaque && 'abaque'],
    sanitaire: [v.q && `${f(v.q, 2)} L/s`, v.pMin && `${f(v.pMin)} bar`],
    pompe: [v.Q && v.H && `${f(v.Q, 2)} m³/h × ${f(v.H)} mCE`, v.P1 && `${f(v.P1, 0)} W`, v.courbe && 'courbe'],
    vase: [v.V && `${f(v.V, 0)} L`, v.p0 && `${f(v.p0)} bar`],
    ecs: [v.V && `${f(v.V, 0)} L`, v.P && `${f(v.P)} kW`],
    generateur: [v.P && `${f(v.P, 0)} kW`, v.Pfr && `froid ${f(v.Pfr, 0)} kW`, v.P1 && `${f(v.P1 / 1000)} kW élec.`],
    tampon: [v.V && `${f(v.V, 0)} L`, v.pmax && `${f(v.pmax)} bar`],
    fumee: [v.P && `${f(v.P, 0)} kW`, v.D && `Ø ${f(v.D, 0)} mm`, v.H && `H ${f(v.H)} m`, v.Tf && `fumées ${f(v.Tf, 0)} °C`],
    capteur: [v.grandeur && `capteur de ${Registre.GRANDEURS[v.grandeur] || v.grandeur}`, v.sortie && `sortie ${Vrac.SORTIES[v.sortie] || v.sortie}`, v.alim && `alim. ${v.alim === '24V' ? '24 V' : v.alim === 'mono' ? '230 V' : v.alim}`],
    accessoireSan: [`sans calcul : matériel retenu et DOE${x.qte > 1 ? ` · ${x.qte} u` : ''}`],
  }[x.type] || [];
  return r.filter(Boolean).join(' · ') || (typeof FicheAnnexes !== 'undefined' && FicheAnnexes.resume(x.type, v)) || `${Object.keys(v).length} valeur(s)`;
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
  const attente = new Map(); // modèle → fiche de gamme lue, en attente du choix du modèle (remplacement de la fiche)
  // Modèle de gamme conseillé d'après le premier emplacement du modèle (puissance, volume, débit, DN du calcul)
  const conseil = (x, lu) => { const p = Registre.emplacements(et).find(y => y.eq === x.id); return Vrac.modeleConseille(et, x.type, lu, p ? Vrac.cibleEmplacement(p) : ''); };
  const choixModele = (id, modeles, k) => `<label class="petit">Modèle de la gamme <select id="${id}"><option value="">— à choisir —</option>${modeles.map((m, j) => `<option value="${j}" ${j === k ? 'selected' : ''}>${esc(Vrac.libelleModele(m))}</option>`).join('')}</select></label>`;
  const changer = msg => { const k = Registre.propager(et); enregistrer(et); rendu(); if (msg) toast(`${msg}${k ? ` — ${k} valeur(s) mise(s) à jour dans les calculs` : ''}`, 5000); };
  const zoneHtml = (x, z) => {
    if (z === 'valeurs') {
      const L = Registre.libelles(), cles = Object.keys(x.valeurs || {});
      return `<table class="edit"><thead><tr><th>Donnée</th><th>Valeur</th><th></th></tr></thead><tbody>${cles.map(k => `<tr><td>${esc((L[k] || [k])[0])} <span class="muted petit">${esc((L[k] || ['', ''])[1] || '')}</span></td><td><input data-rg-v="${esc(k)}" value="${esc(String(x.valeurs[k]).replace(/^(-?\d+)\.(\d+)$/, '$1,$2'))}"></td><td><button class="icone" data-rg-vsuppr="${esc(k)}" title="Retirer">✕</button></td></tr>`).join('')}</tbody></table>
        <p class="petit"><label>Ajouter une donnée <select id="rg-vplus"><option value="">—</option>${Object.entries(L).filter(([k]) => !cles.includes(k)).map(([k, d]) => `<option value="${esc(k)}">${esc(d[0])}${d[1] ? ` (${esc(d[1])})` : ''}</option>`).join('')}</select></label></p>
        <div class="actions" style="justify-content:flex-start"><button class="petit" id="rg-vok">Enregistrer les valeurs</button></div>`;
    }
    if (z === 'fiche' && attente.has(x.id)) {
      const { lu } = attente.get(x.id);
      return `<p class="petit">Documentation de gamme (${esc(lu.gamme)}) : choisissez le modèle retenu ; ses valeurs remplacent celles du modèle partout où il est placé.</p>
        ${choixModele('rg-fmodele', lu.modeles, conseil(x, lu))}
        <div class="actions" style="justify-content:flex-start"><button class="petit" id="rg-fmok">Remplacer par ce modèle</button><button class="secondaire petit" id="rg-fmx">Annuler</button></div>`;
    }
    if (z === 'fiche') return `<p class="petit muted">La nouvelle fiche remplace le modèle partout où il est placé (même type d'équipement).</p>
      <p><label class="btn petit">💻 Choisir le PDF ou la fiche texte<input type="file" id="rg-ffichier" accept=".pdf,application/pdf,image/*,.txt,.md,text/plain" hidden></label></p>
      <textarea id="rg-ftexte" rows="5" style="width:100%" placeholder="Ou collez la fiche au format Pipe-Fit"></textarea><button class="secondaire petit" id="rg-flire">Lire la fiche collée</button>`;
    if (z === 'placer') {
      const d = Vrac.destinations(et, x.type), circ = [...new Set(et.notes.filter(n => n.type === 'pid').flatMap(n => (n.entrees.circuits || []).filter(c => c.rep).map(c => c.rep)))];
      // Matériel sans calcul (accessoire sanitaire) : quantité de la ligne du matériel retenu
      if (!d.length && Registre.LIBRES[x.type]) return `<p class="petit muted">Matériel sans calcul : une ligne du matériel retenu (et du DOE) pour ce modèle.</p>
        <div class="grille-champs"><label>Quantité<input id="rg-lqte" type="number" min="1" value="${esc(String(x.qte || 1))}"></label></div><div class="actions" style="justify-content:flex-start"><button class="petit" id="rg-lok">Enregistrer la quantité</button></div>`;
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
        return `<div class="carte" style="margin:.4em 0"><strong>${esc(y.nom)}</strong>${x.variante ? ` <span class="badge">variante ${x.variante}</span>` : ''}${x.gamme ? ' <span class="badge avert" title="Documentation de gamme : les valeurs du modèle ne sont reprises qu\'une fois le modèle choisi">gamme : modèle à choisir</span>' : ''} <span class="muted petit">${esc(resumeEquipement(x))}</span>
          ${x.gamme && (x.gamme.modeles || []).length ? `<div class="petit">${choixModele(`rg-gm-${x.id}`, x.gamme.modeles, conseil(x, x.gamme))} <button class="petit" data-rg-gamme="${x.id}">Retenir ce modèle</button></div>` : ''}
          <div class="petit">${y.emplacements.length ? `Placé ${y.emplacements.length} fois : ${y.emplacements.map((p, k) => `<span class="puce" style="white-space:nowrap">${esc(p.libelle)} <button class="icone" data-rg-det="${x.id}|${k}" title="Détacher : valeurs gardées, modifiables à la main">✂️</button></span>`).join(' · ')}` : '<span class="avert">À placer dans un calcul</span>'}</div>
          <div class="actions" style="justify-content:flex-start;margin:.3em 0 0">${[['valeurs', '✏️ Valeurs'], ['fiche', '🔁 Remplacer la fiche'], ['placer', '➕ Placer']].map(([k, l]) => `<button class="${z === k ? '' : 'secondaire '}petit" data-rg-z="${x.id}|${k}">${l}</button>`).join('')}<button class="secondaire petit" data-rg-suppr="${x.id}">🗑️ Retirer</button></div>
          ${z ? `<div class="rg-zone" data-rg-zone="${x.id}">${zoneHtml(x, z)}</div>` : ''}</div>`; }).join('')}`).join('') : '<p class="muted">Registre vide : ajoutez les fiches du chantier (matériel en vrac) ou chargez une fiche dans un calcul.</p>'}
      <div class="actions"><button class="secondaire" id="rg-x">Fermer</button></div>`;
    box.querySelector('#rg-x').onclick = () => { Modal.close(); App.render(); };
    box.querySelector('#rg-vrac').onclick = () => dialogueVrac(et);
    box.querySelectorAll('[data-rg-z]').forEach(el => el.onclick = () => { const [id, z] = el.dataset.rgZ.split('|'); ouverts.set(id, ouverts.get(id) === z ? '' : z); rendu(); });
    // Modèle de la gamme retenu : valeurs et référence reportées dans tous les calculs où le modèle est placé
    box.querySelectorAll('[data-rg-gamme]').forEach(el => el.onclick = () => {
      const x = Registre.parId(et, el.dataset.rgGamme), s = box.querySelector(`#rg-gm-${x.id}`);
      if (!s || s.value === '') return toast('Choisissez d\'abord le modèle de la gamme.', 3000);
      Registre.choisirModele(x, +s.value); changer(`Modèle retenu : ${Registre.nomEq(x)}`);
    });
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
          const lu = Vrac.lire(x.type, lignes, nom);
          // Documentation de gamme : choix du modèle avant de remplacer la fiche
          if (lu.modeles && lu.modeles.length) { attente.set(x.id, { lu, nom }); return rendu(); }
          if (!lu.nb && !lu.gamme) return toast('Aucune caractéristique reconnue dans cette fiche.', 4000);
          remplacerPar(lu, nom);
        };
        q('#rg-flire').onclick = () => { const t = q('#rg-ftexte').value; if (t.trim()) remplacer(t.split(/\r?\n/), 'Fiche au format Pipe-Fit'); };
        q('#rg-ffichier').onchange = async ev => {
          const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
          try { remplacer(/^text\//.test(f.type || '') || /\.(txt|md)$/i.test(f.name || '') ? (await f.text()).split(/\r?\n/) : (await PdfLecture.lire(f, () => {}, { pagesMax: 12, ocr: typeof OCR !== 'undefined' })).lignes, f.name); } catch (e) { toast(`Lecture impossible : ${e.message}`, 5000); }
        };
      }
      // Fiche remplacée par un modèle (ou par une gamme dont le modèle reste à choisir : aucune valeur de modèle reprise)
      function remplacerPar(lu, nom) {
        Object.assign(x, { fabricant: lu.fabricant || x.fabricant, reference: lu.reference || (lu.gamme ? '' : x.reference), valeurs: lu.valeurs, nom: String(nom || '').slice(0, 120) }); delete x.variante;
        if (Vrac.aChoisir(lu)) x.gamme = { titre: lu.gamme, modeles: lu.modeles || [], ...(lu.refGamme ? { refGamme: lu.refGamme } : {}) }; else delete x.gamme;
        attente.delete(x.id); ouverts.set(x.id, ''); changer(`Fiche remplacée : ${Registre.nomEq(x)}${x.gamme ? ' (gamme : modèle à choisir)' : ''}`);
      }
      if (q('#rg-fmok')) {
        q('#rg-fmok').onclick = () => { const { lu, nom } = attente.get(x.id), k = q('#rg-fmodele').value; remplacerPar(k === '' ? lu : Vrac.choisirModele(lu, +k), nom); };
        q('#rg-fmx').onclick = () => { attente.delete(x.id); rendu(); };
      }
      if (q('#rg-lok')) q('#rg-lok').onclick = () => { x.qte = Math.max(1, Math.round(Number(q('#rg-lqte').value) || 1)); ouverts.set(x.id, ''); changer(`${Registre.nomEq(x)} : quantité ${x.qte}`); };
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

/* ---------- Parcours de l'étude : étapes, progression, une action en un clic pour ce qui manque ---------- */
function etapesEtude(et) {
  const notes = et.notes || [], b = Registre.bilan(et), libres = b.filter(y => !y.emplacements.length).length;
  const eau = a => !['aucune', 'elec', 'electrique'].includes(a.batterie || 'chaude') && !Terminaux.estPompe(a.type);
  const raccordes = new Set(notes.filter(n => n.type === 'arbo').flatMap(n => (n.entrees.troncons || []).map(t => t && t.emetteur).filter(Boolean)));
  const terms = notes.filter(n => n.type === 'terminaux').flatMap(n => (n.entrees.appareils || []).filter(a => a && a.rep && eau(a)).map(a => ({ n, a })));
  const termLibres = terms.filter(({ n, a }) => !raccordes.has(`${n.id}:${a.rep}`)), bouchesLibres = Registre.schemasAir(et).flatMap(n => (n.entrees.bouchesL || []).filter(x => x && (x.rep || x.Q) && !String(x.troncon || '').trim()).map(x => ({ n, x })));
  const rep = Registre.reperesAReprendre(et);
  let erreurs = 0, noteErreur = null;
  notes.forEach(n => { try { const k = Liens.calculer(et, n).alertes.filter(a => a.niveau === 'erreur').length; erreurs += k; if (k && !noteErreur) noteErreur = n; } catch (e) { /* calcul incomplet */ } });
  let fiches = 0, lignes = 0;
  try { const pts = PointsMes.extraire(et, n => Liens.calculer(et, n)).filter(p => p.nature === 'mes'); fiches = pts.length; lignes = pts.reduce((s, p) => s + (p.attendus || []).filter(a => / — .* · |^Débit \S+ · /.test(a.libelle)).length, 0); } catch (e) { /* étude incomplète */ }
  const arbo = notes.find(n => n.type === 'arbo'), aero = (bouchesLibres[0] || {}).n;
  const e = [
    { ico: '📥', titre: 'Charger les fiches', fait: b.length > 0, info: b.length ? `${b.length} modèle(s) au registre` : 'Toutes les fiches du chantier d\'un coup', action: ['vrac', '📥 Charger les fiches'] },
    { ico: '📍', titre: 'Placer dans les pièces', fait: b.length > 0 && !libres, info: !b.length ? '—' : libres ? `${libres} modèle(s) à placer` : `${b.reduce((s, y) => s + y.emplacements.length, 0)} emplacement(s)`, action: ['registre', '📍 Placer'] },
    { ico: '🔢', titre: 'Un repère unique chacun', fait: !rep, info: rep ? `${rep} repère(s) manquant(s) ou en double` : 'Terminaux et bouches numérotés', action: ['reperes', '🔢 Tout numéroter'] },
    { ico: '🌀', titre: 'Raccorder aux réseaux', fait: !termLibres.length && !bouchesLibres.length, info: termLibres.length || bouchesLibres.length ? [termLibres.length && `${termLibres.length} terminal(aux) hors réseau hydraulique`, bouchesLibres.length && `${bouchesLibres.length} bouche(s) sans branche`].filter(Boolean).join(', ') : 'Chaque émetteur a sa branche',
      action: termLibres.length ? (arbo ? ['note:' + arbo.id, '🌀 Raccorder les terminaux'] : ['creer-arbo', '🌳 Créer le réseau et raccorder']) : aero ? ['note:' + aero.id, '🌀 Choisir les branches'] : null },
    { ico: '🧮', titre: 'Calculs sans erreur', fait: !erreurs, info: erreurs ? `${erreurs} erreur(s) à corriger` : 'Tous les calculs sont cohérents', action: noteErreur ? ['note:' + noteErreur.id, `➡️ Voir ${noteErreur.titre.slice(0, 28)}`] : null },
    { ico: '📋', titre: 'Mise en service prête', fait: false, info: fiches ? `${fiches} fiche(s)${lignes ? `, ${lignes} ligne(s) de relevé` : ''}` : 'Aucune fiche', action: fiches ? ['fiches-mes', '📋 Fiches de mise en service'] : null },
  ];
  e[5].fait = fiches > 0 && e.slice(0, 5).every(x => x.fait);
  return e;
}
function parcoursHtml(et) {
  if (et.modele || !(et.notes || []).length) return '';
  let e; try { e = etapesEtude(et); } catch (err) { return ''; }
  const faits = e.filter(x => x.fait).length, pct = Math.round(faits / e.length * 100), cur = e.findIndex(x => !x.fait);
  return `<div class="carte parcours"><div class="parcours-tete"><strong>${pct === 100 ? '🎉 Étude prête : tout est relié, rien à ressaisir' : `🧭 Parcours de l'étude — ${pct} %`}</strong>
      <div class="parcours-barre"><span style="width:${pct}%"></span></div></div>
    <ol class="parcours-etapes">${e.map((x, i) => `<li class="${x.fait ? 'fait' : i === cur ? 'actuelle' : ''}"><span class="pastille">${x.fait ? '✓' : x.ico}</span><span class="txt"><strong>${esc(x.titre)}</strong><span class="petit">${esc(x.info)}</span>
      ${!x.fait && x.action ? `<button class="${i === cur ? '' : 'secondaire '}petit" data-parcours="${esc(x.action[0])}">${esc(x.action[1])}</button>` : ''}</span></li>`).join('')}</ol></div>`;
}
function lierParcours(root, et) {
  root.querySelectorAll('[data-parcours]').forEach(b => b.onclick = () => {
    const a = b.dataset.parcours;
    if (a === 'vrac') return dialogueVrac(et);
    if (a === 'registre') return dialogueRegistre(et);
    if (a === 'fiches-mes') return dialogueFichesMes(et);
    if (a === 'reperes') { const k = Registre.numeroterTout(et); enregistrer(et); App.render(); return toast(`${k} repère(s) attribué(s) : chaque terminal et chaque bouche a son numéro unique.`, 5000); }
    if (a === 'creer-arbo') { const n = nouvelleNote('arbo'); n.titre = 'Réseau hydraulique des terminaux'; n.entrees.troncons = [{ rep: 'C', amont: '', nom: 'Départ pompe → collecteur', L: 10, zeta: 4, tube: '', P: '', Q: '', dpEm: '' }]; et.notes.push(n); enregistrer(et); location.hash = `#/etude/${et.id}/${n.id}`; return setTimeout(() => { const x = document.querySelector('#arbo-emetteurs'); if (x) x.click(); }, 400); }
    if (a.startsWith('note:')) {
      const id = a.slice(5), n = et.notes.find(x => x.id === id); location.hash = `#/etude/${et.id}/${id}`;
      // Réseau arborescent : la liste des émetteurs à raccorder s'ouvre directement
      if (n && n.type === 'arbo') setTimeout(() => { const x = document.querySelector('#arbo-emetteurs'); if (x) x.click(); }, 400);
    }
  });
}
