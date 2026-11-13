// Toute l'étude en un clic depuis l'inventaire validé (CCTP / DPGF) : schéma(s) de principe, CTA et schéma aéraulique,
// terminaux, calcul sanitaire, productions d'ECS, alimentation électrique et régulation ; réseaux arborescents des circuits
// de distribution qui desservent des terminaux ou plusieurs batteries de CTA ; puis chaque consommateur raccordé à sa
// production (branche du réseau arborescent, circuit du schéma, circuit primaire de l'ECS) et les puissances ou débits
// manquants estimés (estimations.js). Sans doublon : un calcul de même origine déjà présent est gardé tel quel ou mis à
// jour sans rien écraser (valeurs vides ou par défaut complétées, lignes nouvelles ajoutées).
// creerTout(et, { uid, existants }) est une fonction pure (l'étude est modifiée, rien n'est enregistré ni affiché).
const EtudeAuto = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const Nt = () => (typeof Notes !== 'undefined' ? Notes : require('./notes'));
  const Ic = () => (typeof InventaireCVC !== 'undefined' ? InventaireCVC : require('../../../public/js/inventaire-cvc'));
  const Sch = () => (typeof Schema !== 'undefined' ? Schema : require('./schema'));
  const Ln = () => (typeof Liens !== 'undefined' ? Liens : require('./liens'));
  const Ins = () => (typeof Installation !== 'undefined' ? Installation : require('./installation'));
  const Est = () => (typeof Estimations !== 'undefined' ? Estimations : require('./estimations'));
  const El = () => essai(() => (typeof Electricite !== 'undefined' ? Electricite : require('./electricite')));
  const Gd = () => essai(() => (typeof GuideEtude !== 'undefined' ? GuideEtude : require('./guide-etude')));
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const vide = v => v === '' || v === undefined || v === null;
  const copie = o => JSON.parse(JSON.stringify(o ?? null));
  const ORIGINE = 'inventaire';
  const SAISONS_BAT = { chaude: ['chaud'], elec: [], froide: ['froid'], 'froide+elec': ['froid'], '2t': ['chaud', 'froid'], '4t': ['chaud', 'froid'], aucune: [] };
  const EMET_TERMINAL = t => (/^vc|^cassette|gainable/.test(t) ? 'ventilo' : t === 'radiateur' ? 'radiateurs' : ['aerotherme', 'rideau'].includes(t) ? 'aerotherme' : t === 'poutre' ? 'plafond' : '');

  /* ---------- Calculs sans doublon ---------- */
  // Calcul déjà créé d'après l'inventaire : même clé d'origine ; pour un calcul créé un par un depuis l'inventaire
  // (sans clé), même type et même titre
  const existant = (et, cle, type, titre) => (et.notes || []).find(n => n.origineCle === cle) || (et.notes || []).find(n => !n.origineCle && n.origine === ORIGINE && n.type === type && n.titre === titre);
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Mise à jour sans rien écraser : champ vide, resté à sa valeur par défaut ou estimé ← valeur du dossier ; listes :
  // lignes nouvelles (repère absent) ajoutées, liste restée par défaut remplacée. Rend le nombre de valeurs reprises.
  function completer(n, entrees) {
    const N = Nt(), d = N.defauts(n.type), e = n.entrees = n.entrees || {}, E = Est();
    let k = 0;
    Object.entries(entrees || {}).forEach(([c, v]) => {
      if (v === undefined || c.startsWith('_')) return;
      if (Array.isArray(v)) {
        if (!Array.isArray(e[c]) || !e[c].length || egal(e[c], d[c])) { if (v.length && !egal(e[c], v)) { e[c] = copie(v); k += v.length; } return; }
        const cle = l => String((l && (l.rep ?? l.designation ?? l.nom)) || '').trim(), deja = new Set(e[c].map(cle));
        v.forEach(l => { const r = cle(l); if (r && !deja.has(r)) { e[c].push(copie(l)); deja.add(r); k++; } });
        return;
      }
      if (vide(v) || egal(e[c], v)) return;
      if (vide(e[c]) || (d[c] !== undefined && egal(e[c], d[c])) || E.estMarque(e, c)) { e[c] = copie(v); E.demarquer(e, c); k++; }
    });
    return k;
  }
  // Pose d'un calcul : créé, ou gardé / mis à jour s'il existe
  function poser(ctx, cle, type, titre, entrees, extra = {}) {
    const N = Nt();
    let n = existant(ctx.et, cle, type, titre);
    if (n) {
      n.origineCle = n.origineCle || cle;
      if (extra.origineInv && !n.origineInv) n.origineInv = extra.origineInv;
      if (ctx.existants === 'maj') { const k = completer(n, entrees); ctx.calculs.push({ cle, id: n.id, type, titre: n.titre, etat: 'maj', valeurs: k }); }
      else ctx.calculs.push({ cle, id: n.id, type, titre: n.titre, etat: 'garde' });
      ctx.poses.add(n.id);
      return n;
    }
    n = { id: ctx.uid(), type, titre, entrees: { ...N.defauts(type), ...copie(entrees) }, commentaire: extra.commentaire || '', origine: ORIGINE, origineCle: cle };
    if (extra.origineInv) n.origineInv = extra.origineInv;
    ctx.et.notes.push(n);
    ctx.calculs.push({ cle, id: n.id, type, titre, etat: 'cree' });
    ctx.poses.add(n.id);
    return n;
  }

  /* ---------- Création des calculs ---------- */
  function creerCalculs(ctx) {
    const { et } = ctx, I = Ic(), Sc = Sch(), N = Nt(), inv = et.inventaire || [], reseaux = et.inventaireReseaux || [];
    const inc = inv.filter(x => x.inclus !== false && !x.variante), G = g => inc.some(x => g.includes(x.genre));
    // 1. Schéma(s) de principe : production et circuits ; puissance de production absente laissée vide (estimée ensuite)
    if (inc.some(x => x.categorie === 'producteur') || inc.some(x => ['radiateurs', 'plancher', 'radiant', 'plafond', 'ventilo', 'aerotherme', 'cta', 'ecs'].includes(x.genre) && !x.horsSchema)) {
      const { schemas } = I.versSchemas(inv, Sc, reseaux);
      schemas.forEach(sc => {
        const e = { ...sc.entrees, circuits: sc.entrees.circuits || [] };
        if (!(num(e.Pgen) > 0) && !(e.generateurs || []).some(g => num(g.P) > 0)) e.Pgen = '';
        const n = poser(ctx, `pid:${sc.cle}`, 'pid', `Schéma de principe — ${sc.titre}`, e,
          { commentaire: ['Prérempli d\'après le dossier de consultation (CCTP / DPGF).', sc.commentaire, sc.alertes.length ? `À vérifier : ${sc.alertes.join(' ')}` : ''].filter(Boolean).join(' ') });
        ctx.pids[sc.cle] = n;
      });
      Object.values(ctx.pids).forEach(n => { if ((n.entrees || {}).recupDe === '@froid') n.entrees.recupDe = ctx.pids.froid ? ctx.pids.froid.id : ''; });
    }
    // 2. CTA (une par centrale) et schéma aéraulique s'il y a des bouches ; débit absent laissé vide (estimé ensuite)
    if (G(['cta', 'bouche-soufflage', 'bouche-extraction', 'ventilateur'])) {
      const { entrees, alertes, ctas } = I.versSchemaAir(inv, reseaux);
      (ctas || []).forEach(c => {
        const e = { ...c.entrees };
        if (!(num(e.Qs) > 0)) { e.Qs = ''; if (e.type !== 'simple') e.Qr = ''; }
        const n = poser(ctx, `cta:${c.src || c.titre}`, 'cta', c.titre, e, { origineInv: c.src, commentaire: `Reprise du dossier de consultation (${c.sources.join(', ')}) : batteries, récupérateur, débits et puissances à vérifier.` });
        ctx.ctas.set(c.src || c.titre, n);
      });
      // Schéma aéraulique : bouches du dossier ; sans bouche ni CTA (caisson, extracteur seul), zones à saisir (aucune
      // zone d'exemple : pas de débit inventé)
      if ((entrees.zones || []).length || !ctx.ctas.size) {
        const seule = ctx.ctas.size === 1 ? [...ctx.ctas.values()][0] : null;
        poser(ctx, 'aero', 'aero', `Schéma aéraulique — ${entrees.titreInstallation || 'd\'après le CCTP / DPGF'}`, { ...entrees, zones: entrees.zones || [], ...(seule ? { cta: seule.id } : {}) },
          { commentaire: `Prérempli d'après le dossier de consultation (CCTP / DPGF) : ${(entrees.zones || []).length ? 'vérifier les distances des zones au ventilateur et les longueurs d\'antenne' : 'zones et bouches à saisir'}.${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}` });
      }
    }
    // 3. Terminaux : chaque appareil garde l'équipement de l'inventaire dont il vient (raccordement), et sa zone
    const { appareils, alertes } = I.versTerminaux(inv);
    if (appareils.length) {
      // Même lecture, local remplacé par l'identifiant de la ligne : appareils dans le même ordre, ligne d'origine connue
      const traces = I.versTerminaux(inv.map(x => ({ ...x, local: `\u0001${x.id || ''}`, details: { ...(x.details || {}), local: '' } }))).appareils;
      const parId = new Map(inv.map(x => [x.id, x]));
      appareils.forEach((a, k) => {
        const id = String((traces[k] || {}).local || '').slice(1), x = parId.get(id);
        if (x) { a._inv = id; if (!a.local) a._zone = String(x.designation || '').slice(0, 60); }
      });
      const prod = s => Object.values(ctx.pids).find(p => essai(() => Ln().couvertParCircuit(et, p).has(s === 'froid' ? 'bf' : 'bc')));
      const pc = prod('chaud'), pf = prod('froid');
      ctx.terminaux = poser(ctx, 'terminaux', 'terminaux', 'Terminaux — d\'après le CCTP / DPGF', { appareils, ...(pc ? { prodChaud: pc.id } : {}), ...(pf ? { prodFroid: pf.id } : {}) },
        { commentaire: `Terminaux repris du dossier de consultation : locaux, puissances, batteries et vannes à vérifier.${alertes.length ? ` À vérifier : ${alertes.join(' ')}` : ''}` });
    }
    // 4. Productions d'ECS raccordées à la production (ballons électriques ou solaires : hors schéma hydraulique)
    inc.filter(x => x.genre === 'ecs' && !x.horsSchema).forEach(x => {
      const n = poser(ctx, `ecs:${x.id || x.designation}`, 'ecs', `Production d'ECS — ${x.repere ? `${x.repere} ` : ''}${x.designation}`.slice(0, 80), num(x.P) > 0 ? { P: num(x.P) } : { P: '' },
        { origineInv: x.id, commentaire: `Reprise du dossier de consultation (${(x.sources || []).join(', ')}) : besoins (usage, nombre) à préciser ; puissance et régime repris du circuit primaire une fois raccordée.` });
      ctx.ecs.set(x.id, n);
    });
    // 5. Calcul sanitaire : points de puisage des appareils ; besoins d'ECS repris par la première production d'ECS
    if (G(['sanitaire'])) {
      const { points, alertes: al, ecs } = I.versSanitaire(inv);
      if (points.length) {
        const prodEcs = [...ctx.ecs.values()][0];
        poser(ctx, 'sanitaire', 'sanitaire', 'Eau froide et eau chaude sanitaires — d\'après le CCTP / DPGF', { points, ...(prodEcs ? { production: prodEcs.id } : {}) },
          { commentaire: `Appareils repris du dossier de consultation : tronçons, salles et étages à compléter.${ecs.length ? ` Production d'ECS du dossier : ${ecs.join(' ; ')}.` : ''}${al.length ? ` ${al.join(' ')}` : ''}` });
      }
    }
    // 6. Alimentation électrique et régulation (marque de l'automate, GTB, bus lus au CCTP)
    const lignes = I.versElec(inv), reg = I.versRegulation(inv).entrees, E = El();
    if (lignes.length && E) {
      const d = N.defauts('elec');
      const regul = e => {
        ['marqueAutomate', 'gtb', 'busEquip'].forEach(k => { if (reg[k] !== undefined && (e[k] === undefined || e[k] === d[k])) e[k] = reg[k]; });
        if (reg.techno && (e.armoires || []).length && (e.armoires || []).every(a => !a.techno || a.techno === 'automate')) e.armoires = e.armoires.map(a => ({ ...a, techno: reg.techno }));
        return e;
      };
      const ex = (et.notes || []).find(n => n.type === 'elec');
      if (ex) {
        ex.origineCle = ex.origineCle || 'elec';
        if (ctx.existants === 'maj') { ex.entrees = regul({ ...(ex.entrees || {}), equipements: E.fusionner((ex.entrees || {}).equipements, lignes).lignes }); ctx.calculs.push({ cle: 'elec', id: ex.id, type: 'elec', titre: ex.titre, etat: 'maj' }); }
        else ctx.calculs.push({ cle: 'elec', id: ex.id, type: 'elec', titre: ex.titre, etat: 'garde' });
        ctx.poses.add(ex.id);
      } else {
        poser(ctx, 'elec', 'elec', N.TYPES.elec.titre, regul({ ...d, equipements: E.fusionner([], lignes).lignes }),
          { commentaire: `Équipements repris du dossier de consultation (CCTP / DPGF) : choisissez pour chacun son alimentation et sa régulation.${Object.keys(reg).length ? ` Régulation reprise du CCTP : ${[reg.marqueAutomate, reg.gtb, reg.busEquip].filter(Boolean).join(', ')}.` : ''}` });
      }
    }
  }

  /* ---------- Raccordements ---------- */
  // Saisons desservies par un circuit (chaud, froid ; change-over : les deux)
  function saisonsCircuit(et, pid, i) {
    const d = essai(() => Sch().dimensionner(Ln().resoudre(et, pid).entrees)), c = d && d.circuits[i];
    if (c && c.rcF) return { saisons: ['chaud', 'froid'], dc: c };
    if (c && c.rc) return { saisons: [c.rc[0] > c.rc[1] ? 'chaud' : 'froid'], dc: c };
    const cv = essai(() => Ln().couvertParCircuit(et, pid)) || new Set(['bc']);
    return { saisons: [...cv].map(b => (b === 'bf' ? 'froid' : 'chaud')), dc: null };
  }
  function raccorderTout(ctx) {
    const { et } = ctx, L = Ln(), N = Nt(), notes = et.notes, invId = new Map((et.inventaire || []).map(x => [x.id, x]));
    const term = ctx.terminaux, apps = term ? ((term.entrees || {}).appareils || []).filter(a => a && a.rep) : [];
    const branche = cle => notes.some(n => n.type === 'arbo' && ((n.entrees || {}).troncons || []).some(t => t && t.emetteur === cle));
    const ctaDe = id => ctx.ctas.get(id) || [...ctx.ctas.values()].find(n => n.origineInv === id);
    const lienCta = (cta, b) => (essai(() => L.batteriesCta(et, cta)) || []).find(x => x.b === b);
    const dit = t => ctx.raccordements.push(t);
    Object.entries(ctx.pids).forEach(([cleP, pid]) => {
      (((pid.entrees || {}).circuits) || []).forEach((c, i) => {
        if (!c || !Array.isArray(c.inv) || !c.inv.length) return;
        const items = c.inv.map(id => invId.get(id)).filter(x => x && x.inclus !== false && !x.horsSchema);
        const ids = new Set(items.map(x => x.id));
        const aps = apps.filter(a => ids.has(a._inv) && (SAISONS_BAT[a.batterie || 'chaude'] || []).length);
        const ctas = items.filter(x => x.genre === 'cta').map(x => ctaDe(x.id)).filter(Boolean);
        const ecss = items.filter(x => x.genre === 'ecs').map(x => ctx.ecs.get(x.id)).filter(Boolean);
        const { saisons, dc } = saisonsCircuit(et, pid, i);
        // ECS : circuit primaire (le circuit lui-même s'il ne dessert qu'elle, sinon un circuit à son nom)
        ecss.forEach(n => {
          if ((n.entrees || {}).circuitPrim) return;
          const r = Ins().raccorder(et, `${n.id}:ecs`, `pid|${pid.id}|${aps.length || ctas.length || ecss.length > 1 || c.emetteur !== 'ecs' ? -1 : i}`);
          if (r.ok) dit(r.texte);
        });
        if (!aps.length && !ctas.length) return;
        const relier = (cta, k) => { const r = L.relierAuSchema(et, cta, pid.id, k); if (r) dit(`${cta.titre} : batteries sur le circuit « ${r.pid.entrees.circuits[r.i].rep} » de ${pid.titre}.`); };
        if (saisons.length > 1) {
          // Change-over sur un seul schéma : terminaux sur le circuit (chaud et froid), CTA sur le circuit ou un circuit à son nom
          aps.forEach(a => { if (!a.circuit && !branche(`${term.id}:${a.rep}`)) { a.circuit = `${pid.id}|${c.rep}`; dit(`${a.rep} sur le circuit « ${c.rep} » de ${pid.titre}.`); } });
          ctas.forEach(cta => { if (['bc', 'bf'].every(b => { const x = lienCta(cta, b); return !x || x.lien; })) return; relier(cta, ctas.length === 1 && !aps.length && !c.annexe ? i : -1); });
          return;
        }
        const s = saisons[0], b = s === 'froid' ? 'bf' : 'bc';
        // Une seule CTA : réseau annexe du circuit
        if (ctas.length === 1 && !aps.length) {
          const x = lienCta(ctas[0], b);
          if (x && !x.lien && !c.annexe) relier(ctas[0], i);
          return;
        }
        // Terminaux, plusieurs batteries : réseau arborescent du circuit, une branche par terminal ou batterie
        let arbo = c.annexe ? notes.find(n => n.id === c.annexe) : null;
        if (arbo && arbo.type !== 'arbo') return;
        if (!arbo) {
          const rg = dc ? (s === 'froid' && dc.rcF ? dc.rcF : dc.rcC && s === 'chaud' ? dc.rcC : dc.rc) : null;
          const T = rg ? Math.round((rg[0] + rg[1]) / 2 * 10) / 10 : s === 'froid' ? 9.5 : 60, dT = rg ? Math.abs(rg[0] - rg[1]) : s === 'froid' ? 5 : 15;
          arbo = poser(ctx, `arbo:${cleP}:${c.reseau || c.rep}`, 'arbo', (/^(?:r[ée]seau|circuit|distribution)\b/i.test(c.rep) ? c.rep : `Réseau ${c.rep}`).slice(0, 80), { saison: s, T, dT,
            troncons: [{ rep: 'D', amont: '', nom: `Départ ${c.rep}`.slice(0, 60), L: '', zeta: 4, tube: '', P: '', dpEm: '' }] },
          { commentaire: `Réseau de distribution du circuit « ${c.rep} » (${pid.titre}) : une branche par terminal ou batterie de CTA, puissances et débits repris ; longueurs et tronçons amont à saisir.` });
          if (!L.circuitDeAnnexe(notes, arbo)) { L.relierAuSchema(et, arbo, pid.id, i); dit(`${arbo.titre} : réseau annexe du circuit « ${c.rep} » de ${pid.titre}.`); }
        }
        aps.filter(a => (SAISONS_BAT[a.batterie || 'chaude'] || []).includes(s)).forEach(a => {
          const cle = `${term.id}:${a.rep}`;
          if (a.circuit || branche(cle)) return;
          const rep = L.brancherSurArbo(et, term, arbo, cle);
          if (rep) dit(`${a.rep} : branche ${rep} de ${arbo.titre}.`);
        });
        ctas.forEach(cta => {
          const x = lienCta(cta, b);
          if (!x || x.lien) return;
          const rep = L.brancherSurArbo(et, cta, arbo, `${cta.id}:${b}`);
          if (rep) dit(`${cta.titre} (batterie ${s === 'froid' ? 'froide' : 'chaude'}) : branche ${rep} de ${arbo.titre}.`);
        });
      });
    });
    // Consommateurs encore libres (équipement hors réseau reconnu) : raccordés à la cible la plus vraisemblable
    const In = Ins();
    const libres = () => (essai(() => In.consommateurs(et)) || []).filter(c => !c.raccordements.length && ctx.poses.has(c.source.id) && ['terminal', 'cta', 'ecs'].includes(c.type));
    const vus = new Set();
    for (let tour = 0; tour < 200; tour++) {
      const c = libres().find(x => !vus.has(x.cle));
      if (!c) break;
      vus.add(c.cle);
      const src = notes.find(n => n.id === c.source.id);
      let emet = '';
      if (c.type === 'terminal') {
        const a = ((src.entrees || {}).appareils || []).find(y => y && `${src.id}:${y.rep}` === c.emetteur), x = a && invId.get(a._inv);
        if (!a || a.circuit || branche(c.emetteur) || (x && x.horsSchema)) continue;
        emet = EMET_TERMINAL(a.type);
      }
      if (c.type === 'cta') { const x = invId.get(src.origineInv); if (x && x.horsSchema) continue; }
      const cbs = essai(() => In.cibles(et, c.cle)) || [];
      const circuit = v => { const [, id, k] = v.split('|'), p = notes.find(n => n.id === id); return p && +k >= 0 ? ((p.entrees || {}).circuits || [])[+k] : null; };
      // Circuit d'un réseau arborescent (celui dont il est le réseau annexe)
      const circuitArbo = v => { const a = notes.find(n => n.id === v.split('|')[1]), r = a && L.circuitDeAnnexe(notes, a); return r ? ((r.pid.entrees || {}).circuits || [])[r.i] : null; };
      // Terminal : seulement sur un circuit (ou le réseau d'un circuit) de son émetteur ; sinon laissé au choix de l'utilisateur
      const choix = c.type === 'terminal' ? (cbs.find(x => x.valeur.startsWith('pid|') && (circuit(x.valeur) || {}).emetteur === emet) || cbs.find(x => x.valeur.startsWith('arbo|') && (circuitArbo(x.valeur) || {}).emetteur === emet))
        : c.type === 'ecs' ? (cbs.find(x => (circuit(x.valeur) || {}).emetteur === 'ecs') || cbs.find(x => /\|-1$/.test(x.valeur)))
          : (cbs.find(x => x.valeur.startsWith('arbo|') && (circuitArbo(x.valeur) || {}).emetteur === 'cta') || cbs.find(x => /\|-1$/.test(x.valeur)));
      if (!choix) continue;
      const r = In.raccorder(et, c.cle, choix.valeur);
      if (r.ok) dit(r.texte);
    }
  }

  /* ---------- Ensemble ---------- */
  // Crée toute l'étude d'après son inventaire. opts : { uid: () => identifiant, existants: 'garder' | 'maj' }
  // Rend { calculs: [{ cle, id, type, titre, etat: 'cree' | 'maj' | 'garde' }], raccordements: [texte], estimations,
  //   surfaces: [zones sans surface], nonRaccordes: [libellé], restes: [{ titre, info }] }
  function creerTout(et, opts = {}) {
    const inv = (et && et.inventaire) || [];
    if (!inv.length) return { erreur: 'Inventaire vide : lisez d\'abord le CCTP et le DPGF.', calculs: [], raccordements: [] };
    et.notes = et.notes || [];
    let n = 0;
    const ctx = { et, uid: opts.uid || (() => `ea${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`), existants: opts.existants === 'maj' ? 'maj' : 'garder',
      calculs: [], raccordements: [], pids: {}, ctas: new Map(), ecs: new Map(), terminaux: null, poses: new Set() };
    creerCalculs(ctx);
    raccorderTout(ctx);
    const est = Est().appliquer(et);
    const cs = essai(() => Ins().consommateurs(et)) || [];
    const G = Gd(), g = G ? essai(() => G.restesAFaire(et)) : null;
    return { calculs: ctx.calculs, raccordements: ctx.raccordements, estimations: est.estimees, reelles: est.reelles, surfaces: est.manquantes,
      nonRaccordes: cs.filter(c => !c.raccordements.length).map(c => c.libelle), restes: g ? g.etapes.filter(x => !x.fait).map(x => ({ titre: x.titre, info: x.info, groupe: x.groupe })) : [] };
  }
  // Calculs que « Créer toute l'étude » trouverait déjà dans l'étude (sans la modifier)
  function existants(et) {
    const r = creerTout(copie(et), { existants: 'garder' });
    return (r.calculs || []).filter(c => c.etat === 'garde');
  }

  /* ---------- Affichage (navigateur) ---------- */
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ETATS = { cree: 'créé', maj: 'mis à jour', garde: 'gardé tel quel' };
  // Bouton « ⚡ Créer toute l'étude » : calculs existants → garder ou mettre à jour ; compte rendu ; guide « Reste à faire »
  async function lancer(et) {
    if (!(et.inventaire || []).length) { toast('Inventaire vide : lisez d\'abord le CCTP et le DPGF.'); return typeof dialogueInventaire === 'function' ? dialogueInventaire(et) : null; }
    const deja = existants(et);
    const executer = mode => {
      const r = creerTout(et, { uid: typeof uidE === 'function' ? uidE : undefined, existants: mode });
      enregistrer(et);
      compteRendu(et, r);
    };
    if (!deja.length) return executer('garder');
    const b = Modal.open(`<h2>⚡ Créer toute l'étude</h2><p>${deja.length} calcul(s) déjà créé(s) d'après le dossier :</p><ul class="petit">${deja.map(c => `<li>${escH(c.titre)}</li>`).join('')}</ul>
      <p class="muted petit">Les garder tels quels, ou les mettre à jour d'après l'inventaire : seules les valeurs vides, restées par défaut ou estimées sont reprises du dossier et les lignes nouvelles ajoutées ; rien de ce qui a été saisi n'est écrasé. Les calculs manquants sont créés dans les deux cas, sans doublon.</p>
      <div class="actions"><button class="secondaire" id="ea-x">Annuler</button><button class="secondaire" id="ea-garder">Garder les existants</button><button id="ea-maj">Mettre à jour</button></div>`);
    b.querySelector('#ea-x').onclick = Modal.close;
    b.querySelector('#ea-garder').onclick = () => { Modal.close(); executer('garder'); };
    b.querySelector('#ea-maj').onclick = () => { Modal.close(); executer('maj'); };
  }
  function compteRendu(et, r) {
    if (r.erreur) return toast(r.erreur);
    const cr = r.calculs.filter(c => c.etat === 'cree').length;
    const b = Modal.open(`<h2>⚡ Étude créée d'après le dossier</h2>
      <h3>Calculs <span class="compte">${r.calculs.length}</span></h3><ul class="petit" id="ea-calculs">${r.calculs.map(c => `<li>${escH(c.titre)} — <span class="badge ${c.etat === 'cree' ? 'ok' : 'info'}">${ETATS[c.etat]}</span></li>`).join('')}</ul>
      <h3>Raccordements faits <span class="compte">${r.raccordements.length}</span></h3>${r.raccordements.length ? `<details><summary class="petit">Voir le détail</summary><ul class="petit">${r.raccordements.map(t => `<li>${escH(t)}</li>`).join('')}</ul></details>` : '<p class="muted petit">Aucun nouveau raccordement.</p>'}
      ${r.nonRaccordes.length ? `<p class="petit avert">Non raccordé(s) : ${escH(r.nonRaccordes.slice(0, 6).join(', '))}${r.nonRaccordes.length > 6 ? '…' : ''} (vue Installation hydraulique).</p>` : ''}
      <h3>Valeurs estimées <span class="compte">${r.estimations.length}</span></h3><p class="petit">${r.estimations.length ? 'Puissances et débits manquants estimés (ratios du type de bâtiment) : marqués « estimée — à confirmer » dans les calculs, remplacés dès qu\'une valeur réelle existe.' : 'Aucune.'}${r.surfaces.length ? ` <strong>${r.surfaces.length} zone(s) sans surface</strong> : à saisir pour estimer le reste.` : ''}</p>
      <h3>Reste à faire <span class="compte">${r.restes.length}</span></h3><ul class="petit">${r.restes.slice(0, 8).map(x => `<li><strong>${escH(x.titre)}</strong> — ${escH(x.info)}</li>`).join('')}${r.restes.length > 8 ? `<li>… et ${r.restes.length - 8} autre(s)</li>` : ''}</ul>
      <div class="actions">${r.surfaces.length ? '<button class="secondaire" id="ea-surf">📐 Saisir les surfaces</button>' : ''}<button id="ea-guide">📝 Voir le reste à faire</button></div>`);
    b.classList.add('large');
    const guide = () => { Modal.close(); if (typeof GuideEtude !== 'undefined' && GuideEtude.ouvrir) GuideEtude.ouvrir(); location.hash = `#/etude/${et.id}`; if (typeof App !== 'undefined') App.render(); setTimeout(() => { const g = document.querySelector('#guide-etude'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); };
    b.querySelector('#ea-guide').onclick = guide;
    const s = b.querySelector('#ea-surf'); if (s) s.onclick = () => { Modal.close(); dialogueSurfaces(et); };
    toast(`${cr} calcul(s) créé(s), ${r.raccordements.length} raccordement(s), ${r.estimations.length} valeur(s) estimée(s).`, 6000);
  }
  // Surfaces des zones (saisies une fois par zone) : puissances et débits manquants estimés ensuite
  function dialogueSurfaces(et) {
    const E = Est(), m = E.appliquer(JSON.parse(JSON.stringify(et)), { simulation: true }).manquantes, connues = Object.entries(et.surfaces || {});
    if (!m.length && !connues.length) return toast('Aucune zone sans surface : rien à estimer.');
    const b = Modal.open(`<h2>📐 Surfaces des zones</h2><p class="muted petit">Surface utile desservie (m²) par zone : les puissances des terminaux et des circuits et les débits d'air des CTA qui manquent en sont estimés (ratios du type de bâtiment, ${et.neuf === 'oui' ? 'neuf' : 'existant'}). Une seule saisie par zone.</p>
      <div class="defile-x"><table class="edit"><thead><tr><th>Zone</th><th>Pour</th><th>Surface (m²)</th></tr></thead><tbody>
      ${m.map(z => `<tr><td>${escH(z.nom)}</td><td class="petit muted">${escH(z.pour.slice(0, 3).join(', '))}${z.pour.length > 3 ? '…' : ''}</td><td><input data-surf="${escH(z.nom)}" class="nombre" inputmode="decimal" style="width:90px"></td></tr>`).join('')}
      ${connues.map(([, z]) => `<tr><td>${escH(z.nom)}</td><td class="petit muted">saisie</td><td><input data-surf="${escH(z.nom)}" value="${escH(z.S)}" class="nombre" inputmode="decimal" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
      <div class="actions"><button class="secondaire" id="sf-x">Annuler</button><button id="sf-ok">Estimer</button></div>`);
    b.querySelector('#sf-x').onclick = Modal.close;
    b.querySelector('#sf-ok').onclick = () => {
      b.querySelectorAll('[data-surf]').forEach(i => { if (i.value.trim() || (et.surfaces || {})[E.norm(i.dataset.surf)]) E.saisirSurface(et, i.dataset.surf, i.value); });
      const r = E.appliquer(et);
      enregistrer(et); Modal.close(); if (typeof App !== 'undefined') App.render();
      toast(`${r.estimees.length} valeur(s) estimée(s)${r.manquantes.length ? ` ; ${r.manquantes.length} zone(s) encore sans surface` : ''}.`, 5000);
    };
  }
  return { creerTout, existants, completer, raccorderTout, lancer, compteRendu, dialogueSurfaces, ORIGINE };
})();
if (typeof module !== 'undefined') module.exports = EtudeAuto;
