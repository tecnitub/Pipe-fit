// Émissions d'un calcul d'étude (note de calcul, schéma, alimentation électrique…) : chaque émission fige un indice
// (A, B, C…), sa date, son objet, son statut (pour avis, bon pour exécution…), les visas (rédigé, vérifié, approuvé) et
// une copie des données et des résultats ; les modifications d'un indice à l'autre sont relevées donnée par donnée
// (valeurs, lignes ajoutées, retirées ou modifiées, résultats) pour le suivi des modifications et le PDF à cartouche.
// Module commun navigateur / tests.
const Revisions = (() => {
  const STATUTS = ['Pour avis', 'Pour validation', 'Bon pour exécution', 'Pour information', 'Annule et remplace'];
  const suivant = i => (/^[A-Y]$/.test(i) ? String.fromCharCode(i.charCodeAt(0) + 1) : /^\d+$/.test(i) ? String(+i + 1) : `${i}'`);
  const derniere = n => ((n && n.emissions) || []).slice(-1)[0] || null;
  const prochainIndice = n => (derniere(n) ? suivant(derniere(n).indice) : 'A');
  // Copie figée (sans fonctions ni références partagées)
  const figer = x => JSON.parse(JSON.stringify(x ?? null));
  const vide = v => v === '' || v === undefined || v === null;
  const nf = v => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : String(v));
  // Valeur lisible d'une donnée : libellé de la liste de choix, unité
  const lisible = (c, v) => {
    if (vide(v)) return '—';
    if (c.options) { const o = c.options.find(([k]) => String(k) === String(v)); if (o) return String(o[1]); }
    if (typeof v === 'boolean') return v ? 'oui' : 'non';
    return `${nf(v)}${c.u ? ` ${c.u}` : ''}`;
  };
  const egal = (a, b) => (vide(a) && vide(b)) || String(a ?? '') === String(b ?? '');

  // schema : [{ k, l, u, options, rubrique } | { k, l, t: 'lignes', colonnes: [{ k, l, u, options }], rubrique }]
  // → [{ rubrique, libelle, avant, apres, nature: 'modifiée' | 'ajoutée' | 'retirée' }]
  function comparer(schema, avant, apres) {
    const a = avant || {}, b = apres || {}, out = [];
    (schema || []).forEach(c => {
      if (c.t !== 'lignes') {
        if (!egal(a[c.k], b[c.k])) out.push({ rubrique: c.rubrique || '', libelle: c.l, avant: lisible(c, a[c.k]), apres: lisible(c, b[c.k]), nature: 'modifiée', cle: c.k });
        return;
      }
      // Lignes d'une liste : reconnues par leur première colonne (repère), sinon par leur rang
      const cols = c.colonnes || [], k0 = (cols[0] || {}).k, id = (l, i) => (k0 && !vide(l[k0]) ? `r:${String(l[k0])}` : `i:${i}`);
      const la = (a[c.k] || []).map((l, i) => [id(l, i), l]), lb = (b[c.k] || []).map((l, i) => [id(l, i), l]);
      const ma = new Map(la), mb = new Map(lb), nom = (l, i) => (k0 && !vide(l[k0]) ? `« ${l[k0]} »` : `n° ${i + 1}`);
      lb.forEach(([k, l], i) => {
        if (!ma.has(k)) return out.push({ rubrique: c.rubrique || '', libelle: `${c.l} : ligne ${nom(l, i)}`, avant: '—', apres: cols.slice(1, 4).map(col => lisible(col, l[col.k])).filter(x => x !== '—').join(' · ') || 'ajoutée', nature: 'ajoutée', cle: `${c.k}.${k}` });
        const p = ma.get(k);
        cols.forEach(col => { if (!egal(p[col.k], l[col.k])) out.push({ rubrique: c.rubrique || '', libelle: `${c.l} : ligne ${nom(l, i)}, ${col.l}`, avant: lisible(col, p[col.k]), apres: lisible(col, l[col.k]), nature: 'modifiée', cle: `${c.k}.${k}.${col.k}` }); });
      });
      la.forEach(([k, l], i) => { if (!mb.has(k)) out.push({ rubrique: c.rubrique || '', libelle: `${c.l} : ligne ${nom(l, i)}`, avant: cols.slice(1, 4).map(col => lisible(col, l[col.k])).filter(x => x !== '—').join(' · ') || 'présente', apres: '—', nature: 'retirée', cle: `${c.k}.${k}` }); });
    });
    return out;
  }
  // Résultats principaux ([libellé, valeur]) : ce qui a changé
  function comparerResultats(avant, apres) {
    const a = new Map((avant || []).map(([k, v]) => [k, String(v)])), out = [];
    (apres || []).forEach(([k, v]) => { if (a.has(k) && a.get(k) !== String(v)) out.push({ libelle: k, avant: a.get(k), apres: String(v) }); else if (!a.has(k)) out.push({ libelle: k, avant: '—', apres: String(v) }); });
    a.forEach((v, k) => { if (!(apres || []).some(([x]) => x === k)) out.push({ libelle: k, avant: v, apres: '—' }); });
    return out;
  }
  // Objet de la modification proposé : les premières données changées
  function resume(modifs, resultats = [], max = 3) {
    if (!modifs.length && !resultats.length) return '';
    const t = modifs.slice(0, max).map(m => (m.nature === 'modifiée' ? `${m.libelle} : ${m.avant} → ${m.apres}` : `${m.libelle} ${m.nature}`));
    const reste = modifs.length - t.length;
    return `${t.join(' ; ')}${reste > 0 ? ` ; et ${reste} autre(s) modification(s)` : ''}${!modifs.length && resultats.length ? 'Mise à jour des résultats' : ''}`;
  }
  // Modifié depuis la dernière émission (données ou titre) ?
  const modifieDepuis = (n, entrees) => { const d = derniere(n); return !!d && (JSON.stringify(figer(entrees)) !== JSON.stringify(d.entrees) || (n.commentaire || '') !== (d.commentaire || '')); };
  // N° du document : « CH-2026-001-NDC-N03 » (code du chantier, sinon de l'étude)
  const numero = (code, rang) => `${String(code || 'ETU').replace(/\s+/g, '')}-NDC-N${String(rang).padStart(2, '0')}`;
  // Émission : indice, date, objet, statut, visas, copies des données et des résultats, modifications relevées
  function emission(n, { indice, date, objet, statut, redige, verifie, approuve }, entrees, resultats, schema) {
    const d = derniere(n), modifs = d ? comparer(schema, d.entrees, entrees) : [], res = d ? comparerResultats(d.resultats, resultats) : [];
    return { brutes: figer(n.entrees || {}), indice: indice || prochainIndice(n), date, objet: objet || (d ? resume(modifs, res) : 'Première émission'), statut: STATUTS.includes(statut) ? statut : STATUTS[0],
      redige: redige || '', verifie: verifie || '', approuve: approuve || '', entrees: figer(entrees), resultats: figer(resultats), commentaire: n.commentaire || '', titre: n.titre || '', modifs, modifsResultats: res, depuis: d ? d.indice : '' };
  }
  /* ---------- Documents de l'étude, diffusion, retours du maître d'œuvre ---------- */
  // Rang d'un indice (A < B < … < Z < Z' ; 0 < 1 < 2) pour savoir si un destinataire a une version périmée
  const rang = i => (/^\d+$/.test(i) ? +i : /^[A-Z]/.test(i) ? (i.charCodeAt(0) - 64) * 10 + (String(i).length - 1) : 0);
  const AVIS = { VSO: 'Visa sans observation', VAO: 'Visa avec observations', REF: 'Refusé' };
  // Documents de l'étude : la note de calcul complète (indice de l'étude) et chaque calcul émis (son dernier indice)
  function documentsEtude(et, code) {
    const out = [{ cle: 'etude', type: 'note', numero: `${String(code || 'ETU').replace(/\s+/g, '')}-NDC`, titre: `Note de calcul — ${et.objet || ''}`, indice: et.indice || 'A', date: et.date || '', statut: et.statut || 'Pour avis' }];
    (et.notes || []).forEach((n, i) => {
      const d = derniere(n);
      if (!d) return;
      const r = (d.retours || []).slice(-1)[0];
      out.push({ cle: n.id, type: 'calcul', numero: numero(code, i + 1), titre: `N${i + 1} — ${n.titre}`, indice: d.indice, date: d.date, statut: d.statut, redige: d.redige, verifie: d.verifie, approuve: d.approuve, avis: r ? r.avis : '', avisLe: r ? r.date : '' });
    });
    // Autres documents joints à l'étude : plans et documents du chantier, fiches techniques, liste du matériel à valider
    (et.pieces || []).filter(x => !x.retiree).forEach(x => {
      const r = (x.retours || []).slice(-1)[0];
      out.push({ cle: x.id, type: x.type, numero: x.numero, titre: x.titre, indice: x.indice, date: x.date, statut: x.statut || 'Pour information', piece: true, avis: r ? r.avis : '', avisLe: r ? r.date : '' });
    });
    return out;
  }

  /* ---------- Pièces jointes à l'étude (documents d'autres applications) ---------- */
  const TYPES_PIECE = { plan: ['PLA', 'Plan'], fiche: ['FT', 'Fiche technique'], materiel: ['MAT', 'Liste du matériel à valider'], doc: ['DOC', 'Document'] };
  const TYPES_DOC = { note: 'Note de calcul', calcul: 'Calcul', ...Object.fromEntries(Object.entries(TYPES_PIECE).map(([k, v]) => [k, v[1]])) };
  // N° de la pièce : « CH-2026-001-PLA-003 », suite par type
  function numeroPiece(et, code, type) {
    const pre = `${String(code || 'ETU').replace(/\s+/g, '')}-${(TYPES_PIECE[type] || TYPES_PIECE.doc)[0]}`;
    const deja = (et.pieces || []).filter(x => String(x.numero).startsWith(pre)).map(x => +String(x.numero).slice(pre.length + 1) || 0);
    return `${pre}-${String(Math.max(0, ...deja) + 1).padStart(3, '0')}`;
  }
  // Pièce suivie : son fichier change (nouvel indice du plan, nouvelle version de la fiche, liste régénérée) → nouvel
  // indice (celui de la source s'il est donné et différent, sinon l'indice suivant), l'ancien gardé dans l'historique
  function nouvellePiece(et, code, { type, titre, source, fichier, indice, date, statut }) {
    const x = { id: `pc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, numero: numeroPiece(et, code, type), titre, source: source || {}, fichier, indice: indice || 'A', date: date || '', statut: statut || (type === 'materiel' ? 'Pour validation' : 'Pour information'), historique: [] };
    et.pieces = [...(et.pieces || []), x];
    return x;
  }
  function synchroniserPiece(x, { fichier, indice, date, titre }) {
    if (!fichier || !x.fichier || JSON.stringify(fichier) === JSON.stringify(x.fichier)) return false;
    x.historique = [...(x.historique || []), { indice: x.indice, date: x.date, fichier: x.fichier }];
    x.indice = indice && indice !== x.indice && rang(indice) > rang(x.indice) ? indice : suivant(x.indice);
    x.fichier = fichier; x.date = date || x.date; if (titre) x.titre = titre;
    return true;
  }
  // Qui a reçu quel indice : pour chaque destinataire de la liste de diffusion et chaque document, le dernier indice envoyé ;
  // « périmé » quand un indice plus récent est en vigueur
  function etatDiffusion(et, docs) {
    const dest = et.diffusion || [], envois = et.diffusions || [];
    return dest.map(d => ({ destinataire: d, documents: docs.map(doc => {
      const recu = envois.filter(e => (e.destinataires || []).includes(d.id)).flatMap(e => (e.documents || []).filter(x => x.cle === doc.cle).map(x => ({ indice: x.indice, date: e.date })))
        .sort((a, b) => rang(a.indice) - rang(b.indice) || String(a.date).localeCompare(String(b.date))).pop() || null;
      return { cle: doc.cle, recu, perime: !!recu && rang(recu.indice) < rang(doc.indice), jamais: !recu };
    }) }));
  }
  // Observations du maître d'œuvre encore à traiter sur un calcul (tous indices confondus)
  const observationsOuvertes = n => (n.emissions || []).flatMap(em => (em.retours || []).flatMap(r => (r.observations || []).filter(o => !o.leveeIndice).map(o => ({ ...o, indice: em.indice, avis: r.avis, de: r.de, date: r.date }))));
  // Retour reçu sur un indice : avis VSO / VAO / REF, observations (une par ligne), pièce jointe (PDF annoté)
  function ajouterRetour(n, indice, { date, de, avis, observations, fichier }, uid) {
    const em = (n.emissions || []).find(x => x.indice === indice);
    if (!em) throw new Error(`Indice ${indice} non émis`);
    if (!AVIS[avis]) throw new Error('Avis attendu : VSO, VAO ou REF');
    const obs = (Array.isArray(observations) ? observations : String(observations || '').split(/\n+/)).map(t => String(t).trim()).filter(Boolean).map(texte => ({ id: uid(), texte, leveeIndice: '' }));
    const r = { id: uid(), date: date || '', de: de || '', avis, observations: obs, ...(fichier ? { fichier } : {}) };
    em.retours = [...(em.retours || []), r];
    return r;
  }
  // Observations levées par une nouvelle émission
  function lever(n, ids, indice) {
    let k = 0;
    (n.emissions || []).forEach(em => (em.retours || []).forEach(r => (r.observations || []).forEach(o => { if (ids.includes(o.id) && !o.leveeIndice) { o.leveeIndice = indice; k++; } })));
    return k;
  }
  // Schémas de deux indices : textes (repères, équipements) présents d'un seul côté, colorés (vert : ajouté, rouge : retiré)
  const textesSvg = svg => [...String(svg || '').matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  function marquerSvg(svg, autres, couleur) {
    const set = new Set(autres);
    let n = 0;
    const out = String(svg || '').replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (tout, attrs, contenu) => {
      const t = contenu.replace(/<[^>]+>/g, '').trim();
      if (!t || set.has(t)) return tout;
      n++;
      return `<text${attrs.replace(/\s(fill|font-weight)="[^"]*"/g, '')} fill="${couleur}" font-weight="bold">${contenu}</text>`;
    });
    return { svg: out, marques: n };
  }
  function comparerSchemas(svgA, svgB) {
    const ta = textesSvg(svgA), tb = textesSvg(svgB);
    const a = marquerSvg(svgA, tb, '#c62828'), b = marquerSvg(svgB, ta, '#2e7d32');
    return { avant: a.svg, apres: b.svg, retires: a.marques, ajoutes: b.marques, listeRetires: ta.filter(t => !tb.includes(t)), listeAjoutes: tb.filter(t => !ta.includes(t)) };
  }
  /* ---------- Conséquences d'un changement après émission / validation ---------- */
  // L'état des équipements (Reperes.etat : repères, puissances, protections, résultats importants, modèles, nombre
  // d'appareils, matériel retenu, points GTC, valeurs attendues de mise en service) est figé quand l'étude s'engage
  // (émission d'un calcul, nouvel indice, matériel soumis ou validé) ; l'état courant lui est comparé.
  const VALIDES_MAT = ['Validé', 'Validé avec réserves'], ENGAGES_MAT = [...VALIDES_MAT, 'Soumis au client'];
  const CATEGORIES = { armoire: 'Armoire électrique à revoir', materiel: 'Matériel à resoumettre au client', commande: 'Commandes déjà passées', mes: 'PV / mises en service à refaire', gtb: 'Points GTC changés', repere: 'Repères changés', doe: 'DOE à réémettre' };
  // Signature de l'engagement de l'étude : change à chaque émission, nouvel indice ou matériel soumis / validé
  function signatureReference(et) {
    const em = (et.notes || []).reduce((s, n) => s + (n.emissions || []).length, 0);
    const mat = Object.entries(et.materiel || {}).filter(([, s]) => s && ENGAGES_MAT.includes(s.statut)).map(([k, s]) => `${k}=${s.statut}`).sort();
    return { engage: em > 0 || mat.length > 0, cle: `${et.indice || ''}|${em}|${mat.join(',')}` };
  }
  const kw = v => `${nf(Math.round((Number(v) || 0) * 100) / 100)} kW`;
  const ecartRes = (a, b) => { const m = new Map((a || []).map(([k, v]) => [k, v])), out = []; (b || []).forEach(([k, v]) => { if (m.has(k) && m.get(k) !== v) out.push(`${k} : ${m.get(k)} → ${v}`); }); return out; };
  // ref, cur : états (Reperes.etat) ; opts : { materiel (saisies courantes), suivis (chantier : [{ cle, poseLe, mesLe, commande }]), chantier }
  // → [{ cle, categorie, titre, detail, action?, cible?, signature }]
  function consequences(ref, cur, opts = {}) {
    if (!ref || !cur) return [];
    const out = [], add = (categorie, cle, titre, detail, x = {}) => out.push({ cle: `${categorie}|${cle}`, categorie, titre, detail, signature: `${titre}|${detail}`.slice(0, 400), ...x });
    const saisies = opts.materiel || {}, suivi = new Map((opts.suivis || []).map(s => [s.cle, s]));
    // Calculs dont une valeur importante a changé (puissance, débit, nombre d'appareils, modèle du registre)
    const notesCh = new Map();
    Object.entries(cur.notes || {}).forEach(([id, n]) => {
      const a = (ref.notes || {})[id]; if (!a) return;
      const l = [...ecartRes(a.res, n.res)];
      Object.keys({ ...(a.nb || {}), ...(n.nb || {}) }).forEach(k => { if ((a.nb || {})[k] !== (n.nb || {})[k]) l.push(`Nombre (${k === 'appareils' ? 'appareils' : k === 'bouchesL' ? 'bouches' : k}) : ${(a.nb || {})[k] || 0} → ${(n.nb || {})[k] || 0}`); });
      const ma = (a.modeles || []).join(', '), mb = (n.modeles || []).join(', ');
      if (ma !== mb) l.push(`Modèle du registre : ${ma || '—'} → ${mb || '—'}`);
      if (l.length) notesCh.set(n.n, { id, titre: n.titre, l });
    });
    // Armoire : puissance ou protection changée, équipement ajouté ou retiré
    const eqA = ref.eq || {}, eqB = cur.eq || {};
    Object.entries(eqB).forEach(([k, b]) => {
      const a = eqA[k];
      if (!a) { if (b.P > 0) add('armoire', k, `${b.rep} ajouté`, `${b.des} — ${kw(b.P)}${b.cal ? `, protection ${b.cal} A` : ''} : départ à créer dans l'armoire`); return; }
      if (Math.abs((a.P || 0) - (b.P || 0)) > 0.005 || (a.cal || 0) !== (b.cal || 0)) add('armoire', k, `${b.rep} : puissance ${kw(a.P)} → ${kw(b.P)}`, `${b.des}${a.cal !== b.cal ? ` — protection ${a.cal || '—'} A → ${b.cal || '—'} A, câble à vérifier` : ' — bilan de l\'armoire à revoir'}`);
      if (a.rep && b.rep && a.rep !== b.rep) add('repere', k, `${a.rep} → ${b.rep}`, `${b.des} : étiquettes QR / plaques, PV, table d'échange GTC et DOE portent l'ancien repère`);
    });
    Object.entries(eqA).forEach(([k, a]) => { if (!eqB[k] && a.P > 0) add('armoire', k, `${a.rep} retiré`, `${a.des} — ${kw(a.P)} : départ à supprimer de l'armoire`); });
    // Matériel soumis / validé : dimension changée (poste disparu), quantité, calcul source ou puissance changés
    const parMetre = new Map();
    Object.entries(eqB).forEach(([k, b]) => { if (b.metre) { if (!parMetre.has(b.metre)) parMetre.set(b.metre, []); parMetre.get(b.metre).push([k, b]); } });
    Object.entries(ref.materiel || {}).forEach(([cle, m]) => {
      if (!ENGAGES_MAT.includes(m.statut)) return;
      const s = saisies[cle] || {};
      if (!ENGAGES_MAT.includes(s.statut)) return; // déjà repassé à soumettre
      const pa = (ref.postes || {})[cle], pb = (cur.postes || {})[cle], raisons = [];
      if (pa && !pb && !/^reg\|/.test(cle)) raisons.push('équipement redimensionné : ce poste n\'existe plus dans l\'étude');
      if (pa && pb && pa.qte !== pb.qte) raisons.push(`quantité ${pa.qte} → ${pb.qte}`);
      ((pb || pa || {}).src || []).forEach(n => { const c = notesCh.get(n); if (c) raisons.push(`${n} — ${c.titre} : ${c.l.slice(0, 3).join(' ; ')}`); });
      (parMetre.get(cle) || []).forEach(([k, b]) => { const a = eqA[k]; if (a && Math.abs((a.P || 0) - (b.P || 0)) > 0.005) raisons.push(`${b.rep} : puissance ${kw(a.P)} → ${kw(b.P)}`); });
      if (!raisons.length) return;
      const lib = m.ref || cle, detail = raisons.join(' ; ');
      add('materiel', cle, `${lib} (${s.statut})`, detail, { action: 'resoumettre', cible: cle });
      const sv = suivi.get(cle) || {};
      if (s.substitution || s.commande || s.commandeLe || sv.commande || sv.poseLe) add('commande', cle, `${lib}`, `${sv.poseLe ? `posé le ${sv.poseLe}` : 'commande déjà passée'} : vérifier avec les achats / le fournisseur (${detail.slice(0, 160)})`);
      else if (opts.chantier && VALIDES_MAT.includes(s.statut)) add('commande', cle, `${lib}`, `Validé : si la commande est déjà passée, la reprendre avec le fournisseur (${detail.slice(0, 160)})`);
    });
    // Mise en service : valeurs attendues changées
    Object.entries(cur.mes || {}).forEach(([k, b]) => {
      const a = (ref.mes || {})[k]; if (!a) return;
      const ma = new Map((a.att || []).map(x => [x.split('=')[0], x.split('=').slice(1).join('=')])), d = [];
      (b.att || []).forEach(x => { const [l, ...v] = x.split('='); if (ma.has(l) && ma.get(l) !== v.join('=')) d.push(`${l} : ${ma.get(l)} → ${v.join('=')}`); });
      if (!d.length) return;
      const sv = b.cle && suivi.get(b.cle);
      add('mes', k, b.titre, `${sv && sv.mesLe ? `mise en service faite le ${sv.mesLe} : PV à refaire — ` : 'fiche de mise en service et PV préremplis à régénérer — '}${d.slice(0, 4).join(' ; ')}`);
    });
    // Points GTC : ajoutés / retirés (table d'échange à retransmettre à l'intégrateur)
    Object.entries(cur.gtb || {}).forEach(([id, l]) => {
      const a = new Set((ref.gtb || {})[id] || []), b = new Set(l), plus = l.filter(x => !a.has(x)), moins = [...a].filter(x => !b.has(x));
      if (!(ref.gtb || {})[id] || (!plus.length && !moins.length)) return;
      add('gtb', id, `${plus.length ? `+${plus.length}` : ''}${plus.length && moins.length ? ' / ' : ''}${moins.length ? `−${moins.length}` : ''} point(s)`, `${[...plus.slice(0, 3).map(x => `+ ${x}`), ...moins.slice(0, 3).map(x => `− ${x}`)].join(' ; ')}${plus.length + moins.length > 6 ? ' ; …' : ''} : table d'échange et liste des points à retransmettre, essais point à point à mettre à jour`);
    });
    if (out.length && opts.chantier) add('doe', 'etude', 'Dossier des ouvrages exécutés', `${out.length} changement(s) depuis l'émission : si le DOE est déjà émis, le réémettre (liste des équipements, PV, table d'échange, schémas)`);
    return out;
  }
  // Liste suivie dans l'étude (et.consequences) : nouvelles conséquences ouvertes, celles revenues à l'état émis retirées
  // (sauf figées) ; figer : l'état de référence change (nouvelle émission), les conséquences ouvertes sont gardées
  function suivreConsequences(et, live, { figer: fig = false, date = '' } = {}) {
    const l = (et.consequences || []).filter(x => x.fige || live.some(y => y.cle === x.cle));
    live.forEach(y => {
      const x = l.find(z => z.cle === y.cle && !z.fige);
      if (!x) l.push({ ...y, statut: 'ouvert', le: date });
      else if (x.signature !== y.signature) Object.assign(x, y, { statut: x.statut === 'fait' ? 'fait' : 'ouvert', le: date });
    });
    if (fig) l.forEach((x, i) => { if (!x.fige) { x.fige = true; x.cle = `${x.cle}@${date || 'ref'}#${i}`; } });
    et.consequences = l.slice(-200);
    return et.consequences.filter(x => x.statut === 'ouvert');
  }
  const marquerVu = (et, cle, date = '') => { const x = (et.consequences || []).find(y => y.cle === cle); if (x) { x.statut = 'vu'; x.vuLe = date; } return !!x; };
  // Ligne du matériel validée / soumise dont le dimensionnement a changé : repasse « à soumettre », motif en observation
  function repasserASoumettre(et, cle, motif = '', date = '') {
    const s = (et.materiel || {})[cle];
    if (!s) return false;
    Object.assign(s, { statut: 'À soumettre', dateSoumission: '', dateValidation: '', obs: `Dimensionnement modifié${date ? ` le ${date}` : ''} : ${motif}`.slice(0, 300) + (s.obs ? ` — ${s.obs}` : '').slice(0, 200) });
    (et.consequences || []).filter(x => x.cible === cle && x.categorie === 'materiel').forEach(x => { x.statut = 'fait'; x.faitLe = date; });
    return true;
  }
  // À chaque enregistrement : état de référence pris au premier engagement, conséquences suivies, référence avancée
  // (conséquences ouvertes figées) quand l'étude s'engage de nouveau ; etatFn : () => Reperes.etat(et)
  function suivreReference(et, etatFn, { date = '', suivis } = {}) {
    const sig = signatureReference(et);
    if (!sig.engage) return [];
    if (!et.etatReference) { et.etatReference = { sig: sig.cle, le: date, etat: etatFn() }; return []; }
    const cur = etatFn(), live = consequences(et.etatReference.etat, cur, { materiel: et.materiel, suivis, chantier: !!et.affaireId });
    if (et.etatReference.sig === sig.cle) return suivreConsequences(et, live, { date });
    const r = suivreConsequences(et, live, { figer: true, date });
    et.etatReference = { sig: sig.cle, le: date, etat: cur };
    return r;
  }
  return { CATEGORIES, signatureReference, suivreReference, consequences, suivreConsequences, marquerVu, repasserASoumettre, TYPES_PIECE, TYPES_DOC, numeroPiece, nouvellePiece, synchroniserPiece, STATUTS, AVIS, suivant, derniere, prochainIndice, comparer, comparerResultats, resume, modifieDepuis, numero, emission, figer, rang, documentsEtude, etatDiffusion, observationsOuvertes, ajouterRetour, lever, textesSvg, marquerSvg, comparerSchemas };
})();
if (typeof module !== 'undefined') module.exports = Revisions;
