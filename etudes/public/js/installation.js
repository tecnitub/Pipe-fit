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
    // 5. Schémas de principe aval (sous-station, boucle secondaire, boucle d'eau tempérée) : consommateurs du circuit
    // amont ; un schéma à échangeur (sous-station) ou sur boucle d'eau tempérée pas encore relié est à raccorder
    notes.filter(n => n.type === 'pid').forEach(p => {
      const e = ctx.entrees(p), refs = L.circuitsDeAnnexe(notes, p).filter(r => r.pid.id !== p.id);
      if (!refs.length && !Sc.sousStation(e) && !Sc.sourceBoucle(e)) return;
      refs.forEach(r => pris.add(`${r.pid.id}|${r.i}`));
      const d = ctx.dim(p), pa = d ? Sc.primaireAmont(e, d) : null, dc = refs.length ? ((ctx.dim(refs[0].pid) || {}).circuits || [])[refs[0].i] : null;
      const c = { cle: `${p.id}:schema`, type: 'schema', libelle: `${p.titre || 'Schéma de principe'} (schéma aval${pa ? ` : ${pa.libelle}` : ''})`, source: source(p), saison: saisonsSchema(et, p).has('chaud') ? 'chaud' : 'froid', emetteur: null,
        P: pa ? arrondi(pa.P, 1) : null, Q: dc ? arrondi(dc.Q, 3) : null, dp: pa ? arrondi(pa.dp, 1) : null, regime: e.regimePrim && (Sc.sousStation(e) || Sc.sourceBoucle(e)) ? `primaire ${e.regimePrim} °C` : d ? d.regime : '' };
      repartir([c], refs.map(({ pid, i }) => lienPid(et, ctx, pid, i)));
    });
    // 6. Circuits « directs » des schémas : sans réseau annexe ni consommateur relié (plancher, radiateurs saisis en puissance…)
    notes.filter(n => n.type === 'pid').forEach(pid => {
      const es = ctx.entrees(pid), d = ctx.dim(pid);
      (es.circuits || []).forEach((c, i) => {
        if (!c || c.annexe || pris.has(`${pid.id}|${i}`)) return;
        const dc = d && d.circuits[i], s = saisonsCircuit(et, ctx, pid, i), em = (Sc.EMETTEURS[c.emetteur] || Sc.EMETTEURS.radiateurs)[0], rep = c.rep || `C${i + 1}`;
        const saison = s.has('chaud') ? 'chaud' : 'froid';
        // Change-over : le circuit est compté en chaud (puissance P, débit chaud) et en froid (puissance froid Pf, débit froid)
        if (s.size > 1 && dc && dc.rcF) {
          const lien = lienPid(et, ctx, pid, i, s), dp = arrondi(dc.hmt * 9.81, 1);
          const xC = { cle: `${pid.id}|${i}`, type: 'circuit', libelle: `${rep} — ${em.toLowerCase()} (change-over, chaud)`, source: source(pid), saison: 'chaud', emetteur: null, changeOver: true,
            P: arrondi(dc.P), Q: arrondi(dc.Qc, 3), dp, regime: `${dc.rcC[0]}/${dc.rcC[1]} °C` };
          const xF = { cle: `${pid.id}|${i}@froid`, type: 'circuit', libelle: `${rep} — ${em.toLowerCase()} (change-over, froid)`, source: source(pid), saison: 'froid', emetteur: null, changeOver: true,
            P: arrondi(dc.Pf), Q: arrondi(dc.Qf, 3), dp, regime: `${dc.rcF[0]}/${dc.rcF[1]} °C` };
          repartir([xC], [lien]); repartir([xF], [lien]);
          return;
        }
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
    const aval = c.type === 'schema' ? L.schemasAval(notes, src) : new Set();
    notes.filter(p => p.type === 'pid').forEach(pid => {
      // Schéma aval : ni lui-même, ni un schéma qu'il alimente (boucle de liens)
      if (c.type === 'schema' && (pid.id === src.id || aval.has(pid.id))) return;
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
    if (src.type === 'pid' && (dest.id === src.id || L.schemasAval(notes, src).has(dest.id))) return { ok: false, texte: `${libNote(et, src)} alimente déjà ${libNote(et, dest)} : raccordement en boucle impossible.` };
    // CTA, réseau arborescent, réseau et pompe, schéma aval : réseau annexe du circuit (puissance et pertes de charge remontent)
    const r = L.relierAuSchema(et, src, dest.id, i);
    if (!r) return { ok: false, texte: 'Raccordement impossible.' };
    if (i >= 0 && ['cta', 'pid'].includes(src.type) && String(src.titre || '').trim()) L.renommerCircuit(et, r.pid, r.i, src.titre);
    const rep = r.pid.entrees.circuits[r.i].rep;
    return { ok: true, type: 'pid', note: dest.id, rep, texte: `${src.titre} placé dans ${libNote(et, dest)} : circuit « ${rep} »${src.type === 'pid' ? ' (puissance appelée et pertes de charge côté primaire remontent, régime et pression disponible redescendent)' : ''}.` };
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
      // Circuit change-over : chaud et froid comptés séparément ; une puissance froid absente n'est comptée nulle part
      if (c.changeOver && c.saison === 'froid' && !(c.P > 0)) out.push({ niveau: 'attention', cle: c.cle, note: c.source.id, texte: `${c.libelle} (${c.source.libelle}) : puissance froid non renseignée (colonne « Puissance froid » du circuit) — le froid de ce circuit n'est pas compté.` });
    });
    notes.filter(n => n.type === 'pid').forEach(pid => {
      const r = ctx.calc(pid), v = (r && r.valeurs) || {}, d = ctx.dim(pid);
      [[v.Pprod, v.Pdem, ''], ...(d && d.co ? [[d.co.dF.Pprod, d.co.dF.Pdem, ' (froid)']] : [])].forEach(([Pp, Pd, q]) => {
        if (Pd > 0 && Pp < Pd * 0.999) out.push({ niveau: 'erreur', note: pid.id, texte: `${libNote(et, pid)} : production insuffisante${q}, ${Math.round(Pp)} kW installés pour ${Math.round(Pd)} kW appelés.` });
      });
    });
    // Boucles de liens entre schémas de principe (une alerte par boucle)
    const vusCycles = new Set();
    notes.filter(n => n.type === 'pid' && L.cycleSchema(notes, n)).forEach(n => {
      const membres = [n, ...L.chaineAmont(notes, n).map(r => r.pid)].filter(p => L.cycleSchema(notes, p)), cle = membres.map(p => p.id).sort().join('|');
      if (vusCycles.has(cle)) return; vusCycles.add(cle);
      out.push({ niveau: 'erreur', note: n.id, texte: `Liens circulaires entre schémas de principe (${membres.map(p => p.titre).join(' → ')} → ${n.titre}) : un schéma ne peut pas s'alimenter lui-même — retirer le réseau annexe d'un des circuits.` });
    });
    // Calcul hydraulique global : pompes en série, autorité des vannes, débits, pression disponible (les pompes
    // insuffisantes sont déjà relevées par les calculs ci-dessous)
    let hg = null; try { hg = hydrauliqueGlobal(et, ctx); } catch (e) { hg = null; }
    if (hg) hg.alertes.filter(a => !a.pompe).forEach(a => out.push(a));
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
    // Schéma de principe et, sous ses circuits, les schémas aval qu'ils alimentent (sous-station, boucle secondaire…)
    const schema = (pid, niveau, vus) => {
      const es = ctx.entrees(pid), d = ctx.dim(pid), r = ctx.calc(pid), v = (r && r.valeurs) || {}, ref = L.circuitDeAnnexe(notes, pid), cycle = L.cycleSchema(notes, pid);
      return { note: pid.id, titre: pid.titre || '', libelle: libNote(et, pid), niveau, cycle, generateur: (Sc.GENERATEURS[es.generateur] || ['Générateur'])[0], nGen: Math.max(1, Math.round(num(es.nGen, 1))),
        Pgen: arrondi(num(es.Pgen), 1), regime: d ? d.regime : '', Pprod: arrondi(v.Pprod, 1), Pdem: arrondi(v.Pdem, 1),
        amont: ref && !cycle ? { note: ref.pid.id, rep: ((ref.pid.entrees || {}).circuits || [])[ref.i].rep, libelle: libNote(et, ref.pid) } : null,
        primaire: v.primaire && ref && !cycle ? { libelle: v.primaire.libelle, P: arrondi(v.primaire.P, 1), dp: arrondi(v.primaire.dp, 1), dispo: arrondi(v.primaire.dispo, 1), regime: Sc.sousStation(es) || Sc.sourceBoucle(es) ? es.regimePrim || '' : '' } : null,
        circuits: (es.circuits || []).map((c, i) => {
          const dc = d && d.circuits[i], an = c && c.annexe ? notes.find(n => n.id === c.annexe) : null;
          const aval = an && an.type === 'pid' && an.id !== pid.id && !L.cycleSchema(notes, an) && !vus.has(an.id) ? schema(an, niveau + 1, new Set([...vus, an.id])) : null;
          return { i, rep: (c && c.rep) || `C${i + 1}`, emetteur: (Sc.EMETTEURS[c && c.emetteur] || Sc.EMETTEURS.radiateurs)[0], montage: Sc.REGULATIONS[c && c.regulation] || Sc.REGULATIONS['3v'],
            regime: regimeCircuit(ctx, pid, i), P: arrondi(dc ? dc.P : num(c && c.P), 1), Q: arrondi(dc ? dc.Q : NaN, 3), hmt: arrondi(dc ? dc.hmt : NaN, 2),
            annexe: an ? { id: an.id, type: an.type, libelle: libNote(et, an) } : null,
            consommateurs: cs.filter(x => x.raccordements.some(l => l.type === 'pid' && l.note === pid.id && l.i === i) && x.type !== 'arbo').map(x => x.cle),
            reseau: an && an.type === 'arbo' ? reseau(an) : null, schema: aval };
        }) };
    };
    // Productions racines : schémas qui ne sont alimentés par aucun circuit (ou pris dans une boucle de liens)
    const schemas = notes.filter(n => n.type === 'pid' && (!L.circuitDeAnnexe(notes, n) || L.cycleSchema(notes, n))).map(p => schema(p, 0, new Set([p.id])));
    const relies = new Set(notes.filter(n => n.type === 'pid').flatMap(p => ((p.entrees || {}).circuits || []).map(c => c && c.annexe).filter(Boolean)));
    return { schemas, reseaux: notes.filter(n => n.type === 'arbo' && !relies.has(n.id)).map(reseau), consommateurs: cs,
      nonRaccordes: cs.filter(c => !c.raccordements.some(r => !r.incompatible)).map(c => ({ ...c, cibles: cibles(et, c.cle, cs, ctx) })), controles: controles(et, cs, ctx),
      hydraulique: (() => { try { return hydrauliqueGlobal(et, ctx); } catch (e) { return null; } })() };
  }

  /* ---------- Calcul hydraulique global ---------- */
  // Parcourt toute l'installation depuis chaque production racine : production → circuit → (schéma aval → circuit…) →
  // réseau arborescent → branche la plus défavorisée. Chaque pompe ne voit que sa boucle (production, primaire de
  // circuit, circuit avec son réseau aval, branche à pompe placée) ; un schéma aval découplé (échangeur, bouteille)
  // est une charge pour la pompe du circuit amont (pertes de charge côté primaire).
  // Rend { boucles: [{ id, type, note, schema, niveau, pompe, boucle, Q (m³/h), dp (kPa), hmt (mCE), retenue, proposee,
  //   etat, etatLibelle, autorite, detail }], chemins: [{ etapes: [{ libelle, dp, boucle }], dp, terminal }], defavorise,
  //   debits: [{ schema, libelle, Qprod, Qappel, Pprod, Pdem, etat }], alertes }
  // Pertes de charge côté eau (générateurs, échangeurs, bouteille, vanne primaire) : celles du schéma de principe
  // (saisies, reprises des fiches, sinon forfaits) ; pompes de production retenues : point sur leur courbe
  const ETATS = { ok: 'OK', sur: 'surdimensionnée', ko: 'insuffisante', choisir: 'à choisir', integree: 'intégrée (fiche à vérifier)', reseau: 'réseau primaire (pression à obtenir)' };
  function hydrauliqueGlobal(et, ctx = contexte(et)) {
    const notes = notesDe(et), boucles = [], chemins = [], debits = [], alertes = [], nf = N.nf;
    const mCE = (dp, rho) => dp * 1000 / (rho * 9.81), kPa = (h, rho) => h * rho * 9.81 / 1000, r1 = x => arrondi(x, 1), r2 = x => arrondi(x, 2);
    const ajouter = b => { b.id = boucles.length; boucles.push(b); return b; };
    const etat = ret => (!ret ? 'choisir' : ret.ok === false ? 'ko' : ret.ecart > 25 ? 'sur' : 'ok');
    const retenue = pf => (pf ? { ref: pf.ref || 'courbe saisie', H: Number.isFinite(pf.Hpompe) ? pf.Hpompe : null, ok: !!pf.ok, ecart: pf.ecart } : null);
    // Plusieurs pompes primaires (une par générateur) : la plus défavorable ; une pompe sans courbe → à choisir
    const retenues = l => { if (!l.length || l.some(p => !p.pf)) return null; const ko = l.find(p => !p.pf.ok), pire = ko || l.reduce((a, p) => (p.pf.ecart > a.pf.ecart ? p : a), l[0]);
      return { ref: l.map(p => `${p.cle} ${p.pf.ref || 'courbe saisie'}`).join(' ; '), H: Number.isFinite(pire.pf.Hpompe) ? pire.pf.Hpompe : null, ok: !ko, ecart: pire.pf.ecart }; };
    const parcourir = (pid, chemin, niveau, amont, vus) => {
      const e = ctx.entrees(pid), d = ctx.dim(pid);
      if (!d) return;
      const rho = d.f.rho, lib = libNote(et, pid), pa = Sc.primaireAmont(e, d), ss = Sc.sousStation(e), titre = pid.titre || lib;
      let pompesProd; try { pompesProd = Sc.pompesProduction(e, d); } catch (er) { pompesProd = []; }
      let etapes = chemin;
      if (!amont) {
        // Boucle de production : générateur(s), liaisons et découplage (bouteille, échangeur) ; sans découplage la
        // pompe du générateur et celles des circuits sont en série
        const P = d.prod, dp = P.dp, primaireReseau = ss && e.pompeEchPrim !== 'ajouter', pp = pompesProd.filter(p => /^PP\d*$/.test(p.cle)), ret = primaireReseau || d.ppIntegree ? null : retenues(pp);
        const b = ajouter({ type: 'production', note: pid.id, schema: lib, niveau, pompe: primaireReseau ? 'Réseau primaire (réseau de chaleur ou de froid)' : d.ppIntegree ? 'Pompe(s) intégrée(s) au générateur' : `Pompe${d.n > 1 ? 's' : ''} primaire${d.n > 1 ? `s (${d.n})` : ''} des générateurs`,
          boucle: `Production — ${titre}`, Q: r2(d.Qp), dp: r1(dp), hmt: r2(mCE(dp, rho)), retenue: ret, proposee: '', etat: primaireReseau ? 'reseau' : d.ppIntegree ? 'integree' : etat(ret), autorite: null,
          detail: `${P.gens.map(g => `${d.multi ? g.rep : 'générateur'} ${nf(g.dp.v, 1)} kPa (${g.dp.src})`).join(d.multi ? ', ' : '')}${d.multi && P.gens.length > 1 ? ` → le plus résistant ${nf(P.dpGen, 1)} kPa` : ''} + liaisons 5 kPa (forfait)${P.dec ? ` + ${P.decLib} ${nf(P.dec.v, 1)} kPa (${P.dec.src})` : ''}` });
        if (b.etat === 'ko') alertes.push({ niveau: 'erreur', note: pid.id, pompe: true, texte: `${lib} : pompe primaire ${ret.ref} insuffisante pour la boucle de production (${nf(dp, 1)} kPa).` });
        etapes = [...chemin, { libelle: b.boucle, dp: b.dp, boucle: b.id }];
        if (!d.bouteille && !d.echangeur && d.circuits.length) alertes.push({ niveau: 'attention', note: pid.id, texte: `${lib} : production sans découplage — pompe(s) des générateurs et pompes des circuits en série ; bouteille de découplage ou générateurs à débit variable conseillés.` });
        debits.push({ schema: lib, note: pid.id, libelle: 'Production', Qprod: r2(d.Qp), Qappel: r2(d.Qs), Pprod: r1(d.Pprod), Pdem: r1(d.Pdem),
          etat: d.Pprod < d.Pdem * 0.999 ? 'production insuffisante' : !d.bouteille && !d.echangeur && d.Qs > d.Qp * 1.05 ? 'débit appelé > production' : 'OK' });
      } else {
        const ac = amont.c, alib = `circuit ${ac.rep} de ${amont.lib}`;
        // Primaire de la sous-station : pompe du circuit amont, ou pompe primaire ajoutée (alors en série avec elle)
        if (ss && e.pompeEchPrim === 'ajouter') {
          const ret = retenue(Sc.pointPompe(e, 'PECH1', ac.Q, mCE(pa.dp, rho)));
          ajouter({ type: 'primaire', note: pid.id, schema: lib, niveau, pompe: `Pompe primaire de la sous-station${ret ? ` (PECH1 ${ret.ref})` : ''}`, boucle: `${titre} — primaire de l'échangeur`, Q: r2(ac.Q), dp: r1(pa.dp), hmt: r2(mCE(pa.dp, rho)), retenue: ret, proposee: '', etat: etat(ret), autorite: null, detail: pa.postes.map(([l, v, o]) => `${l} ${nf(v, 1)} kPa${o ? ` (${o})` : ''}`).join(' + ') });
          alertes.push({ niveau: 'attention', note: pid.id, texte: `${lib} : pompe primaire de la sous-station en série avec la pompe du ${alib} — n'en garder qu'une, ou découpler (by-pass neutre, bouteille).` });
        }
        if (ss && e.pompeEchSec === 'ajouter') {
          const s2 = d.dpEchS || { v: Sc.DP_ECH, src: 'forfait' }, dp = s2.v + 5, ret = retenue(Sc.pointPompe(e, 'PECH2', d.Qs, mCE(dp, rho)));
          ajouter({ type: 'secondaire', note: pid.id, schema: lib, niveau, pompe: `Pompe secondaire de la sous-station${ret ? ` (PECH2 ${ret.ref})` : ''}`, boucle: `${titre} — secondaire de l'échangeur`, Q: r2(d.Qs), dp: r1(dp), hmt: r2(mCE(dp, rho)), retenue: ret, proposee: '', etat: etat(ret), autorite: null, detail: `échangeur côté secondaire ${nf(s2.v, 1)} kPa (${s2.src}) + collecteurs 5 kPa (forfait)` });
        }
        if (pa.montage === 'direct') alertes.push({ niveau: 'attention', note: pid.id, texte: `${lib} raccordé en direct sur le ${alib} : la pompe du circuit amont et les pompes des circuits de ce schéma sont en série sans découplage (bouteille, échangeur ou by-pass neutre conseillé).` });
        const besoin = ['bouteille', 'direct'].includes(pa.montage) ? d.Qs : ac.Q;
        debits.push({ schema: lib, note: pid.id, libelle: `Alimenté par le ${alib}`, Qprod: r2(ac.Q), Qappel: r2(besoin), Pprod: r1(ac.P), Pdem: r1(pa.P), etat: ac.Q < besoin * 0.95 ? 'débit amont < débit appelé' : 'OK' });
        if (ac.Q < besoin * 0.95) alertes.push({ niveau: 'attention', note: pid.id, texte: `${lib} : débit du ${alib} (${nf(ac.Q, 2)} m³/h) inférieur au débit appelé par ses circuits (${nf(besoin, 2)} m³/h) : le retour se recycle ${pa.montage === 'bouteille' ? 'dans la bouteille' : 'dans le collecteur'} et ${d.chaud ? 'abaisse' : 'relève'} le départ.` });
        if (e.dpDispo !== '' && Number.isFinite(num(e.dpDispo, NaN)) && num(e.dpDispo) < pa.dp - 0.05) alertes.push({ niveau: 'erreur', note: pid.id, pompe: true, texte: `${lib} : pression disponible ${nf(num(e.dpDispo), 1)} kPa pour ${nf(pa.dp, 1)} kPa côté primaire.` });
      }
      // Pompes de production hors boucle principale : échangeur de découplage (racine), récupération, refroidissement
      pompesProd.filter(p => (p.cle === 'PECH1' || p.cle === 'PECH2') ? !ss : ['PREC', 'PEV'].includes(p.cle)).forEach(p => {
        const ret = retenue(p.pf), b = ajouter({ type: p.cle === 'PEV' ? 'refroidissement' : p.cle === 'PREC' ? 'recuperation' : 'echangeur', note: pid.id, schema: lib, niveau, pompe: p.cle, boucle: `${titre} — ${p.lib.toLowerCase()}`, Q: r2(p.Q), dp: r1(p.dp), hmt: r2(p.hmt), retenue: ret, proposee: '', etat: etat(ret), autorite: null, detail: p.detail });
        if (b.etat === 'ko') alertes.push({ niveau: 'erreur', note: pid.id, pompe: true, texte: `${lib} : ${p.cle} (${p.lib.toLowerCase()}) — pompe ${ret.ref} insuffisante pour ${nf(p.Q, 2)} m³/h sous ${nf(p.hmt, 2)} mCE.` });
      });
      d.circuits.forEach((c, i) => {
        const ec = (e.circuits || [])[i] || {}, an = ec.annexe ? notes.find(n => n.id === ec.annexe) : null, nomC = `${titre} — circuit ${c.rep}`;
        // Pompe primaire du circuit (injection, bouteille, échangeur de circuit)
        if (c.prim) ajouter({ type: 'primaire', note: pid.id, schema: lib, niveau, pompe: `PCP${i + 1}`, boucle: `${nomC} (primaire)`, Q: r2(c.prim.Q), dp: r1(c.prim.dp), hmt: r2(c.prim.hmt), retenue: null, proposee: c.prim.pompe ? N.libPompe(c.prim.pompe) : '', etat: 'choisir', autorite: null, detail: Sc.REGULATIONS[c.reg] });
        const A = an && an.type === 'arbo' ? an : null, eA = A ? ctx.entrees(A) : null, rA = A ? ctx.calc(A) : null, vA = (rA && rA.valeurs) || {};
        let ret = c.pf ? { ref: c.pf.ref || 'courbe saisie', H: Number.isFinite(c.pf.Hpompe) ? c.pf.Hpompe : null, ok: !!c.pf.ok, ecart: c.pf.ecart } : null, pompe = `PC${i + 1}`;
        // Réseau arborescent qui porte sa propre pompe : c'est la pompe du circuit, sauf si le circuit en a déjà une
        if (A && (String(eA.pompeRef || '').trim() || String(eA.pompeCourbe || '').trim())) {
          if (ret && !['bouteille', 'echangeur'].includes(c.reg)) alertes.push({ niveau: 'erreur', note: pid.id, texte: `${nomC} : pompe du circuit (${ret.ref}) et pompe du réseau ${A.titre} (${eA.pompeRef || 'courbe saisie'}) en série sans découplage — n'en garder qu'une, ou découpler (bouteille, échangeur).` });
          else if (!ret) { const pr = vA.pompeRetenue; ret = { ref: eA.pompeRef || 'courbe saisie', H: pr ? pr.H : null, ok: pr ? pr.ok : null, ecart: pr ? pr.ecart : 0 }; pompe = `Pompe du réseau ${A.titre}`; }
        }
        const dp = kPa(c.hmt, rho), aval = an ? (an.type === 'pid' ? `schéma aval ${an.titre}` : an.type === 'arbo' ? `réseau ${an.titre}` : an.titre) : c.em[0].toLowerCase();
        const b = ajouter({ type: 'circuit', note: pid.id, schema: lib, niveau, pompe, boucle: `${nomC}${an ? ` → ${an.titre}` : ''}`, Q: r2(c.Q), dp: r1(dp), hmt: r2(c.hmt), retenue: ret, proposee: c.pompe ? N.libPompe(c.pompe) : '', etat: etat(ret),
          autorite: c.autorite === null || c.autorite === undefined ? null : r2(c.autorite),
          detail: `liaison ${nf(c.dpL, 1)} + ${c.M.vanne ? `vanne ${nf(c.dpV, 1)}${c.kvsImpose ? ` (Kvs ${nf(c.kvs, 1)} retenu)` : ''}` : c.prim ? 'séparation' : 'sans vanne'} + robinetterie ${nf((c.rob || []).length ? c.dpRob : 5, 1)}${(c.rob || []).length ? '' : ' (forfait)'}${c.dpEchC ? ` + échangeur ${nf(c.dpEchC.s, 1)} (${c.dpEchC.src})` : ''} + ${aval} ${nf(c.dpEm, 1)} kPa` });
        if (b.etat === 'ko') alertes.push({ niveau: 'erreur', note: pid.id, pompe: true, texte: `${nomC} : pompe ${ret.ref} insuffisante pour ${nf(c.Q, 2)} m³/h sous ${nf(c.hmt, 2)} mCE.` });
        if (b.autorite !== null && b.autorite < 0.5) alertes.push({ niveau: 'attention', note: pid.id, texte: `${nomC} : autorité de la vanne ${nf(b.autorite, 2)} < 0,5 (vanne ${nf(c.dpV, 1)} kPa) — vanne plus résistante ou régulateur de pression différentielle.` });
        const suite = [...etapes, { libelle: `Circuit ${c.rep}`, dp: b.dp, boucle: b.id }];
        if (an && an.type === 'pid' && an.id !== pid.id && !L.cycleSchema(notes, an) && !vus.has(an.id)) { parcourir(an, suite, niveau + 1, { c, lib, pid }, new Set([...vus, an.id])); return; }
        if (A) {
          const margeA = num(eA.marge, 10);
          // Branches portant leur propre pompe (découplées) : une boucle chacune
          (eA.troncons || []).filter(t => t && t.pompe).forEach(t => {
            const nd = (vA.noeuds || []).find(x => x.rep === t.rep); if (!nd) return;
            const H = nd.H * (1 + margeA / 100) / (rho * 9.81), r = num(t.pompeQ) > 0 && num(t.pompeH) > 0 ? { ref: t.pompeNom || t.pompe, H: num(t.pompeH), ok: num(t.pompeQ) >= nd.Q * 0.95 && num(t.pompeH) >= H * 0.95, ecart: 0 } : null;
            ajouter({ type: 'branche', note: A.id, schema: libNote(et, A), niveau: niveau + 1, pompe: t.pompeNom || 'Pompe placée', boucle: `${A.titre} — branche ${t.rep}`, Q: r2(nd.Q), dp: r1(nd.H / 1000), hmt: r2(H), retenue: r, proposee: '', etat: etat(r), autorite: null, detail: 'branche découplée à pompe placée (marge du réseau comprise)' });
          });
          chemins.push({ etapes: [...suite, { libelle: `Réseau ${A.titre} → branche ${vA.defavorise || '—'} (compris dans le circuit)`, dp: 0 }], terminal: `${A.titre} — ${vA.defavorise || '—'}`, note: A.id });
          return;
        }
        chemins.push({ etapes: suite, terminal: `${titre} — ${c.rep}${an ? ` (${an.titre})` : ''}`, note: pid.id });
      });
    };
    notes.filter(n => n.type === 'pid' && (!L.circuitDeAnnexe(notes, n) || L.cycleSchema(notes, n))).forEach(p => parcourir(p, [], 0, null, new Set([p.id])));
    chemins.forEach(ch => { ch.dp = r1(ch.etapes.reduce((a, x) => a + (x.dp || 0), 0)); });
    const defavorise = chemins.reduce((a, ch) => (!a || ch.dp > a.dp ? ch : a), null);
    boucles.forEach(b => { b.etatLibelle = ETATS[b.etat] || b.etat; });
    return { boucles, chemins, defavorise, debits, alertes };
  }


  return { consommateurs, cibles, raccorder, controles, arbre, hydrauliqueGlobal };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'), typeof Liens !== 'undefined' ? Liens : require('./liens'));
if (typeof module !== 'undefined') module.exports = Installation;
