// Guide pas à pas de l'étude : « Reste à faire » après l'import du dossier de consultation (CCTP / DPGF), dans l'ordre
// logique d'une étude — données (climat, type de bâtiment), dossier (écarts), calculs à créer, bilans, valeurs vides ou par
// défaut à confirmer, valeurs reprises avec une faible confiance (avec leur source), raccordements, fiches techniques,
// régulation, électricité, émission des notes, envoi au chantier. Chaque action manquante a un bouton qui y mène ;
// progression en %, étape suivante mise en avant. restesAFaire(et) est une fonction pure (testée sous Node).
const GuideEtude = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const Nt = () => essai(() => (typeof Notes !== 'undefined' ? Notes : require('./notes')));
  const Ln = () => essai(() => (typeof Liens !== 'undefined' ? Liens : require('./liens')));
  const In = () => essai(() => (typeof Installation !== 'undefined' ? Installation : require('./installation')));
  const Rg = () => essai(() => (typeof Registre !== 'undefined' ? Registre : require('./registre')));
  const Cp = () => essai(() => (typeof ConsignesProjet !== 'undefined' ? ConsignesProjet : require('./consignes-projet')));
  const Ic = () => essai(() => (typeof InventaireCVC !== 'undefined' ? InventaireCVC : require('../../../public/js/inventaire-cvc')));
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const vide = v => v === '' || v === undefined || v === null;
  const libNote = (et, n) => `N${(et.notes || []).indexOf(n) + 1} — ${n.titre || n.type}`;

  // Groupes, dans l'ordre d'une étude
  const GROUPES = [['donnees', '🏢', 'Données de l\'étude'], ['dossier', '📑', 'Dossier de consultation'], ['calculs', '🧮', 'Calculs à créer'], ['bilans', '🌡️', 'Bilans'],
    ['valeurs', '✏️', 'Valeurs à confirmer'], ['verifier', '🔎', 'Valeurs reprises à vérifier'], ['raccordement', '🌀', 'Raccordements'], ['fiches', '📄', 'Fiches techniques'],
    ['regulation', '🎛️', 'Régulation'], ['electricite', '⚡', 'Électricité'], ['emission', '📨', 'Émission des notes'], ['chantier', '🏗️', 'Envoi au chantier']];
  const GROUPE = Object.fromEntries(GROUPES.map(([k, i, l]) => [k, { ico: i, libelle: l }]));

  // Lignes « à saisir » d'un calcul (liste, colonne de puissance ou de débit vide) : circuits, terminaux, zones, générateurs
  const COLONNES_CLES = { pid: [['circuits', ['P'], 'Puissance du circuit'], ['generateurs', ['P'], 'Puissance du générateur']], terminaux: [['appareils', ['Pch', 'Pfr'], 'Puissance du terminal']],
    aero: [['zones', ['Q'], 'Débit de la zone']], elec: [['equipements', ['P'], 'Puissance électrique']] };
  // Valeurs vides (un champ qui a une valeur par défaut mais qu'on a vidé) et valeurs restées par défaut d'un calcul
  function valeursNote(n) {
    const N = Nt(), T = N && N.TYPES[n.type];
    if (!T) return { vides: [], defauts: [] };
    const e = n.entrees || {}, vides = [], defauts = [];
    (T.champs || []).forEach(c => {
      if (!c.k || c.t === 'lignes' || c.t === 'cases' || !c.u) return;
      if (c.si && !essai(() => c.si(e))) return;
      if (c.d === undefined || vide(c.d)) return;
      if (vide(e[c.k])) vides.push(c.l);
      else if (num(e[c.k]) === num(c.d)) defauts.push(c.l);
    });
    (COLONNES_CLES[n.type] || []).forEach(([k, cols, lib]) => (e[k] || []).forEach((l, i) => {
      if (l && cols.every(c => vide(l[c]))) vides.push(`${lib} « ${l.rep || l.designation || i + 1} »`);
    }));
    return { vides, defauts };
  }

  // Étapes : { id, groupe, titre, info, fait, action: [code, libellé], confirmer?: code }
  function restesAFaire(et) {
    const notes = (et && et.notes) || [], inv = ((et && et.inventaire) || []).filter(x => x.inclus !== false && !x.variante), out = [];
    const a = (groupe, id, titre, fait, info, action, extra = {}) => out.push({ id, groupe, titre, fait: !!fait, info: info || '', action: action || null, ...extra });
    const aType = t => notes.some(n => n.type === t);

    // 1. Données de l'étude
    a('donnees', 'climat', 'Climat du site', et.climat, et.climat ? 'Températures de base reprises dans les calculs' : 'Températures extérieures de base des bilans, CTA et lois d\'eau', ['champ:climat', '🌡️ Choisir le climat']);
    a('donnees', 'typeBatiment', 'Type de bâtiment', et.typeBatiment, et.typeBatiment ? 'Usage repris par les calculs et la régulation' : 'Usage, consignes et horaires types, réglementation', ['champ:typeBatiment', '🏢 Choisir le type']);

    // 2. Dossier de consultation : import, écarts entre le CCTP et le DPGF
    if (inv.length || !notes.length) a('dossier', 'import', 'Lire le CCTP et le DPGF', inv.length, inv.length ? `${inv.length} équipement(s) à l'inventaire` : 'Équipements, réseaux et caractéristiques repris du dossier', ['inventaire', '📑 Lire le dossier']);
    const ecarts = (et.inventaireEcarts || []).length;
    if (ecarts) a('dossier', 'ecarts', 'Lever les écarts CCTP / DPGF', et.inventaireEcartsTraites, `${ecarts} écart(s) : questions à poser pendant la consultation`, ['inventaire-revoir', '❓ Voir les écarts']);

    // 3. Calculs à créer d'après l'inventaire
    if (inv.length) {
      const G = g => inv.some(x => g.includes(x.genre));
      if (inv.some(x => x.categorie === 'producteur') || G(['radiateurs', 'plancher', 'radiant', 'plafond'])) a('calculs', 'creer-pid', 'Schéma de principe', aType('pid'), aType('pid') ? 'Créé' : 'Production, circuits, ballons et montages repris du dossier', ['creer:pid', '🗺️ Créer le schéma']);
      if (G(['cta', 'bouche-soufflage', 'bouche-extraction', 'ventilateur'])) a('calculs', 'creer-aero', 'Schéma aéraulique et CTA', aType('aero') || aType('cta'), aType('aero') || aType('cta') ? 'Créé' : 'Batteries, récupérateur, débits et bouches repris du dossier', ['creer:aero', '🌬️ Créer']);
      if (G(['ventilo', 'split', 'aerotherme'])) a('calculs', 'creer-terminaux', 'Terminaux', aType('terminaux'), aType('terminaux') ? 'Créés' : 'Type, puissances, batterie et vanne de chaque terminal', ['creer:terminaux', '🌀 Créer les terminaux']);
    }

    // 4. Bilans : les puissances des circuits et des terminaux doivent être justifiées
    if (notes.some(n => ['pid', 'terminaux', 'cta', 'arbo'].includes(n.type)) || inv.length) {
      const bil = notes.filter(n => ['bilan', 'pieces'].includes(n.type));
      a('bilans', 'bilans', 'Bilans thermiques', bil.length, bil.length ? `${bil.length} bilan(s)` : 'Puissances reprises du dossier à justifier (déperditions, apports)', ['ajout:pieces', '🌡️ Faire le bilan pièce par pièce']);
    }

    // 5. Valeurs vides ou restées par défaut dans chaque calcul
    notes.forEach(n => {
      const { vides, defauts } = valeursNote(n);
      if (!vides.length && !defauts.length) return;
      const l = [...vides.map(x => `${x} (vide)`), ...defauts].slice(0, 4).join(', '), reste = vides.length + defauts.length - 4;
      a('valeurs', `valeurs:${n.id}`, `Confirmer les valeurs de ${libNote(et, n)}`, !vides.length && (!defauts.length || n.defautsConfirmes),
        `${vides.length ? `${vides.length} vide(s)` : ''}${vides.length && defauts.length ? ', ' : ''}${defauts.length ? `${defauts.length} par défaut` : ''} : ${l}${reste > 0 ? ` et ${reste} autre(s)` : ''}`,
        [`note:${n.id}`, '✏️ Ouvrir le calcul'], vides.length ? {} : { confirmer: `confirmer:${n.id}` });
    });

    // 6. Valeurs reprises du dossier avec une faible confiance (conflit CCTP / DPGF, valeur déduite) : à vérifier, source citée
    const I = Ic();
    if (I && I.aVerifier) {
      const lots = (et.inventaire || []).filter(x => x.inclus !== false && !x.variante).map(x => [x, I.aVerifier(x)]).filter(([, v]) => v.length);
      lots.forEach(([x, v], k) => {
        if (k >= 8) return;
        a('verifier', `verifier:${x.id || k}`, `Vérifier ${x.repere ? `${x.repere} ` : ''}${x.designation}`, x.verifie, v.slice(0, 3).map(y => `${y.libelle} : ${y.texte}`).join(' ; ') + (v.length > 3 ? ` (+${v.length - 3})` : ''),
          ['inventaire-revoir', '🔎 Vérifier dans l\'inventaire'], { source: v.map(y => y.texte).join(' ; ') });
      });
      if (lots.length > 8) a('verifier', 'verifier:autres', `Vérifier ${lots.length - 8} autre(s) équipement(s)`, lots.slice(8).every(([x]) => x.verifie), 'Valeurs reprises avec une faible confiance', ['inventaire-revoir', '🔎 Ouvrir l\'inventaire']);
    }

    // 7. Raccordements : consommateurs d'eau non raccordés, incohérences de l'installation, erreurs des calculs
    const Ins = In();
    if (Ins && notes.some(n => ['pid', 'arbo', 'terminaux', 'cta', 'ecs'].includes(n.type))) {
      const cs = essai(() => Ins.consommateurs(et)) || [], libres = cs.filter(c => !(c.raccordements || []).length);
      a('raccordement', 'raccordes', 'Raccorder chaque consommateur', !libres.length, libres.length ? `${libres.length} non raccordé(s) : ${libres.slice(0, 3).map(c => c.libelle).join(', ')}${libres.length > 3 ? '…' : ''}` : `${cs.length} consommateur(s), tous raccordés`, ['installation', '💧 Installation hydraulique']);
      const err = (essai(() => Ins.controles(et, cs)) || []).filter(c => c.niveau === 'erreur');
      if (err.length) a('raccordement', 'installation-erreurs', 'Corriger l\'installation', false, err.slice(0, 2).map(c => c.texte).join(' ; '), ['installation', '💧 Voir les contrôles']);
    }
    const L = Ln();
    if (L && notes.length) {
      let erreurs = 0, premiere = null;
      notes.forEach(n => { const k = (essai(() => L.calculer(et, n).alertes) || []).filter(x => x.niveau === 'erreur').length; erreurs += k; if (k && !premiere) premiere = n; });
      a('raccordement', 'erreurs', 'Calculs sans erreur', !erreurs, erreurs ? `${erreurs} erreur(s), d'abord dans ${libNote(et, premiere)}` : 'Tous les calculs sont cohérents', premiere ? [`note:${premiere.id}`, '➡️ Voir l\'erreur'] : null);
    }

    // 8. Fiches techniques : registre des équipements, gros équipements de l'inventaire sans fiche
    const R = Rg();
    if (R && notes.length) {
      const b = essai(() => R.bilan(et)) || [], libres = b.filter(y => !y.emplacements.length).length;
      const gros = inv.filter(x => x.categorie === 'producteur' || x.genre === 'cta').reduce((s, x) => s + Math.max(1, Math.round(num(x.qte) || 1)), 0);
      const fichesGros = b.filter(y => ['generateur', 'cta'].includes(y.x.type)).length, manque = Math.max(0, gros - fichesGros);
      a('fiches', 'fiches', 'Fiches techniques du matériel', b.length && !manque, b.length ? `${b.length} modèle(s) au registre${manque ? ` ; ${manque} producteur(s) / CTA du dossier sans fiche` : ''}` : `Aucune fiche${gros ? ` (${gros} producteur(s) / CTA au dossier)` : ''}`, ['vrac', '📥 Charger les fiches']);
      if (b.length) a('fiches', 'placer', 'Placer les fiches dans les calculs', !libres, libres ? `${libres} modèle(s) à placer` : 'Toutes placées', ['registre', '📍 Ouvrir le registre']);
    }

    // 9. Régulation (zones, consignes) et 10. électricité
    const elec = notes.find(n => n.type === 'elec');
    if (notes.length || inv.length) {
      if (!elec) a('regulation', 'creer-elec', 'Régulation et alimentation électrique', false, 'Équipements, armoires, points de régulation, GTB', inv.length ? ['creer:elec', '⚡ Créer d\'après le dossier'] : ['ajout:elec', '⚡ Créer le calcul']);
      else {
        const C = Cp(), e = elec.entrees || {}, defaut = C ? essai(() => C.estDefaut(e.consignesZones)) : false;
        a('regulation', 'zones', 'Zones, consignes et horaires', !defaut, defaut ? 'Consignes types : à préciser par zone (préremplir depuis l\'étude)' : `${(e.consignesZones || []).length} zone(s) définie(s)`, [`note:${elec.id}`, '🎛️ Préciser les zones']);
        const I2 = Ic(), reg = I2 && I2.versRegulation ? I2.versRegulation(et.inventaire || []).entrees : {};
        if (reg.marqueAutomate || reg.gtb) a('regulation', 'marque', 'Régulation prescrite au CCTP', (!reg.marqueAutomate || e.marqueAutomate === reg.marqueAutomate) && (!reg.gtb || e.gtb === reg.gtb), `CCTP : ${[reg.marqueAutomate, reg.gtb, reg.busEquip].filter(Boolean).join(', ')}`, [`note:${elec.id}`, '🎛️ Vérifier']);
        const eq = (e.equipements || []).filter(l => l && (l.rep || l.designation)), sansP = eq.filter(l => vide(l.P));
        a('electricite', 'elec-puissances', 'Puissances électriques', eq.length && !sansP.length, !eq.length ? 'Aucun équipement : « Mettre à jour depuis l\'étude »' : sansP.length ? `${sansP.length} équipement(s) sans puissance : ${sansP.slice(0, 3).map(l => l.rep || l.designation).join(', ')}` : `${eq.length} équipement(s) renseigné(s)`, [`note:${elec.id}`, '⚡ Compléter']);
      }
    }

    // 11. Émission des notes, 12. envoi au chantier
    if (notes.length) {
      const nonEmises = notes.filter(n => !(n.emissions || []).length);
      a('emission', 'emission', 'Émettre les notes de calcul', !nonEmises.length, nonEmises.length ? `${nonEmises.length} note(s) jamais émise(s)` : 'Toutes émises', ['pdf', '📄 Note de calcul PDF']);
      a('chantier', 'chantier', 'Relier l\'étude au chantier', et.affaireId, et.affaireId ? 'Étude reliée au chantier Pipe-Fit' : 'Matériel, mises en service et devis suivent le chantier', ['champ:affaireId', '🔗 Choisir le chantier']);
      a('chantier', 'diffusion', 'Diffuser au chantier', (et.diffusions || []).length, (et.diffusions || []).length ? `${et.diffusions.length} envoi(s)` : 'Bordereau de transmission et documents émis', ['diffuser', '📨 Diffuser']);
    }

    const faits = out.filter(x => x.fait).length, total = out.length, pct = total ? Math.round(faits / total * 100) : 100;
    return { etapes: out, faits, total, pct, suivante: out.find(x => !x.fait) || null };
  }

  /* ---------- Affichage (navigateur) ---------- */
  // Liste détaillée ouverte ou fermée par l'utilisateur : gardée d'un affichage à l'autre
  let ouvert = null;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function html(et) {
    if (!et || et.modele) return '';
    const r = essai(() => restesAFaire(et));
    if (!r || !r.total) return '';
    const s = r.suivante, restes = r.etapes.filter(x => !x.fait);
    const bouton = (x, principal) => `${x.action ? `<button class="${principal ? '' : 'secondaire '}petit" data-guide="${esc(x.action[0])}">${esc(x.action[1])}</button>` : ''}${x.confirmer ? `<button class="secondaire petit" data-guide="${esc(x.confirmer)}" title="Les valeurs par défaut conviennent">✓ C'est bon</button>` : ''}`;
    const parGroupe = GROUPES.map(([g]) => [g, restes.filter(x => x.groupe === g)]).filter(([, l]) => l.length);
    return `<div class="carte guide-etude" id="guide-etude"><div class="parcours-tete"><strong>${r.pct === 100 ? '✅ Reste à faire : rien, l\'étude est complète' : `📝 Reste à faire — ${r.pct} %`}</strong>
        <div class="parcours-barre" role="progressbar" aria-valuenow="${r.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${r.pct}%"></span></div><span class="petit muted">${r.faits} / ${r.total}</span></div>
      ${s ? `<div class="guide-suivante"><span class="guide-ico">${GROUPE[s.groupe].ico}</span><span class="guide-txt"><span class="petit muted">Étape suivante · ${esc(GROUPE[s.groupe].libelle)}</span><strong>${esc(s.titre)}</strong><span class="petit">${esc(s.info)}</span></span><span class="guide-actions">${bouton(s, true)}</span></div>` : ''}
      ${restes.length > 1 ? `<details class="guide-liste"${ouvert ?? restes.length <= 6 ? ' open' : ''}><summary>${restes.length - 1} autre(s) action(s) à faire</summary>
        ${parGroupe.map(([g, l]) => `<h4>${GROUPE[g].ico} ${esc(GROUPE[g].libelle)}</h4><ul>${l.filter(x => x !== s).map(x => `<li><span class="guide-txt"><strong>${esc(x.titre)}</strong><span class="petit">${esc(x.info)}</span></span><span class="guide-actions">${bouton(x, false)}</span></li>`).join('')}</ul>`).join('')}</details>` : ''}</div>`;
  }
  // Actions des boutons : app = { dialogueInventaire, tableauInventaire, creerCalculInventaire, nouvelleNote, enregistrer, ... } (globales)
  function lier(root, et) {
    const dl = root.querySelector('.guide-liste');
    if (dl) dl.addEventListener('toggle', () => { ouvert = dl.open; });
    root.querySelectorAll('[data-guide]').forEach(b => b.onclick = () => {
      const a = b.dataset.guide, [code, arg] = [a.split(':')[0], a.slice(a.indexOf(':') + 1)];
      if (code === 'champ') {
        const el = document.querySelector(`[data-e="${arg}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); el.classList.add('guide-cible'); setTimeout(() => el.classList.remove('guide-cible'), 2500); }
        return;
      }
      if (code === 'inventaire') return dialogueInventaire(et);
      if (code === 'inventaire-revoir') return tableauInventaire(et, (et.inventaire || []).map(x => ({ ...x })), [], (et.inventaireReseaux || []).map(r => ({ ...r })), { ecarts: et.inventaireEcarts || [] });
      if (code === 'creer') return creerCalculInventaire(et, arg);
      if (code === 'ajout') { const n = nouvelleNote(arg); et.notes.push(n); enregistrer(et); location.hash = `#/etude/${et.id}/${n.id}`; return; }
      if (code === 'note') { location.hash = `#/etude/${et.id}/${arg}`; return; }
      if (code === 'confirmer') { const n = et.notes.find(x => x.id === arg); if (n) { n.defautsConfirmes = true; enregistrer(et); App.render(); } return; }
      if (code === 'installation') { location.hash = `#/etude/${et.id}/installation`; return; }
      if (code === 'vrac') return dialogueVrac(et);
      if (code === 'registre') return dialogueRegistre(et);
      if (code === 'pdf') return genererNoteCalcul(et);
      if (code === 'diffuser') { const d = document.querySelector('#doc-diffuser'); if (d && !d.disabled) { d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.click(); } else { const c = document.querySelector('#doc-liste') || d; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Émettez d\'abord une note de calcul (PDF), puis diffusez-la.', 5000); } }
    });
  }
  return { restesAFaire, valeursNote, html, lier, GROUPES };
})();
if (typeof module !== 'undefined') module.exports = GuideEtude;
