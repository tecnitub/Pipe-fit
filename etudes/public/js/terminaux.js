// Terminaux : cassettes, ventilo-convecteurs, poutres froides, aérothermes, splits… par local : batterie à eau
// (chaude, froide, 2 tubes réversible, 4 tubes) ou électrique, vanne de régulation (2, 3 ou 4 voies), débits d'eau
// et Kvs, données électriques de chaque appareil (ventilateur, batterie électrique) lues sur la fiche technique, et
// alimentation choisie appareil par appareil (électricien : attente du lot électricité, ou armoire CVC du local CVC)
// reprise dans le bilan électrique de l'étude. Module pur (navigateur, node, tests).
const Terminaux = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const TYPES = {
    cassette2: ['Cassette plafonnière 2 tubes', 'ventilo'], cassette4: ['Cassette plafonnière 4 tubes', 'ventilo'], vc2: ['Ventilo-convecteur 2 tubes', 'ventilo'], vc4: ['Ventilo-convecteur 4 tubes', 'ventilo'],
    gainable: ['Ventilo-convecteur gainable', 'ventilo'], poutre: ['Poutre froide, plafond rayonnant', 'aucun'], aerotherme: ['Aérotherme', 'aerotherme'], radiateur: ['Radiateur à eau', 'aucun'],
    rideau: ['Rideau d\'air', 'aerotherme'], split: ['Split, unité intérieure DRV', 'split'], radElec: ['Radiateur, convecteur électrique', 'resistance'], autre: ['Autre terminal', 'ventilo'],
  };
  const BATTERIES = { chaude: 'Eau chaude', froide: 'Eau froide', '2t': '2 tubes réversible (change-over)', '4t': '4 tubes (chaud et froid)', elec: 'Électrique seule', 'froide+elec': 'Eau froide + électrique', aucune: 'Sans batterie (détente directe…)' };
  const VANNES = { '2v': 'Vanne 2 voies (débit variable)', '3v': 'Vanne 3 voies (débit constant)', '4v': 'Vanne 4 voies (by-pass intégré, débit constant)', aucune: 'Sans vanne' };
  const REGULATIONS = { propre: 'Régulateur propre (report de défaut à la GTB)', maitre: 'Maître (son régulateur commande des esclaves)', esclave: 'Esclave (commandé par un maître)',
    automate: 'Piloté par l\'automate de l\'armoire', bus: 'Régulateur communicant (bus)' };
  // Une ligne par appareil : une ligne « × n » devient n lignes (repères numérotés à la suite)
  function eclater(lignes) {
    const out = []; let nb = 0;
    (lignes || []).forEach(l => {
      const n = Math.max(1, Math.round(num(l.n, 1)));
      if (n === 1) { out.push(l.n !== undefined ? (({ n: _n, ...x }) => x)(l) : l); return; }
      nb++;
      const m = /^(.*?)(\d+)$/.exec(String(l.rep || ''));
      for (let k = 0; k < n; k++) { const { n: _n, ...x } = l; out.push({ ...x, rep: m ? `${m[1]}${String(+m[2] + k).padStart(m[2].length, '0')}` : `${l.rep || 'T'}.${k + 1}` }); }
    });
    return { lignes: out, nb };
  }
  const KVS = [0.25, 0.4, 0.63, 1, 1.6, 2.5, 4, 6.3, 10, 16, 25, 40];
  const eau = b => ['chaude', 'froide', '2t', '4t', 'froide+elec'].includes(b);
  const chaudEau = b => ['chaude', '2t', '4t'].includes(b), froidEau = b => ['froide', '2t', '4t', 'froide+elec'].includes(b);
  const batElec = b => ['elec', 'froide+elec'].includes(b);

  // Alimentation : électricien (attente du lot électricité), armoire CVC du local CVC, ou une armoire précise de l'étude
  function optAlim(e, et, courant) {
    const arm = []; ((et && et.notes) || []).filter(n => n.type === 'elec').forEach(n => ((n.entrees || {}).armoires || []).filter(a => a.rep).forEach(a => { if (!arm.some(x => x[0] === a.rep)) arm.push([a.rep, `Armoire ${a.rep}${a.local ? ` (${a.local})` : ''}`]); }));
    const o = [['', '— Alimenté par… —'], ['elec', 'Électricien (attente du lot électricité)'], ['cvc', 'Armoire CVC (local CVC)'], ...arm];
    if (courant && !o.some(x => x[0] === courant)) o.push([courant, `Armoire ${courant}`]);
    return o;
  }
  const libAlim = a => (a === 'elec' ? 'Électricien (attente)' : a === 'cvc' ? 'Armoire CVC' : a ? `Armoire ${a}` : 'à choisir');

  function calculer(e) {
    const alertes = [], dTc = Math.abs(num(e.TcAller, 45) - num(e.TcRetour, 40)) || 5, dTf = Math.abs(num(e.TfRetour, 12) - num(e.TfAller, 7)) || 5, dpV = Math.max(1, num(e.dpVanne, 15));
    const kvs = q => KVS.find(k => k >= q / Math.sqrt(dpV / 100)) || KVS[KVS.length - 1];
    const lignes = (e.appareils || []).filter(l => l.type || l.rep).map((l, i) => {
      const t = TYPES[l.type] || TYPES.autre, n = Math.max(1, Math.round(num(l.n, 1))), b = l.batterie || 'chaude', rep = String(l.rep || `T${i + 1}`).trim();
      const Pch = num(l.Pch), Pfr = num(l.Pfr), qc = chaudEau(b) && Pch ? Pch / (1.163 * dTc) : 0, qf = froidEau(b) && Pfr ? Pfr / (1.163 * dTf) : 0;
      const pVent = num(l.Pvent) / 1000, pBe = batElec(b) || l.type === 'radElec' ? num(l.Pbe) : 0, pU = pVent + pBe;
      const v = eau(b) ? (l.vanne || '2v') : 'aucune', nbV = b === '4t' && v !== 'aucune' ? 2 : v !== 'aucune' ? 1 : 0;
      const qV = Math.max(qc, qf);
      if (eau(b) && v === 'aucune') alertes.push(alerte('attention', `${rep} : batterie à eau sans vanne de régulation (débit permanent, pas de régulation terminale).`));
      if (b === '4t' && v !== 'aucune') alertes.push(alerte('info', `${rep} : 4 tubes : une vanne sur le chaud et une sur le froid (${n * 2} vannes).`));
      if (v === '4v' && b !== '2t') alertes.push(alerte('info', `${rep} : vanne 4 voies : débit constant sur le réseau (by-pass intégré), retenue en général pour les unités en bout de réseau.`));
      if (t[1] !== 'aucun' && !num(l.Pvent) && l.type !== 'radElec') alertes.push(alerte('attention', `${rep} : puissance électrique du ventilateur à renseigner (fiche technique).`));
      if ((batElec(b) || l.type === 'radElec') && !num(l.Pbe)) alertes.push(alerte('erreur', `${rep} : puissance de la batterie électrique à renseigner.`));
      if (pU > 0 && !l.alim) alertes.push(alerte('attention', `${rep} : choisir l'alimentation (électricien ou armoire CVC).`));
      const tension = l.tension || (pU * 1000 / 230 > 16 ? 'tri' : 'mono');
      return { rep, local: l.local || '', t, type: l.type || 'autre', n, b, v, nbV, Pch, Pfr, qc, qf, kvs: qV ? kvs(qV) : 0, pVent, pBe, pU, P: pU * n, tension, alim: l.alim || '', ref: l.ref || '', regul: l.regul || 'propre', maitre: l.maitre || '' };
    });
    if (!lignes.length) alertes.push(alerte('attention', 'Ajoutez les terminaux (cassettes, ventilo-convecteurs…), une ligne par appareil.'));
    // Maître / esclave : chaque esclave est rattaché à un maître de la liste (même consigne, même commande)
    const parRep = new Map(lignes.map(x => [x.rep, x]));
    lignes.forEach(x => { x.esclaves = []; });
    lignes.forEach(x => {
      if (x.regul !== 'esclave') return;
      const m = parRep.get(x.maitre);
      if (!m || m === x) { alertes.push(alerte('erreur', `${x.rep} : esclave sans maître (choisissez l'appareil maître).`)); x.maitreOk = null; return; }
      if (m.regul === 'esclave') alertes.push(alerte('erreur', `${x.rep} : son maître ${m.rep} est lui-même esclave.`));
      if (m.local && x.local && m.local !== x.local) alertes.push(alerte('info', `${x.rep} (${x.local}) esclave de ${m.rep} (${m.local}) : pièces différentes, une seule consigne pour les deux.`));
      if (m.b !== x.b || m.v !== x.v) alertes.push(alerte('attention', `${x.rep} : batterie ou vanne différente de son maître ${m.rep} (commande commune à vérifier).`));
      m.esclaves.push(x.rep); x.maitreOk = m;
    });
    lignes.filter(x => x.regul === 'maitre' && !x.esclaves.length).forEach(x => alertes.push(alerte('info', `${x.rep} : maître sans esclave rattaché.`)));
    const tot = { n: lignes.reduce((s, x) => s + x.n, 0), Pch: lignes.reduce((s, x) => s + x.Pch * x.n, 0), Pfr: lignes.reduce((s, x) => s + x.Pfr * x.n, 0), qc: lignes.reduce((s, x) => s + x.qc * x.n, 0),
      qf: lignes.reduce((s, x) => s + x.qf * x.n, 0), P: lignes.reduce((s, x) => s + x.P, 0), vannes: lignes.reduce((s, x) => s + x.nbV * x.n, 0) };
    const parAlim = {};
    lignes.forEach(x => { const k = x.alim || ''; parAlim[k] = parAlim[k] || { P: 0, n: 0 }; parAlim[k].P += x.P; parAlim[k].n += x.n; });
    alertes.push(alerte('ok', `${tot.n} terminaux : ${nf(tot.Pch, 1)} kW chaud, ${nf(tot.Pfr, 1)} kW froid, ${nf(tot.P, 2)} kW électriques, ${tot.vannes} vanne(s).`));
    return {
      valeurs: { lignes, tot, parAlim },
      resume: [['Terminaux', `${tot.n} appareils`], ['Puissance chaud / froid', `${nf(tot.Pch, 1)} / ${nf(tot.Pfr, 1)} kW`], ['Débit d\'eau chaude / glacée', `${nf(tot.qc, 2)} / ${nf(tot.qf, 2)} m³/h`],
        ['Puissance électrique', `${nf(tot.P, 2)} kW (ventilateurs et batteries électriques)`], ['Vannes de régulation', `${tot.vannes}`]],
      tableaux: [{ titre: 'Terminaux', entetes: ['Repère', 'Pièce', 'Type', 'Régulation', 'Batterie', 'P chaud (kW/u)', 'P froid (kW/u)', 'Débit eau (m³/h/u)', 'Vanne', 'Kvs', 'P élec (kW/u)', 'P élec totale (kW)', 'Alimentation'],
        lignes: lignes.map(x => [x.rep, x.local, x.t[0], x.regul === 'esclave' ? `esclave de ${x.maitre}` : x.esclaves.length ? `maître de ${x.esclaves.join(', ')}` : (REGULATIONS[x.regul] || '').split(' (')[0], BATTERIES[x.b], x.Pch ? nf(x.Pch, 2) : '—', x.Pfr ? nf(x.Pfr, 2) : '—', x.qc || x.qf ? [x.qc && `ch ${nf(x.qc, 3)}`, x.qf && `fr ${nf(x.qf, 3)}`].filter(Boolean).join(' · ') : '—',
          x.nbV ? `${VANNES[x.v].split(' (')[0]}${x.nbV > 1 ? ' × 2' : ''}` : '—', x.kvs ? nf(x.kvs, 2) : '—', nf(x.pU, 3), nf(x.P, 2), libAlim(x.alim)]) },
        { titre: 'Puissance électrique par alimentation', entetes: ['Alimentation', 'Appareils', 'P installée (kW)'], lignes: [...Object.entries(parAlim).map(([k, x]) => [libAlim(k), x.n, nf(x.P, 2)]), ['Total', tot.n, nf(tot.P, 2)]], total: true }],
      alertes,
      hypotheses: ['Débit d\'eau = P / (1,163 × ΔT) au régime saisi ; Kvs = débit / √(ΔP vanne en bar), valeur normalisée immédiatement supérieure.',
        'Puissance électrique d\'un appareil = ventilateur (vitesse maximale, fiche technique) + batterie électrique ; reprise dans le bilan électrique avec l\'alimentation choisie.'],
      synthese: `${tot.n} terminaux · ${nf(tot.Pch, 0)} kW ch · ${nf(tot.Pfr, 0)} kW fr · ${nf(tot.P, 1)} kW élec`,
    };
  }

  // Fiche technique d'un terminal : puissances chaud / froid, ventilateur (puissance absorbée maximale), batterie électrique,
  // tension, débit d'air, fabricant et référence
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h').replace(/\s+/g, ' ').trim();
  const NB = '(\\d+(?:[.,]\\d+)?)';
  const nombres = (x, unite) => [...x.matchAll(new RegExp(`${NB}\\s*(?:${unite})(?![a-z])`, 'g'))].map(m => Number(m[1].replace(',', '.')));
  function lireFiche(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), X = L.map(norm), v = {}, src = {};
    const pose = (k, val, i) => { if (v[k] === undefined && Number.isFinite(val)) { v[k] = Math.round(val * 1000) / 1000; src[k] = L[i].trim().slice(0, 140); } };
    X.forEach((x, i) => {
      const elecBat = /batterie electrique|resistance(?:s)? electrique|rechauffeur electrique|appoint electrique|electric heater/.test(x);
      if (elecBat) { const kw = nombres(x, 'kw').filter(n => n > 0 && n < 100), w = nombres(x, 'w').filter(n => n >= 100 && n < 100000); pose('Pbe', kw.length ? Math.max(...kw) : w.length ? Math.max(...w) / 1000 : undefined, i); return; }
      if (/puissance (?:electrique )?absorbee|puissance electrique|consommation electrique|puissance moteur|absorbed power|power input|\bp ?abs/.test(x)) {
        const w = nombres(x, 'w').filter(n => n >= 3 && n < 10000), kw = nombres(x, 'kw').filter(n => n > 0 && n < 10);
        pose('Pvent', w.length ? Math.max(...w) : kw.length ? Math.max(...kw) * 1000 : undefined, i); return;
      }
      if (/puissance|capacite|capacity/.test(x)) {
        const kw = nombres(x, 'kw').filter(n => n > 0.1 && n < 500);
        if (kw.length && /frigorifique|froid|refroidissement|cooling|totale? froid/.test(x)) pose('Pfr', kw[0], i);
        else if (kw.length && /calorifique|chaud|chauffage|heating/.test(x)) pose('Pch', kw[0], i);
      }
      if (/debit d'air|debit air|air flow|airflow/.test(x)) { const q = nombres(x, 'm3/h').filter(n => n >= 50 && n < 20000); if (q.length) pose('Qair', Math.max(...q), i); }
      if (/\bkvs\b/.test(x)) { const m = /kvs[^0-9]{0,10}(\d+(?:[.,]\d+)?)/.exec(x); if (m) pose('Kvs', Number(m[1].replace(',', '.')), i); }
      if (/alimentation|tension|power supply|supply/.test(x)) { if (/400\s*v|3\s*~|3\s*ph|tri/.test(x)) { if (!v.tension) { v.tension = 'tri'; src.tension = L[i].trim().slice(0, 140); } } else if (/230\s*v|220-240|1\s*~|mono/.test(x) && !v.tension) { v.tension = 'mono'; src.tension = L[i].trim().slice(0, 140); } }
    });
    let fabricant = '', reference = '';
    try {
      const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
      const a = FT.analyser({ texte: L.join('\n') }); fabricant = a.fabricant || ''; reference = (a.references || [])[0] || '';
    } catch (err) { /* sans bibliothèque */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }
  const LIBELLES = { Pch: ['Puissance chaud', 'kW', 'Pch'], Pfr: ['Puissance froid', 'kW', 'Pfr'], Pvent: ['Puissance électrique du ventilateur', 'W', 'Pvent'], Pbe: ['Batterie électrique', 'kW', 'Pbe'], tension: ['Tension', '', 'tension'] };

  N.TYPES.terminaux = {
    titre: 'Terminaux : cassettes, ventilo-convecteurs, aérothermes…', icone: '🌀', famille: 'Hydraulique',
    description: 'Terminaux local par local : batterie à eau (chaude, froide, 2 ou 4 tubes) ou électrique, vanne 2, 3 ou 4 voies, débits d\'eau et Kvs, puissance électrique du ventilateur et de la batterie électrique (fiche technique) et alimentation de chaque appareil (électricien ou armoire CVC), reprises dans le bilan électrique.',
    champs: [{ g: 'Régimes d\'eau' }, { k: 'TcAller', l: 'Eau chaude : départ', u: '°C', d: 45 }, { k: 'TcRetour', l: 'Eau chaude : retour', u: '°C', d: 40 },
      { k: 'TfAller', l: 'Eau glacée : départ', u: '°C', d: 7 }, { k: 'TfRetour', l: 'Eau glacée : retour', u: '°C', d: 12 }, { k: 'dpVanne', l: 'Perte de charge des vannes (Kvs)', u: 'kPa', d: 15 },
      { g: 'Terminaux' },
      { k: 'appareils', l: 'Appareils, une ligne par appareil (« + Ajouter une ligne » copie la précédente avec le repère suivant) — « 📄 Fiche technique » remplit une ligne', t: 'lignes', d: [{ rep: 'CA-01', local: 'Bureau 1', type: 'cassette2', Pch: 3.2, Pfr: 3.6, batterie: '2t', vanne: '2v', Pvent: 45, Pbe: '', tension: 'mono', alim: '', regul: 'propre', maitre: '', ref: '' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'local', l: 'Pièce (repérage)', t: 't' }, { k: 'type', l: 'Type', t: 's', o: Object.entries(TYPES).map(([k, x]) => [k, x[0]]) },
          { k: 'Pch', l: 'P chaud (kW/u)' }, { k: 'Pfr', l: 'P froid (kW/u)' }, { k: 'batterie', l: 'Batterie', t: 's', o: Object.entries(BATTERIES) }, { k: 'vanne', l: 'Vanne', t: 's', o: Object.entries(VANNES) },
          { k: 'Pvent', l: 'Ventilateur (W/u)' }, { k: 'Pbe', l: 'Batterie élec. (kW/u)' }, { k: 'tension', l: 'Tension', t: 's', o: [['', 'Auto'], ['mono', '230 V mono'], ['tri', '400 V tri']] },
          { k: 'alim', l: 'Alimenté par', t: 's', o: (e, et) => optAlim(e, et) }, { k: 'regul', l: 'Régulation', t: 's', o: Object.entries(REGULATIONS) },
          { k: 'maitre', l: 'Maître (si esclave)', t: 's', o: e => [['', '—'], ...((e && e.appareils) || []).filter(a => a.rep && a.regul !== 'esclave').map(a => [a.rep, `${a.rep}${a.local ? ` (${a.local})` : ''}`])] },
          { k: 'ref', l: 'Fabricant, référence', t: 't' }] }],
    calcul: calculer,
  };

  // Points automate d'un appareil piloté par l'automate : ventilateur, vanne(s), batterie électrique, sonde d'ambiance, défaut
  function pointsTerminal(x) {
    const p = [];
    if (x.t[1] !== 'aucun' && x.type !== 'radElec') p.push(['Commande de marche du ventilateur', 'STOR'], ['Consigne de vitesse du ventilateur', 'SA']);
    if (x.nbV === 2) p.push(['Commande de la vanne chaud (0-10 V)', 'SA'], ['Commande de la vanne froid (0-10 V)', 'SA']);
    else if (x.nbV === 1) p.push([`Commande de la ${VANNES[x.v].split(' (')[0].toLowerCase()} (0-10 V)`, 'SA']);
    if (x.pBe) p.push(['Commande de la batterie électrique', 'STOR']);
    if (x.b === '2t') p.push(['Inversion chaud / froid (change-over)', 'ETOR']);
    p.push(['Température ambiante', 'EA'], ['Défaut (ventilateur, filtre, thermostat de sécurité)', 'ETOR']);
    return p;
  }
  // Analyse fonctionnelle d'un appareil d'après sa batterie, sa vanne et sa régulation
  function fonctionnement(x) {
    const bat = { chaude: 'la batterie eau chaude', froide: 'la batterie eau glacée', '2t': 'la batterie 2 tubes (eau chaude l\'hiver, eau glacée l\'été selon l\'inversion de la production)', '4t': 'les batteries eau chaude et eau glacée (séquences chaud / froid avec zone neutre)', 'froide+elec': 'la batterie eau glacée et la batterie électrique (appoint de chauffage)' }[x.b];
    const vanne = x.nbV === 2 ? 'deux vannes (chaud et froid) modulées' : x.v === '2v' ? 'une vanne 2 voies modulante (débit variable sur le réseau)' : x.v === '3v' ? 'une vanne 3 voies modulante (débit constant sur le réseau)' : x.v === '4v' ? 'une vanne 4 voies (by-pass intégré, débit constant sur le réseau)' : '';
    if (x.regul === 'esclave') return `${x.t[0]}${x.local ? ` (${x.local})` : ''} esclave de ${x.maitre || '—'} : ventilateur${x.nbV ? ' et vanne' + (x.nbV > 1 ? 's' : '') : ''} commandés en parallèle par le régulateur du maître (même consigne, sans sonde propre), défaut reporté par le maître`;
    const qui = x.regul === 'automate' ? 'l\'automate de l\'armoire, d\'après la sonde d\'ambiance et la consigne du local (programmation horaire, réduit inoccupation)' : x.regul === 'bus' ? `${x.n > 1 ? 'leur' : 'son'} régulateur communicant (consignes, horaires et états par le bus de la GTB)` : `${x.n > 1 ? 'leur' : 'son'} régulateur propre (thermostat d'ambiance), défaut reporté à la GTB`;
    const t = [`${x.n > 1 ? `${x.n} × ` : ''}${x.t[0]}${x.local ? ` (${x.local})` : ''} régulé${x.n > 1 ? 's' : ''} par ${qui}${(x.esclaves || []).length ? `, maître de ${x.esclaves.join(', ')} (commandés en parallèle, même consigne)` : ''}`];
    if (bat && vanne) t.push(`${vanne} sur ${bat}`);
    else if (x.b === 'elec' || x.type === 'radElec') t.push('batterie électrique commandée par étages ou triac, thermostat de sécurité à réarmement manuel');
    if (x.t[1] !== 'aucun' && x.type !== 'radElec') t.push('ventilateur à vitesse ajustée selon l\'écart à la consigne, arrêt en inoccupation');
    if (x.pBe && x.b !== 'elec') t.push('batterie électrique en appoint, verrouillée sur la marche du ventilateur');
    return t.join(' ; ');
  }
  // Lignes d'équipements pour le bilan électrique : une ligne par groupe d'appareils identiques ; les points automate et
  // l'analyse fonctionnelle sont calculés par appareil
  function versElec(n, r) {
    const out = [];
    ((r && r.valeurs && r.valeurs.lignes) || []).filter(x => x.P > 0 || x.regul === 'automate' || x.nbV).forEach((x, i) => {
      const m = /^(.*?)(\d+)$/.exec(x.rep);
      for (let k = 0; k < x.n; k++) {
        const rep = x.n === 1 ? x.rep : m ? `${m[1]}${String(+m[2] + k).padStart(m[2].length, '0')}` : `${x.rep}.${k + 1}`;
        // Esclave d'un maître piloté par l'automate : commandé par le maître, pas de points propres
        const regulation = x.regul === 'esclave' ? 'esclave' : x.regul === 'automate' ? 'terminal' : x.regul === 'bus' ? 'bus' : x.type === 'radElec' ? 'tor' : 'regul';
        out.push({ src: `${n.id}:t${i}:${x.rep}${x.n > 1 ? `:${k}` : ''}`, rep, designation: `${x.t[0]}${x.local ? ` — ${x.local}` : ''}${x.ref ? ` — ${x.ref}` : ''}${x.pBe ? ` (dont batterie électrique ${nf(x.pBe, 2)} kW)` : ''}`,
          type: x.t[1] === 'aucun' ? 'autre' : x.type === 'radElec' ? 'resistance' : x.t[1], P: Math.round(x.pU * 100) / 100, tension: x.pU > 0 ? x.tension : '24V', regulation,
          regImpose: true, alim: x.alim || '', local: x.local, nb: 1, pointsUnit: x.regul === 'automate' ? pointsTerminal(x) : null, afAuto: fonctionnement({ ...x, n: 1 }) });
      }
    });
    return out;
  }
  return { TYPES, BATTERIES, VANNES, REGULATIONS, eclater, pointsTerminal, fonctionnement, optAlim, libAlim, calculer, lireFiche, LIBELLES, versElec };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Terminaux;
