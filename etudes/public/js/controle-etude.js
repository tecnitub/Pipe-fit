// Contrôle global de l'étude avant envoi : passe tout en revue et produit un rapport (écran, PDF / impression) —
// erreurs et points d'attention des calculs, valeurs estimées non confirmées, valeurs par défaut ou vides, paramètres
// « à valider » des séquences de régulation, réserves de conformité ouvertes, gammes au modèle non choisi, matériel non
// choisi / non validé, incohérences entre calculs (puissance du bâtiment et des circuits, débit des CTA et air neuf
// réglementaire, armoire et équipements de l'étude, liaisons CTA ambiguës, raccordements), fiches techniques manquantes
// du matériel retenu, et ce qui reste du guide « Reste à faire ». Chaque point : gravité, note d'origine, lien pour y
// aller (codes d'action du guide). Le destinataire (interne, bureau de contrôle, client) filtre le contenu.
// Réutilise guide-etude.js, liens.js, estimations.js, annexes-exploitation.js, registre.js, metre.js et
// materiel-retenu.js (aucun calcul refait). controler(et, opts) est une fonction pure (testée sous Node).
const ControleEtude = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  // Modules de l'application (globales du navigateur, sinon require sous Node)
  const M = (g, chemin) => () => essai(() => g()) || essai(() => require(chemin));
  const G = { Notes: M(() => Notes, './notes'), Liens: M(() => Liens, './liens'), GuideEtude: M(() => GuideEtude, './guide-etude'), Estimations: M(() => Estimations, './estimations'),
    AnnexesExploitation: M(() => AnnexesExploitation, './annexes-exploitation'), Registre: M(() => Registre, './registre'), Metre: M(() => Metre, './metre'),
    MaterielRetenu: M(() => MaterielRetenu, '../../../public/js/materiel-retenu'), Installation: M(() => Installation, './installation'), Electricite: M(() => Electricite, './electricite'), Schema: M(() => Schema, './schema'),
    SuiviEtapes: M(() => SuiviEtapes, './suivi-etapes') };
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const GRAVITES = { erreur: ['Bloquant', '⛔'], attention: ['À traiter', '⚠️'], info: ['Pour information', 'ℹ️'] };
  const CATEGORIES = [['calculs', '🧮', 'Erreurs et points d\'attention des calculs'], ['incoherences', '🔀', 'Incohérences entre calculs'], ['estimees', '📐', 'Valeurs estimées non confirmées'],
    ['valeurs', '✏️', 'Valeurs vides ou restées par défaut'], ['parametres', '🎛️', 'Paramètres « à valider »'], ['reserves', '🛡️', 'Réserves de conformité ouvertes'],
    ['gammes', '📚', 'Gammes : modèle à choisir'], ['materiel', '🏷️', 'Matériel non choisi ou non validé'], ['fiches', '📎', 'Fiches techniques manquantes'], ['guide', '📝', 'Reste à faire de l\'étude']];
  const CATEGORIE = Object.fromEntries(CATEGORIES.map(([k, i, l]) => [k, { ico: i, libelle: l }]));
  // Destinataires : ce que chacun reçoit (catégories, gravité minimale)
  const DESTINATAIRES = {
    interne: { libelle: 'Interne (bureau d\'études)', categories: CATEGORIES.map(c => c[0]), min: 'info' },
    controle: { libelle: 'Bureau de contrôle', categories: ['calculs', 'incoherences', 'estimees', 'parametres', 'reserves', 'fiches'], min: 'attention' },
    client: { libelle: 'Client / maîtrise d\'œuvre', categories: ['calculs', 'incoherences', 'gammes', 'materiel', 'fiches'], min: 'info', calculs: 'erreur' },
  };
  const RANG = { erreur: 0, attention: 1, info: 2 };
  const libNote = (et, n) => (n ? `N${(et.notes || []).indexOf(n) + 1} — ${n.titre || n.type}` : 'Étude');

  // Points du contrôle : [{ id, gravite, categorie, texte, origine, noteId, action: [code, libellé] | null }]
  function controler(et, opts = {}) {
    const notes = (et && et.notes) || [], out = [], vus = new Set(), L = G.Liens(), N = G.Notes();
    const add = (categorie, gravite, texte, o = {}) => { const id = `${categorie}|${o.noteId || ''}|${norm(texte).slice(0, 120)}`; if (vus.has(id)) return; vus.add(id); out.push({ id, gravite, categorie, texte: String(texte), origine: o.origine || 'Étude', noteId: o.noteId || '', action: o.action || null, ...(o.detail ? { detail: o.detail } : {}) }); };
    const versNote = n => ({ origine: libNote(et, n), noteId: n.id, action: [`note:${n.id}`, '➡️ Ouvrir le calcul'] });
    const calc = new Map(), calculer = n => { if (!calc.has(n.id)) calc.set(n.id, (L && essai(() => L.calculer(et, n))) || (N && essai(() => N.calculer(n.type, n.entrees || {}))) || { alertes: [], valeurs: {} }); return calc.get(n.id); };
    const res = n => (L && essai(() => L.resoudre(et, n).entrees)) || n.entrees || {};

    // 1. Incohérences entre calculs (avant les alertes : textes repris, doublons écartés)
    const couverts = [];
    // Puissance de chauffage du bâtiment (bilans) et puissance appelée par les circuits (schéma de principe)
    const parType = t => notes.filter(n => n.type === t);
    const pieces = parType('pieces').reduce((s, n) => s + (num(calculer(n).valeurs && calculer(n).valeurs.Pch) || 0), 0);
    const bilans = [...parType('batiment'), ...parType('bilan')].reduce((s, n) => s + (num(calculer(n).valeurs && calculer(n).valeurs.Pchauf) || 0), 0);
    const Pbat = pieces > 0 ? pieces : bilans, srcBat = pieces > 0 ? 'bilan pièce par pièce' : 'bilan(s) thermique(s)';
    const pidsChauds = parType('pid').filter(n => { const d = essai(() => G.Schema().dimensionner(res(n))); return d ? d.chaud !== false : true; });
    if (Pbat > 0 && pidsChauds.length) {
      const [pmax, nmax] = pidsChauds.map(n => [num(calculer(n).valeurs && calculer(n).valeurs.Pdem) || 0, n]).sort((a, b) => b[0] - a[0])[0];
      if (pmax < Pbat * 0.9) add('incoherences', 'attention', `Puissance appelée par les circuits (${nf(pmax, 1)} kW, ${libNote(et, nmax)}) inférieure de ${nf((1 - pmax / Pbat) * 100)} % à la puissance de chauffage du bâtiment (${nf(Pbat, 1)} kW, ${srcBat}) : circuits sans puissance ou bilan non relié.`, versNote(nmax));
      else if (pmax > Pbat * 1.5) add('incoherences', 'attention', `Puissance appelée par les circuits (${nf(pmax, 1)} kW, ${libNote(et, nmax)}) supérieure de ${nf((pmax / Pbat - 1) * 100)} % à la puissance de chauffage du bâtiment (${nf(Pbat, 1)} kW, ${srcBat}) : puissances des circuits à justifier.`, versNote(nmax));
    }
    // Débit des CTA et air neuf réglementaire (calcul d'air neuf ; à défaut, air neuf des pièces du bilan)
    const airNeuf = parType('airNeuf');
    airNeuf.forEach(n => (calculer(n).valeurs.ctas || []).forEach(c => {
      if (c.Qs + 1e-6 < c.besoin) { add('incoherences', 'erreur', `${c.lib} : ${nf(c.Qs)} m³/h soufflés pour ${nf(c.besoin)} m³/h d'air neuf réglementaire (manque ${nf(c.besoin - c.Qs)} m³/h).`, versNote(n)); couverts.push(/d'air neuf réglementaire \(manque/); }
    }));
    const ctas = parType('cta');
    if (!airNeuf.length && ctas.length && parType('pieces').length) {
      const besoin = parType('pieces').reduce((s, n) => s + ((calculer(n).valeurs.pieces || []).reduce((a, p) => a + (num(p.Qair) || 0), 0)), 0), Qs = ctas.reduce((s, n) => s + (num(res(n).Qs) || 0), 0);
      if (besoin > 0 && Qs > 0 && Qs < besoin * 0.95) add('incoherences', 'attention', `Débit soufflé des CTA (${nf(Qs)} m³/h) inférieur à l'air neuf des pièces du bilan (${nf(besoin)} m³/h) : vérifier la part d'air neuf (créer le calcul d'air neuf réglementaire).`, versNote(ctas[0]));
    }
    // Armoire (alimentation électrique) et équipements des autres calculs
    const E = G.Electricite();
    parType('elec').forEach(n => {
      const rep = (E && L && essai(() => E.equipementsEtude(et, L))) || [], lignes = ((n.entrees || {}).equipements || []).filter(Boolean), srcs = new Map(lignes.filter(l => l.src).map(l => [l.src, l]));
      const manquent = rep.filter(r => r.src && !srcs.has(r.src) && ![...srcs.keys()].some(s => String(s).startsWith(`${r.src}#`)));
      if (manquent.length) add('incoherences', 'attention', `${manquent.length} équipement(s) de l'étude absent(s) de ${libNote(et, n)} : ${manquent.slice(0, 5).map(r => r.rep || r.designation).join(', ')}${manquent.length > 5 ? '…' : ''} — « Mettre à jour depuis l'étude ».`, { ...versNote(n), action: [`note:${n.id}`, '⚡ Mettre à jour l\'armoire'] });
      const ecarts = rep.filter(r => r.src && srcs.has(r.src) && num(r.P) > 0 && num(srcs.get(r.src).P) > 0 && Math.abs(num(r.P) - num(srcs.get(r.src).P)) > Math.max(0.05, num(r.P) * 0.1));
      if (ecarts.length) add('incoherences', 'attention', `${ecarts.length} puissance(s) électrique(s) de ${libNote(et, n)} différente(s) de celles des calculs : ${ecarts.slice(0, 4).map(r => `${r.rep || r.designation} ${nf(num(srcs.get(r.src).P), 2)} kW au lieu de ${nf(num(r.P), 2)} kW`).join(', ')}.`, versNote(n));
    });
    // Liaisons CTA ↔ schéma de principe ambiguës (rien n'est relié automatiquement)
    const A = L && essai(() => L.liaisonsAutoCta(et));
    ((A && A.ambigus) || []).forEach(x => {
      if (x.type === 'batterie') add('incoherences', 'attention', `${libNote(et, x.cta)} : ${x.cands.length} circuits « batterie de CTA » possibles (${x.cands.map(k => `« ${k.rep} »`).join(', ')}) — liaison à choisir.`, versNote(x.cta));
      else add('incoherences', 'attention', `Circuit « ${x.rep} » de ${libNote(et, x.pid)} : ${x.ctas.length} CTA peuvent s'y raccorder (${x.ctas.map(c => libNote(et, c)).join(', ')}) — liaison à choisir.`, versNote(x.pid));
    });
    if (A && A.ambigus && A.ambigus.length) couverts.push(/rien n'est relié automatiquement/);
    // Raccordements de l'installation hydraulique
    const I = G.Installation();
    if (I && notes.some(n => ['pid', 'arbo', 'terminaux', 'cta', 'ecs'].includes(n.type))) (essai(() => I.controles(et)) || []).filter(c => c.niveau === 'erreur' || c.niveau === 'attention').slice(0, 30)
      .forEach(c => { const n = notes.find(y => y.id === c.note); add('incoherences', c.niveau, c.texte, { origine: n ? libNote(et, n) : 'Installation hydraulique', noteId: n ? n.id : '', action: ['installation', '💧 Installation hydraulique'] }); });

    // 2. Erreurs et points d'attention des calculs
    notes.forEach(n => (calculer(n).alertes || []).forEach(a => {
      if (a.niveau !== 'erreur' && a.niveau !== 'attention') return;
      if (couverts.some(re => re.test(a.texte || ''))) return;
      add('calculs', a.niveau, a.texte, versNote(n));
    }));

    // 3. Valeurs estimées (ratios, surfaces) non confirmées ; zones sans surface
    const Es_ = G.Estimations();
    if (Es_) (essai(() => Es_.enPlace(et)) || []).forEach(x => { const n = notes.find(y => y.id === x.note); if (n) add('estimees', 'attention', `${x.libelle} = ${x.v} — estimée (${x.origine}), à confirmer`, { ...versNote(n), action: [`confirmer-estimes:${n.id}`, '✓ Confirmer les estimations'] }); });
    // 4. Valeurs vides ou restées par défaut (guide de l'étude)
    const Gu = G.GuideEtude();
    if (Gu) notes.forEach(n => { const v = essai(() => Gu.valeursNote(n, et)) || { vides: [], defauts: [] };
      v.vides.forEach(l => add('valeurs', 'attention', `${l} : valeur vide`, versNote(n)));
      if (!n.defautsConfirmes && v.defauts.length) add('valeurs', 'info', `${v.defauts.length} valeur(s) restée(s) par défaut : ${v.defauts.slice(0, 6).join(', ')}${v.defauts.length > 6 ? '…' : ''}`, { ...versNote(n), action: [`confirmer:${n.id}`, '✓ C\'est bon'] });
    });

    // 5. Paramètres « à valider » et réserves de conformité ouvertes (récapitulatif coché de l'étude)
    const AX = G.AnnexesExploitation();
    if (AX && L) {
      const l = essai(() => AX.reserves(et, L)) || [], s = (et && et.reservesConformite) || {};
      l.filter(x => !(s[x.cle] && s[x.cle].le)).forEach(x => {
        if (x.categorie === AX.CATEGORIES[3]) return; // non-conformité : déjà dans les erreurs du calcul
        const cat = x.categorie === AX.CATEGORIES[1] ? 'parametres' : 'reserves';
        add(cat, 'attention', `${x.texte}${x.valeur ? ` (${x.valeur})` : ''}`, { origine: x.origine || 'Réglages', noteId: x.noteId || '', action: ['reserves-conformite', '🛡️ Récapitulatif des réserves'], detail: x.reference || '' });
      });
    }

    // 6. Gammes dont le modèle reste à choisir (registre)
    const R = G.Registre();
    ((et && et.equipements) || []).filter(x => x.gamme).forEach(x => add('gammes', 'attention', `${(R && R.nomEq(x)) || x.nom} : documentation de gamme « ${x.gamme.titre || ''} », modèle à choisir (${(x.gamme.modeles || []).length} modèle(s))`, { origine: 'Registre des équipements', action: ['registre', '🗂️ Choisir dans le registre'] }));

    // 7. Matériel retenu : non choisi, à soumettre, en attente, refusé ; 8. fiches techniques manquantes
    const M = G.Metre(), MRt = G.MaterielRetenu();
    if (M && MRt && notes.length) {
      const tmp = { ...et, materiel: JSON.parse(JSON.stringify((et && et.materiel) || {})) }, postes = essai(() => M.metre(tmp).filter(M.estEquipement)) || [];
      if (R && R.versMateriel) essai(() => R.versMateriel(tmp, postes));
      const ls = essai(() => MRt.lignes(postes, tmp.materiel)) || [], fiches = opts.fiches || new Map();
      const eqDe = l => ((et && et.equipements) || []).find(x => norm(x.fabricant) === norm(l.fabricant) && norm(x.reference) === norm(l.reference));
      const o = { origine: 'Matériel retenu', action: ['materiel', '🏷️ Matériel retenu'] }, lib = l => `${l.designation}${l.qte ? ` (${String(l.qte).replace('.', ',')} u)` : ''}`;
      const aChoisir = ls.filter(l => l.statut === 'À choisir' && !l.orphelin);
      aChoisir.slice(0, 40).forEach(l => add('materiel', 'attention', `${lib(l)} : fabricant et référence à choisir`, o));
      if (aChoisir.length > 40) add('materiel', 'attention', `${aChoisir.length - 40} autre(s) équipement(s) à choisir`, o);
      ls.filter(l => l.statut === 'Refusé').forEach(l => add('materiel', 'erreur', `${lib(l)} : ${MRt.libelleRef(l)} refusé par le client${l.obs ? ` (${l.obs})` : ''} — autre modèle à proposer`, o));
      ls.filter(l => l.statut === 'À soumettre').forEach(l => add('materiel', 'info', `${lib(l)} : ${MRt.libelleRef(l)} à soumettre à la validation du client`, o));
      ls.filter(l => l.statut === 'Soumis au client').forEach(l => add('materiel', 'info', `${lib(l)} : ${MRt.libelleRef(l)} soumis le ${l.dateSoumission || '—'}, en attente de validation`, o));
      ls.filter(l => l.statut === 'Validé avec réserves').forEach(l => add('materiel', 'info', `${lib(l)} : ${MRt.libelleRef(l)} validé avec réserves${l.obs ? ` (${l.obs})` : ''}`, o));
      ls.filter(l => l.orphelin).forEach(l => add('materiel', 'attention', `${lib(l)} : choix ${MRt.libelleRef(l)} sans équipement correspondant dans l'étude (dimension changée) — à reprendre ou supprimer`, o));
      ls.filter(l => l.reference && !l.orphelin && l.statut !== 'Refusé').forEach(l => {
        const x = eqDe(l);
        if (l.fiche || fiches.get(l.cle) || (x && x.ficheBiblio)) return;
        add('fiches', 'attention', `${lib(l)} — ${MRt.libelleRef(l)} : fiche technique à joindre (absente de la bibliothèque des fiches)`, { origine: 'Matériel retenu', action: ['materiel', '📎 Joindre la fiche'] });
      });
    }

    // 9. Reste à faire du guide (étapes non couvertes ci-dessus)
    if (Gu) { const r = essai(() => Gu.restesAFaire(et)) || { etapes: [] };
      // Étape déclarée « sans objet » (motif tracé dans le suivi des étapes) : plus signalée
      const SE = G.SuiviEtapes();
      r.etapes.filter(x => !x.fait && !(SE && SE.estSansObjet(et, x.id)) && !['valeurs', 'estimees', 'conformite'].includes(x.groupe) && x.id !== 'erreurs' && x.id !== 'installation-erreurs' && x.id !== 'controle').forEach(x => add('guide', 'info', `${x.titre}${x.info ? ` : ${x.info}` : ''}`, { origine: 'Guide de l\'étude', action: x.action || null })); }

    return out.sort((a, b) => CATEGORIES.findIndex(c => c[0] === a.categorie) - CATEGORIES.findIndex(c => c[0] === b.categorie) || RANG[a.gravite] - RANG[b.gravite]);
  }
  // Points retenus pour un destinataire
  function filtrer(points, destinataire = 'interne') {
    const d = DESTINATAIRES[destinataire] || DESTINATAIRES.interne;
    return (points || []).filter(p => d.categories.includes(p.categorie) && RANG[p.gravite] <= RANG[d.min] && !(p.categorie === 'calculs' && d.calculs && RANG[p.gravite] > RANG[d.calculs]));
  }
  // Rapport : points filtrés, comptes par gravité et par catégorie, verdict
  // (tous : points de controler() déjà calculés, filtrés ici pour chaque destinataire)
  function rapport(et, { destinataire = 'interne', fiches, date, tous } = {}) {
    const points = filtrer(tous || controler(et, { fiches }), destinataire), parGravite = { erreur: 0, attention: 0, info: 0 }, parCategorie = {};
    points.forEach(p => { parGravite[p.gravite]++; parCategorie[p.categorie] = (parCategorie[p.categorie] || 0) + 1; });
    const verdict = parGravite.erreur ? 'bloquant' : parGravite.attention ? 'a-traiter' : 'pret';
    return { destinataire, libelleDestinataire: (DESTINATAIRES[destinataire] || DESTINATAIRES.interne).libelle, date: date || new Date().toISOString().slice(0, 10), points, parGravite, parCategorie, verdict, total: points.length };
  }
  const VERDICTS = { bloquant: '⛔ Points bloquants à corriger avant l\'envoi', 'a-traiter': '⚠️ Points à traiter ou à signaler avec l\'envoi', pret: '✅ Étude prête à être envoyée' };

  /* ---------- Rapport imprimable (PDF) ---------- */
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function html(et, r, opts = {}) {
    const soc = (opts.societe && opts.societe.nom) || '', d = r.date ? new Date(`${r.date}T12:00:00`).toLocaleDateString('fr-FR') : '';
    const groupes = CATEGORIES.map(([k]) => [k, r.points.filter(p => p.categorie === k)]).filter(([, l]) => l.length);
    return `<div class="doe-doc controle-etude"><h2>CONTRÔLE DE L'ÉTUDE AVANT ENVOI</h2>
      <p><strong>${esc(et.objet || '')}</strong>${et.client ? ` — ${esc(et.client)}` : ''}${et.indice ? ` · indice ${esc(et.indice)}` : ''}${soc ? ` · ${esc(soc)}` : ''}</p>
      <p class="petit">Destinataire : <strong>${esc(r.libelleDestinataire)}</strong> · contrôle du ${esc(d)} · ${r.parGravite.erreur} bloquant(s), ${r.parGravite.attention} à traiter, ${r.parGravite.info} pour information.</p>
      <p><strong>${esc(VERDICTS[r.verdict])}</strong></p>
      ${groupes.map(([k, l]) => `<h3>${esc(CATEGORIE[k].libelle)} (${l.length})</h3><table class="tn"><thead><tr><th style="width:13%">Gravité</th><th>Point</th><th style="width:24%">Note d'origine</th>${r.destinataire === 'controle' ? '<th style="width:18%">Avis</th>' : ''}</tr></thead>
        <tbody>${l.map(p => `<tr><td>${esc(GRAVITES[p.gravite][0])}</td><td>${esc(p.texte)}${p.detail ? `<br><span class="petit">${esc(p.detail)}</span>` : ''}</td><td class="petit">${esc(p.origine)}</td>${r.destinataire === 'controle' ? '<td></td>' : ''}</tr>`).join('')}</tbody></table>`).join('')}
      ${r.points.length ? '' : '<p>Aucun point relevé pour ce destinataire.</p>'}
      <table class="tn signatures"><tbody><tr><th>Contrôlé par (nom, date, signature)</th><th>${r.destinataire === 'interne' ? 'Vérificateur' : esc(r.libelleDestinataire)} (nom, date, visa)</th></tr><tr><td style="height:50px"></td><td></td></tr></tbody></table>
      <style>.controle-etude td { vertical-align: top; }</style></div>`;
  }

  /* ---------- Affichage (navigateur) ---------- */
  let destinataireChoisi = 'interne';
  async function dialogue(et) {
    const box = Modal.open('<h2>🔎 Contrôler l\'étude</h2><p>Contrôle en cours…</p>');
    box.classList.add('large');
    // Fiches de la bibliothèque du CRM pour le matériel retenu (fabricant + référence exacte)
    let fiches = new Map();
    try {
      const ls = typeof lignesMateriel === 'function' ? lignesMateriel(et) : [];
      const dem = ls.filter(l => l.reference && !l.orphelin && !l.fiche).map(l => ({ cle: l.cle, fabricant: l.fabricant, reference: l.reference }));
      if (dem.length) { const r = await api('POST', '/api/pf/fiches/trouver', { demandes: dem }); fiches = new Map(r.filter(x => x.fiche).map(x => [x.cle, x.fiche])); }
    } catch (e) { /* bibliothèque indisponible : les fiches restent signalées */ }
    if (typeof contexteEtude !== 'undefined') contexteEtude = et; // eslint-disable-line no-global-assign
    let r = null, tous = null;
    const rendre = () => {
      try { tous = tous || controler(et, { fiches }); r = rapport(et, { destinataire: destinataireChoisi, tous }); } catch (e) { box.innerHTML = `<h2>Contrôle impossible</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="ce-x">Fermer</button></div>`; box.querySelector('#ce-x').onclick = Modal.close; return; }
      const groupes = CATEGORIES.map(([k]) => [k, r.points.filter(p => p.categorie === k)]).filter(([, l]) => l.length);
      box.innerHTML = `<h2>🔎 Contrôle de l'étude avant envoi</h2>
        <div class="grille-champs"><label>Destinataire du rapport<select id="ce-dest">${Object.entries(DESTINATAIRES).map(([k, d]) => `<option value="${k}" ${k === destinataireChoisi ? 'selected' : ''}>${esc(d.libelle)}</option>`).join('')}</select></label></div>
        <p class="petit muted">${destinataireChoisi === 'interne' ? 'Tous les points, y compris le reste à faire du guide.' : destinataireChoisi === 'controle' ? 'Erreurs et points d\'attention des calculs, incohérences, valeurs estimées, paramètres à valider, réserves de conformité, fiches techniques manquantes.' : 'Erreurs bloquantes, incohérences, gammes et matériel à choisir ou à valider, fiches techniques manquantes.'}</p>
        <p><strong>${esc(VERDICTS[r.verdict])}</strong> — ${r.parGravite.erreur} bloquant(s) · ${r.parGravite.attention} à traiter · ${r.parGravite.info} pour information</p>
        <div id="ce-liste" style="max-height:52vh;overflow:auto">${groupes.map(([k, l]) => `<details class="controle-groupe" ${l.some(p => p.gravite === 'erreur') || groupes.length <= 3 ? 'open' : ''}><summary><strong>${CATEGORIE[k].ico} ${esc(CATEGORIE[k].libelle)}</strong> <span class="compte">${l.length}</span></summary>
          <table class="liste compact petit"><tr><th>Gravité</th><th>Point</th><th>Note d'origine</th><th></th></tr>${l.map(p => `<tr class="controle-${p.gravite}"><td style="white-space:nowrap">${GRAVITES[p.gravite][1]} ${esc(GRAVITES[p.gravite][0])}</td><td>${esc(p.texte)}${p.detail ? `<br><span class="muted">${esc(p.detail)}</span>` : ''}</td><td>${esc(p.origine)}</td>
            <td>${p.action ? `<button class="secondaire petit" data-guide="${esc(p.action[0])}">${esc(p.action[1])}</button>` : ''}</td></tr>`).join('')}</table></details>`).join('') || '<p class="muted">Aucun point relevé.</p>'}</div>
        <div class="actions"><button class="secondaire" id="ce-x">Fermer</button><button class="secondaire" id="ce-imp">🖨️ Imprimer</button><button id="ce-pdf">📄 Rapport PDF</button></div>`;
      box.querySelector('#ce-dest').onchange = ev => { destinataireChoisi = ev.target.value; rendre(); };
      box.querySelector('#ce-x').onclick = () => { Modal.close(); App.render(); };
      // Liens « y aller » : actions du guide de l'étude (la fenêtre se ferme d'abord)
      box.querySelectorAll('[data-guide]').forEach(b => b.addEventListener('click', () => Modal.close()));
      if (typeof GuideEtude !== 'undefined') GuideEtude.lier(box, et);
      const doc = () => pourPdf(html(et, r, { societe: (S.config || {}).societe }));
      box.querySelector('#ce-pdf').onclick = async () => {
        try {
          const bytes = await PDF.depuisHTML(doc(), 'Contrôle de l\'étude', null, { margeHaut: 36, margeBas: 36 });
          et.controles = [...(et.controles || []), { le: r.date, par: (S.me || {}).nom || (S.me || {}).login || '', destinataire: r.destinataire, erreur: r.parGravite.erreur, attention: r.parGravite.attention }].slice(-20);
          enregistrer(et);
          enregistrerFichier(box, `Controle_${r.destinataire}_${String(et.objet).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 40)}.pdf`, bytes, 'application/pdf');
        } catch (e) { toast(`PDF impossible : ${e.message}`, 6000); }
      };
      box.querySelector('#ce-imp').onclick = () => {
        const w = window.open('', '_blank');
        if (!w) return toast('Fenêtre d\'impression bloquée par le navigateur : utilisez le rapport PDF.', 5000);
        w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Contrôle de l'étude</title><style>body{font-family:sans-serif;font-size:12px;margin:16px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #999;padding:3px 5px;text-align:left}.petit{font-size:11px}</style></head><body>${html(et, r, { societe: (S.config || {}).societe })}</body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
      };
    };
    rendre();
  }

  return { GRAVITES, CATEGORIES, DESTINATAIRES, VERDICTS, controler, filtrer, rapport, html, dialogue };
})();
if (typeof module !== 'undefined') module.exports = ControleEtude;
