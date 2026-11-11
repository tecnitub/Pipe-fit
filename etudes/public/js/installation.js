// Installation hydraulique de l'étude, vue d'ensemble : registre unique des consommateurs d'eau (terminaux, batteries à
// eau des CTA, productions d'ECS, circuits « directs » du schéma de principe, réseaux annexes), leur raccordement
// (branche d'un réseau arborescent, circuit d'un schéma de principe), l'arbre production → circuits → réseaux →
// branches → consommateurs, et les contrôles de cohérence de l'ensemble.
// Le raccordement réutilise les mécanismes des calculs (branche « émetteur » du réseau arborescent, circuit des
// terminaux, réseau annexe d'un circuit, circuit primaire de l'ECS) : rien n'est dupliqué, tout reste lié.
const Installation = ((N, Sc, L) => {
  const num = N.num;
  const notesDe = et => (et && et.notes) || [];
  const libNote = (et, n) => `N${notesDe(et).indexOf(n) + 1} — ${n.titre || (N.TYPES[n.type] || {}).titre || n.type}`;
  const arrondi = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? Math.round(x * 10 ** d) / 10 ** d : null);
  const CHAUD_EAU = ['chaude', '2t', '4t'], FROID_EAU = ['froide', '2t', '4t', 'froide+elec'];
  const SAISONS = { chaud: 'eau chaude', froid: 'eau glacée' };

  // Calculs mis en cache le temps d'un appel (chaque note n'est résolue qu'une fois)
  function contexte(et) {
    const calcs = new Map(), entrees = new Map(), dims = new Map();
    const memo = (m, n, f) => { if (!m.has(n.id)) { let r = null; try { r = f(); } catch (e) { r = null; } m.set(n.id, r); } return m.get(n.id); };
    const ctx = {
      calc: n => memo(calcs, n, () => L.calculer(et, n)),
      entrees: n => memo(entrees, n, () => L.resoudre(et, n).entrees) || { ...N.defauts(n.type), ...(n.entrees || {}) },
      dim: pid => memo(dims, pid, () => Sc.dimensionner(ctx.entrees(pid))),
    };
    return ctx;
  }
  // Saisons desservies par le réseau d'un schéma (nouveau circuit) ou par un de ses circuits (régime propre possible)
  function saisonsSchema(et, pid) {
    let c; try { c = L.couvertParCircuit(et, pid); } catch (e) { c = new Set(['bc']); }
    return new Set([...c].map(b => (b === 'bf' ? 'froid' : 'chaud')));
  }
  function saisonsCircuit(et, ctx, pid, i) {
    const c = ((ctx.dim(pid) || {}).circuits || [])[i];
    if (!c) return saisonsSchema(et, pid);
    if (c.rcF) return new Set(['chaud', 'froid']);
    return new Set([c.rc[0] > c.rc[1] ? 'chaud' : 'froid']);
  }
  const regimeCircuit = (ctx, pid, i) => {
    const c = ((ctx.dim(pid) || {}).circuits || [])[i];
    if (!c) return '';
    return c.rcF ? `${c.rcC[0]}/${c.rcC[1]} · ${c.rcF[0]}/${c.rcF[1]} °C` : `${c.rc[0]}/${c.rc[1]} °C`;
  };
  // Circuit « id|repère » d'un schéma de l'étude : { pid, i, c }
  function circuitParCle(et, ctx, cle) {
    const [id, ...r] = String(cle || '').split('|'), rep = r.join('|'), pid = notesDe(et).find(n => n.id === id && n.type === 'pid');
    if (!pid || !rep) return null;
    const cs = ctx.entrees(pid).circuits || [], i = cs.findIndex(c => c && String(c.rep || '').trim() === rep.trim());
    return i >= 0 ? { pid, i, c: cs[i] } : null;
  }
  const lienPid = (et, ctx, pid, i, saisons) => {
    const c = (ctx.entrees(pid).circuits || [])[i] || {};
    return { type: 'pid', note: pid.id, rep: c.rep || `C${i + 1}`, i, libelle: `circuit « ${c.rep || `C${i + 1}`} » de ${libNote(et, pid)}`, saisons: saisons || saisonsCircuit(et, ctx, pid, i) };
  };

  /* ---------- Registre des consommateurs ---------- */
  // Chaque point de consommation d'eau de l'étude :
  // { cle, type, libelle, source: { id, type, titre, libelle }, saison, P (kW), Q (m³/h), dp (kPa), regime,
  //   emetteur (clé « note:repère » d'une branche de réseau arborescent), raccordements: [...], raccordement (le premier ou null) }
  function consommateurs(et, ctx = contexte(et)) {
    const notes = notesDe(et), out = [];
    // Branches « émetteur » de tous les réseaux arborescents
    const branches = new Map();
    notes.filter(n => n.type === 'arbo').forEach(a => {
      const saison = (ctx.entrees(a).saison || 'chaud') === 'froid' ? 'froid' : 'chaud';
      ((a.entrees || {}).troncons || []).forEach((t, k) => {
        if (!t || !t.emetteur) return;
        const rep = t.rep || `Tronçon ${k + 1}`, l = branches.get(t.emetteur) || [];
        l.push({ type: 'arbo', note: a.id, rep, libelle: `branche ${rep} de ${libNote(et, a)}`, saisons: new Set([saison]) });
        branches.set(t.emetteur, l);
      });
    });
    // Répartit les liens d'un équipement sur ses consommateurs (une batterie chaude, une froide…) ; un lien qui ne
    // dessert aucune de leurs saisons est un régime incompatible
    const repartir = (cs, liens) => {
      cs.forEach(c => { c.raccordements = []; });
      liens.forEach(l => {
        const ok = cs.filter(c => l.saisons.has(c.saison));
        (ok.length ? ok : cs).forEach(c => c.raccordements.push({ ...l, saisons: [...l.saisons], incompatible: !ok.length }));
      });
      cs.forEach(c => { c.raccordement = c.raccordements[0] || null; out.push(c); });
    };
    const source = n => ({ id: n.id, type: n.type, titre: n.titre || '', libelle: libNote(et, n) });
    const pris = new Set(); // circuits du schéma qui alimentent un consommateur (pas des circuits « directs »)

    // 1. Terminaux : un consommateur par appareil et par batterie à eau (chaude, froide)
    notes.filter(n => n.type === 'terminaux').forEach(n => {
      const e = ctx.entrees(n), r = ctx.calc(n), lignes = (r && r.valeurs.lignes) || [], dpV = num(e.dpVanne, 15);
      (e.appareils || []).forEach(a => {
        if (!a || !String(a.rep || '').trim()) return;
        const x = lignes.find(l => l.rep === String(a.rep).trim()), b = x ? x.b : a.batterie || 'chaude', nb = x ? x.n : 1, em = `${n.id}:${a.rep}`;
        const cs = [...(CHAUD_EAU.includes(b) ? ['chaud'] : []), ...(FROID_EAU.includes(b) ? ['froid'] : [])].map(s => {
          const fr = s === 'froid', dpB = x ? (fr ? x.dpF : x.dpC) : 0;
          return { cle: `${em}@${s}`, type: 'terminal', libelle: `${a.rep}${a.local ? ` — ${a.local}` : ''} (${fr ? 'froid' : 'chaud'})`, source: source(n), saison: s, emetteur: em,
            P: x ? arrondi((fr ? x.Pfr : x.Pch) * nb) : null, Q: x ? arrondi((fr ? x.qf : x.qc) * nb, 3) : null, dp: dpB ? arrondi(dpB + (x.nbV ? dpV : 0), 1) : null,
            regime: fr ? `${num(e.TfAller, 7)}/${num(e.TfRetour, 12)} °C` : `${num(e.TcAller, 45)}/${num(e.TcRetour, 40)} °C` };
        });
        if (!cs.length) return;
        const liens = [...(branches.get(em) || [])];
        const ref = a.circuit ? circuitParCle(et, ctx, a.circuit) : null;
        if (ref) { pris.add(`${ref.pid.id}|${ref.i}`); liens.push(lienPid(et, ctx, ref.pid, ref.i)); }
        repartir(cs, liens);
      });
    });
    // 2. Batteries à eau des CTA (batterie chaude, froide ou change-over)
    notes.filter(n => n.type === 'cta').forEach(n => {
      let bats; try { bats = L.batteriesCta(et, n); } catch (e) { bats = []; }
      if (!bats.length) return;
      const r = ctx.calc(n), v = (r && r.valeurs) || {}, e = ctx.entrees(n), f = e.fiche || {};
      const cs = bats.map(x => {
        const fr = x.b === 'bf', dpB = fr ? f.dpEauBF : f.dpEauBC;
        return { cle: `${n.id}:${x.b}`, type: 'cta', libelle: `${n.titre || 'CTA'} — ${x.libelle.toLowerCase()}`, source: source(n), saison: x.saison, emetteur: `${n.id}:${x.b}`,
          P: arrondi(fr ? v.Pfroid : v.Pchaud), Q: arrondi(fr ? v.QwF : v.QwC, 3), dp: Number.isFinite(dpB) ? dpB : null,
          regime: fr ? `${num(e.TfAller, 7)}/${num(e.TfRetour, 12)} °C` : `${num(e.TcAller, 70)}/${num(e.TcRetour, 50)} °C` };
      });
      // Branches propres à chaque batterie ; circuits du schéma (la CTA est l'annexe du circuit) répartis selon leur régime
      cs.forEach(c => { c.raccordements = (branches.get(c.emetteur) || []).map(l => ({ ...l, saisons: [...l.saisons], incompatible: !l.saisons.has(c.saison) })); });
      L.circuitsDeAnnexe(notes, n).forEach(({ pid, i }) => {
        pris.add(`${pid.id}|${i}`);
        const l = lienPid(et, ctx, pid, i), ok = cs.filter(c => l.saisons.has(c.saison));
        (ok.length ? ok : cs).forEach(c => c.raccordements.push({ ...l, saisons: [...l.saisons], incompatible: !ok.length }));
      });
      cs.forEach(c => { c.raccordement = c.raccordements[0] || null; out.push(c); });
    });
    // 3. Productions d'ECS : primaire de l'échangeur ou du ballon
    notes.filter(n => n.type === 'ecs').forEach(n => {
      const e = ctx.entrees(n), r = ctx.calc(n), v = (r && r.valeurs) || {};
      const c = { cle: `${n.id}:ecs`, type: 'ecs', libelle: `${n.titre || 'Production d\'ECS'} — primaire`, source: source(n), saison: 'chaud', emetteur: null,
        P: arrondi(num(e.P)), Q: arrondi(v.Qp, 3), dp: null, regime: `${num(e.Tp1, 75)}/${num(e.Tp2, 55)} °C` };
      const ref = e.circuitPrim ? circuitParCle(et, ctx, e.circuitPrim) : null;
      if (ref) pris.add(`${ref.pid.id}|${ref.i}`);
      repartir([c], ref ? [lienPid(et, ctx, ref.pid, ref.i)] : []);
    });
    // 4. Réseaux annexes : réseau arborescent (ses branches desservent les consommateurs), réseau et pompe autonome
    notes.filter(n => n.type === 'arbo' || (n.type === 'reseau' && !n.lien)).forEach(n => {
      const e = ctx.entrees(n), r = ctx.calc(n), v = (r && r.valeurs) || {}, arbo = n.type === 'arbo';
      const saison = arbo ? (e.saison === 'froid' ? 'froid' : 'chaud') : num(e.T, 60) < 25 ? 'froid' : 'chaud';
      const refs = L.circuitsDeAnnexe(notes, n);
      refs.forEach(({ pid, i }) => pris.add(`${pid.id}|${i}`));
      const P = refs.length ? num(((ctx.entrees(refs[0].pid).circuits || [])[refs[0].i] || {}).P) : arbo ? v.Ptot : 0;
      const c = { cle: `${n.id}:reseau`, type: arbo ? 'arbo' : 'reseau', libelle: `${n.titre || 'Réseau'} (${arbo ? 'réseau arborescent' : 'réseau et pompe'})`, source: source(n), saison, emetteur: null,
        P: arrondi(P), Q: arrondi(arbo ? v.Qp : v.Qpompe, 3), dp: arrondi((arbo ? v.Hres : v.dpTotal) / 1000, 1), regime: arbo ? `Tm ${num(e.T, 60)} °C, ΔT ${num(e.dT, 15)} K` : `${num(e.T, 60)} °C` };
      repartir([c], refs.map(({ pid, i }) => lienPid(et, ctx, pid, i)));
    });
    // 5. Circuits « directs » des schémas : sans réseau annexe ni consommateur relié (plancher, radiateurs saisis en puissance…)
    notes.filter(n => n.type === 'pid').forEach(pid => {
      const es = ctx.entrees(pid), d = ctx.dim(pid);
      (es.circuits || []).forEach((c, i) => {
        if (!c || c.annexe || pris.has(`${pid.id}|${i}`)) return;
        const dc = d && d.circuits[i], s = saisonsCircuit(et, ctx, pid, i), em = (Sc.EMETTEURS[c.emetteur] || Sc.EMETTEURS.radiateurs)[0], rep = c.rep || `C${i + 1}`;
        const saison = s.has('chaud') ? 'chaud' : 'froid';
        const x = { cle: `${pid.id}|${i}`, type: 'circuit', libelle: `${rep} — ${em.toLowerCase()}${s.size > 1 ? ' (change-over)' : ''}`, source: source(pid), saison, emetteur: null,
          P: arrondi(dc ? dc.P : num(c.P)), Q: arrondi(dc ? dc.Q : NaN, 3), dp: dc ? arrondi(dc.hmt * 9.81, 1) : null, regime: regimeCircuit(ctx, pid, i) };
        repartir([x], [lienPid(et, ctx, pid, i, s)]);
      });
    });
    return out;
  }

  /* ---------- Raccordements possibles et raccordement ---------- */
  // Cibles proposées à un consommateur non raccordé : [{ valeur, libelle }]
  //  - « arbo|<id> » : nouvelle branche du réseau arborescent de même saison ;
  //  - « pid|<id>|<i> » : circuit i d'un schéma de principe (i = -1 : nouveau circuit au nom du consommateur).
  function cibles(et, cle, liste, ctx = contexte(et)) {
    const c = (liste || consommateurs(et, ctx)).find(x => x.cle === cle);
    if (!c || c.type === 'circuit') return [];
    const notes = notesDe(et), out = [];
    const src = notes.find(n => n.id === c.source.id);
    if (!src) return [];
    // Branche d'un réseau arborescent : terminaux et batteries de CTA, réseau de même saison, émetteur pas encore branché
    if (c.emetteur) notes.filter(a => a.type === 'arbo' && ((ctx.entrees(a).saison || 'chaud') === 'froid' ? 'froid' : 'chaud') === c.saison).forEach(a => {
      let libres; try { libres = L.batteriesLibres(et, src, a); } catch (e) { libres = []; }
      if (libres.some(y => y.cle === c.emetteur)) out.push({ valeur: `arbo|${a.id}`, libelle: `🌳 Nouvelle branche de ${libNote(et, a)}` });
    });
    // Circuit d'un schéma de principe dont le régime dessert la saison du consommateur
    notes.filter(p => p.type === 'pid').forEach(pid => {
      const cs = ctx.entrees(pid).circuits || [];
      if (c.type !== 'terminal' && saisonsSchema(et, pid).has(c.saison)) out.push({ valeur: `pid|${pid.id}|-1`, libelle: `➕ ${libNote(et, pid)} : nouveau circuit « ${c.source.titre} »` });
      cs.forEach((x, i) => {
        if (!x || !String(x.rep || '').trim() || x.annexe || !saisonsCircuit(et, ctx, pid, i).has(c.saison)) return;
        out.push({ valeur: `pid|${pid.id}|${i}`, libelle: `${libNote(et, pid)} : circuit « ${x.rep} »` });
      });
    });
    return out;
  }
  const repLibre = (cs, r) => { let x = r, k = 2; while (cs.some(c => String((c && c.rep) || '').trim() === x)) x = `${r} (${k++})`; return x; };
  // Raccorde un consommateur à une cible (voir cibles) : rend { ok, texte, type, note, rep } ; l'étude est modifiée
  // (à enregistrer par l'appelant)
  function raccorder(et, cle, cible) {
    const c = consommateurs(et).find(x => x.cle === cle);
    if (!c) return { ok: false, texte: 'Consommateur introuvable dans l\'étude.' };
    if (c.type === 'circuit') return { ok: false, texte: 'Circuit du schéma de principe : déjà raccordé à sa production.' };
    if (c.raccordements.some(r => !r.incompatible)) return { ok: false, texte: `${c.libelle} : déjà raccordé (${c.raccordement.libelle}).` };
    const notes = notesDe(et), src = notes.find(n => n.id === c.source.id), [ty, id, k] = String(cible || '').split('|'), dest = notes.find(n => n.id === id);
    if (!src || !dest) return { ok: false, texte: 'Raccordement introuvable.' };
    if (ty === 'arbo' && dest.type === 'arbo') {
      if (!c.emetteur) return { ok: false, texte: `${c.libelle} : se raccorde à un circuit du schéma de principe, pas à une branche.` };
      const fr = (L.resoudre(et, dest).entrees.saison || 'chaud') === 'froid';
      if (fr !== (c.saison === 'froid')) return { ok: false, texte: `${libNote(et, dest)} : réseau ${fr ? 'd\'eau glacée' : 'd\'eau chaude'}, incompatible avec ${c.libelle}.` };
      dest.entrees = dest.entrees || {};
      if (!Array.isArray(dest.entrees.troncons)) dest.entrees.troncons = JSON.parse(JSON.stringify(N.defauts('arbo').troncons || []));
      const rep = L.brancherSurArbo(et, src, dest, c.emetteur);
      if (!rep) return { ok: false, texte: `${c.libelle} : déjà branché sur un réseau arborescent.` };
      return { ok: true, type: 'arbo', note: dest.id, rep, texte: `Branche ${rep} créée dans ${libNote(et, dest)} : saisissez sa longueur et son tronçon amont.` };
    }
    if (ty !== 'pid' || dest.type !== 'pid') return { ok: false, texte: 'Raccordement inconnu.' };
    // Schéma resté sur ses circuits par défaut (non saisis) : ils sont recopiés dans la note avant d'en ajouter un
    dest.entrees = dest.entrees || {};
    if (!Array.isArray(dest.entrees.circuits)) dest.entrees.circuits = JSON.parse(JSON.stringify(N.defauts('pid').circuits || []));
    const i = Number(k), ctx = contexte(et), cs = dest.entrees.circuits;
    if (i >= 0 && !cs[i]) return { ok: false, texte: 'Circuit introuvable dans le schéma de principe.' };
    if ((i >= 0 ? saisonsCircuit(et, ctx, dest, i) : saisonsSchema(et, dest)).has(c.saison) === false) return { ok: false, texte: `Régime du circuit incompatible avec ${c.libelle} (${SAISONS[c.saison]}).` };
    if (i >= 0 && cs[i].annexe) return { ok: false, texte: `Circuit « ${cs[i].rep} » déjà relié à un réseau annexe.` };
    if (c.type === 'terminal') {
      if (i < 0) return { ok: false, texte: 'Terminal : choisissez un circuit existant du schéma de principe.' };
      const a = ((src.entrees || {}).appareils || []).find(x => x && `${src.id}:${x.rep}` === c.emetteur);
      if (!a) return { ok: false, texte: 'Terminal introuvable.' };
      a.circuit = `${dest.id}|${cs[i].rep}`;
      return { ok: true, type: 'pid', note: dest.id, rep: cs[i].rep, texte: `${a.rep} raccordé au circuit « ${cs[i].rep} » de ${libNote(et, dest)}.` };
    }
    if (c.type === 'ecs') {
      let j = i;
      if (j < 0) { cs.push({ rep: repLibre(cs, String(src.titre || '').trim() || 'ECS'), emetteur: 'ecs', P: arrondi(num(L.resoudre(et, src).entrees.P), 1) || '', regime: '', regulation: '3v', L: 0 }); j = cs.length - 1; }
      src.entrees = src.entrees || {}; src.entrees.circuitPrim = `${dest.id}|${cs[j].rep}`;
      return { ok: true, type: 'pid', note: dest.id, rep: cs[j].rep, texte: `Primaire de ${src.titre} sur le circuit « ${cs[j].rep} » de ${libNote(et, dest)} (puissance et régime repris du circuit).` };
    }
    // CTA, réseau arborescent, réseau et pompe : réseau annexe du circuit (puissance et pertes de charge remontent)
    const r = L.relierAuSchema(et, src, dest.id, i);
    if (!r) return { ok: false, texte: 'Raccordement impossible.' };
    if (i >= 0 && src.type === 'cta' && String(src.titre || '').trim()) L.renommerCircuit(et, r.pid, r.i, src.titre);
    const rep = r.pid.entrees.circuits[r.i].rep;
    return { ok: true, type: 'pid', note: dest.id, rep, texte: `${src.titre} placé dans ${libNote(et, dest)} : circuit « ${rep} ».` };
  }

  /* ---------- Contrôles de cohérence ---------- */
  // [{ niveau: 'erreur' | 'attention' | 'ok', texte, note, cle }] — erreurs en tête
  function controles(et, liste, ctx = contexte(et)) {
    const notes = notesDe(et), cs = liste || consommateurs(et, ctx), out = [];
    cs.forEach(c => {
      const bons = c.raccordements.filter(r => !r.incompatible), mauvais = c.raccordements.filter(r => r.incompatible);
      if (!c.raccordements.length) out.push({ niveau: 'attention', cle: c.cle, note: c.source.id, texte: c.type === 'arbo' ? `Réseau arborescent « ${c.source.titre} » non relié à un schéma de principe : sa puissance n'est comptée dans aucune production.` : `${c.libelle} (${c.source.libelle}) : non raccordé.` });
      if (bons.length > 1) out.push({ niveau: 'erreur', cle: c.cle, note: c.source.id, texte: `${c.libelle} : raccordé ${bons.length} fois (${bons.map(r => r.libelle).join(' ; ')}) — puissance comptée en double.` });
      mauvais.forEach(r => out.push({ niveau: 'erreur', cle: c.cle, note: c.source.id, texte: `${c.libelle} (${SAISONS[c.saison]}) : régime incompatible avec ${r.libelle} (${r.saisons.map(s => SAISONS[s]).join(' / ')}).` }));
    });
    notes.filter(n => n.type === 'pid').forEach(pid => {
      const r = ctx.calc(pid), v = (r && r.valeurs) || {}, d = ctx.dim(pid);
      [[v.Pprod, v.Pdem, ''], ...(d && d.co ? [[d.co.dF.Pprod, d.co.dF.Pdem, ' (froid)']] : [])].forEach(([Pp, Pd, q]) => {
        if (Pd > 0 && Pp < Pd * 0.999) out.push({ niveau: 'erreur', note: pid.id, texte: `${libNote(et, pid)} : production insuffisante${q}, ${Math.round(Pp)} kW installés pour ${Math.round(Pd)} kW appelés.` });
      });
    });
    notes.filter(n => n.type === 'pid' || n.type === 'arbo').forEach(n => {
      const r = ctx.calc(n);
      ((r && r.alertes) || []).filter(a => a.niveau === 'erreur' && /pompe/i.test(a.texte) && /insuffisant/i.test(a.texte)).forEach(a => out.push({ niveau: 'erreur', note: n.id, texte: `${libNote(et, n)} : ${a.texte}` }));
    });
    const ordre = { erreur: 0, attention: 1 };
    out.sort((a, b) => (ordre[a.niveau] ?? 2) - (ordre[b.niveau] ?? 2));
    if (!out.length) out.push({ niveau: 'ok', texte: `Installation cohérente : ${cs.length} consommateur(s), tous raccordés une fois, régimes compatibles, productions suffisantes.` });
    return out;
  }

  /* ---------- Arbre de l'installation ---------- */
  // { schemas: [{ note, titre, libelle, generateur, nGen, regime, Pprod, Pdem, circuits: [{ i, rep, emetteur, montage, P, Q, hmt,
  //   annexe: { id, type, libelle } | null, consommateurs: [cle], reseau: arbre du réseau arborescent | null }] }],
  //   reseaux: [réseaux arborescents non reliés], consommateurs, nonRaccordes, controles }
  function arbre(et) {
    const notes = notesDe(et), ctx = contexte(et), cs = consommateurs(et, ctx);
    const parEmetteur = (a, em) => cs.find(c => c.emetteur === em && c.raccordements.some(r => r.type === 'arbo' && r.note === a.id));
    const reseau = a => {
      const e = ctx.entrees(a), r = ctx.calc(a), v = (r && r.valeurs) || {}, tr = (e.troncons || []).filter(t => t && (t.rep || t.emetteur));
      const prof = new Map(), niveau = (t, vus = new Set()) => {
        if (prof.has(t.rep)) return prof.get(t.rep);
        const am = String(t.amont || '').trim(), p = am && !vus.has(am) ? tr.find(x => String(x.rep || '').trim() === am) : null;
        const n = p ? niveau(p, new Set([...vus, t.rep])) + 1 : 0; prof.set(t.rep, n); return n;
      };
      return { note: a.id, titre: a.titre || '', libelle: libNote(et, a), saison: e.saison === 'froid' ? 'froid' : 'chaud', P: arrondi(v.Ptot), Q: arrondi(v.Qp, 3), hmt: arrondi(v.HMT, 2),
        branches: tr.map(t => { const c = t.emetteur ? parEmetteur(a, t.emetteur) : null;
          return { rep: t.rep || '', nom: t.nom || '', amont: t.amont || '', niveau: niveau(t), P: arrondi(num(t.P)), Q: arrondi(num(t.Q), 3), emetteur: t.emetteur || '', consommateur: c ? c.cle : null }; }) };
    };
    const schemas = notes.filter(n => n.type === 'pid').map(pid => {
      const es = ctx.entrees(pid), d = ctx.dim(pid), r = ctx.calc(pid), v = (r && r.valeurs) || {};
      return { note: pid.id, titre: pid.titre || '', libelle: libNote(et, pid), generateur: (Sc.GENERATEURS[es.generateur] || ['Générateur'])[0], nGen: Math.max(1, Math.round(num(es.nGen, 1))),
        Pgen: arrondi(num(es.Pgen), 1), regime: d ? d.regime : '', Pprod: arrondi(v.Pprod, 1), Pdem: arrondi(v.Pdem, 1),
        circuits: (es.circuits || []).map((c, i) => {
          const dc = d && d.circuits[i], an = c && c.annexe ? notes.find(n => n.id === c.annexe) : null;
          return { i, rep: (c && c.rep) || `C${i + 1}`, emetteur: (Sc.EMETTEURS[c && c.emetteur] || Sc.EMETTEURS.radiateurs)[0], montage: Sc.REGULATIONS[c && c.regulation] || Sc.REGULATIONS['3v'],
            regime: regimeCircuit(ctx, pid, i), P: arrondi(dc ? dc.P : num(c && c.P), 1), Q: arrondi(dc ? dc.Q : NaN, 3), hmt: arrondi(dc ? dc.hmt : NaN, 2),
            annexe: an ? { id: an.id, type: an.type, libelle: libNote(et, an) } : null,
            consommateurs: cs.filter(x => x.raccordements.some(l => l.type === 'pid' && l.note === pid.id && l.i === i) && x.type !== 'arbo').map(x => x.cle),
            reseau: an && an.type === 'arbo' ? reseau(an) : null };
        }) };
    });
    const relies = new Set(notes.filter(n => n.type === 'pid').flatMap(p => ((p.entrees || {}).circuits || []).map(c => c && c.annexe).filter(Boolean)));
    return { schemas, reseaux: notes.filter(n => n.type === 'arbo' && !relies.has(n.id)).map(reseau), consommateurs: cs,
      nonRaccordes: cs.filter(c => !c.raccordements.some(r => !r.incompatible)).map(c => ({ ...c, cibles: cibles(et, c.cle, cs, ctx) })), controles: controles(et, cs, ctx) };
  }

  return { consommateurs, cibles, raccorder, controles, arbre };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'), typeof Liens !== 'undefined' ? Liens : require('./liens'));
if (typeof module !== 'undefined') module.exports = Installation;
