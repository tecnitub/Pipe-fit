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
    rideau: ['Rideau d\'air', 'aerotherme'], split: ['Split, unité intérieure DRV', 'split'], radElec: ['Radiateur, convecteur électrique', 'resistance'],
    ctaSf: ['CTA simple flux (avec ou sans batterie)', 'ventilateur'],
    pompeDist: ['Pompe de distribution (réseau)', 'pompe'], pompePrim: ['Pompe du réseau primaire', 'pompe'],
    tourelle: ['Tourelle d\'extraction', 'ventilateur'], registreMot: ['Registre motorisé (régulation aéraulique)', 'registre'], registreMan: ['Registre manuel de réglage', 'sansElec'],
    sondeCO2: ['Sonde de CO₂ (qualité d\'air)', 'sondeAir'], autre: ['Autre terminal', 'ventilo'],
  };
  const estPompe = type => (TYPES[type] || [])[1] === 'pompe';
  // Équipements sans batterie à eau (pompes, aéraulique)
  const sansEau = type => ['pompe', 'registre', 'sansElec', 'sondeAir'].includes((TYPES[type] || [])[1]) || type === 'tourelle';
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
      const t = TYPES[l.type] || TYPES.autre, n = Math.max(1, Math.round(num(l.n, 1))), pompe = estPompe(l.type), b = sansEau(l.type) ? 'aucune' : l.batterie || 'chaude', rep = String(l.rep || `T${i + 1}`).trim();
      const Pch = num(l.Pch), Pfr = num(l.Pfr), qc = chaudEau(b) && Pch ? Pch / (1.163 * dTc) : 0, qf = froidEau(b) && Pfr ? Pfr / (1.163 * dTf) : 0;
      const pVent = num(l.Pvent) / 1000, pBe = batElec(b) || l.type === 'radElec' ? num(l.Pbe) : 0, pU = pVent + pBe;
      const v = eau(b) ? (l.vanne || '2v') : 'aucune', nbV = b === '4t' && v !== 'aucune' ? 2 : v !== 'aucune' ? 1 : 0;
      const qV = Math.max(qc, qf);
      if (eau(b) && v === 'aucune') alertes.push(alerte('attention', `${rep} : batterie à eau sans vanne de régulation (débit permanent, pas de régulation terminale).`));
      if (b === '4t' && v !== 'aucune') alertes.push(alerte('info', `${rep} : 4 tubes : une vanne sur le chaud et une sur le froid (${n * 2} vannes).`));
      if (v === '4v' && b !== '2t') alertes.push(alerte('info', `${rep} : vanne 4 voies : débit constant sur le réseau (by-pass intégré), retenue en général pour les unités en bout de réseau.`));
      if (!['aucun', 'registre', 'sansElec', 'sondeAir'].includes(t[1]) && !num(l.Pvent) && l.type !== 'radElec') alertes.push(alerte('attention', `${rep} : puissance électrique ${pompe ? 'de la pompe' : 'du ventilateur'} à renseigner (fiche technique).`));
      if (pompe && !(num(l.Qp) > 0 && num(l.Hp) > 0)) alertes.push(alerte('attention', `${rep} : débit et hauteur de la pompe à renseigner (fiche technique), pour le contrôle dans le réseau arborescent.`));
      if ((batElec(b) || l.type === 'radElec') && !num(l.Pbe)) alertes.push(alerte('erreur', `${rep} : puissance de la batterie électrique à renseigner.`));
      if (pU > 0 && !l.alim) alertes.push(alerte('attention', `${rep} : choisir l'alimentation (électricien ou armoire CVC).`));
      const tension = l.tension || (pU * 1000 / 230 > 16 ? 'tri' : 'mono');
      return { rep, local: l.local || '', t, type: l.type || 'autre', n, b, v, nbV, Pch, Pfr, qc, qf, kvs: qV ? kvs(qV) : 0, pVent, pBe, pU, P: pU * n, tension, alim: l.alim || '', ref: l.ref || '', regul: l.regul || 'propre', maitre: l.maitre || '', dpC: num(l.dpEauC), dpF: num(l.dpEauF), pompe, Qp: num(l.Qp), Hp: num(l.Hp) };
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
    // Besoins des pièces (bilan pièce par pièce de l'étude) comparés aux terminaux installés dans chaque pièce
    const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const besoins = e._besoins && typeof e._besoins === 'object' ? Object.values(e._besoins) : [];
    const cmp = besoins.map(b => { const ici = lignes.filter(x => nrm(x.local) === nrm(b.nom)); const ch = ici.reduce((s, x) => s + x.Pch * x.n, 0), fr = ici.reduce((s, x) => s + x.Pfr * x.n, 0); return { b, ch, fr, n: ici.reduce((s, x) => s + x.n, 0) }; });
    cmp.forEach(c => {
      if (!c.n) alertes.push(alerte('attention', `${c.b.nom} : aucun terminal pour ${nf(c.b.Pch, 2)} kW de chauffage et ${nf(c.b.Pfr, 2)} kW de froid (bilan par pièce).`));
      else if (c.ch + 1e-9 < c.b.Pch * 0.95 || c.fr + 1e-9 < c.b.Pfr * 0.95) alertes.push(alerte('erreur', `${c.b.nom} : terminaux insuffisants (${nf(c.ch, 2)} / ${nf(c.b.Pch, 2)} kW chaud, ${nf(c.fr, 2)} / ${nf(c.b.Pfr, 2)} kW froid).`));
    });
    alertes.push(alerte('ok', `${tot.n} terminaux : ${nf(tot.Pch, 1)} kW chaud, ${nf(tot.Pfr, 1)} kW froid, ${nf(tot.P, 2)} kW électriques, ${tot.vannes} vanne(s).`));
    return {
      valeurs: { lignes, tot, parAlim },
      resume: [['Terminaux', `${tot.n} appareils`], ['Puissance chaud / froid', `${nf(tot.Pch, 1)} / ${nf(tot.Pfr, 1)} kW`], ['Débit d\'eau chaude / glacée', `${nf(tot.qc, 2)} / ${nf(tot.qf, 2)} m³/h`],
        ['Puissance électrique', `${nf(tot.P, 2)} kW (ventilateurs et batteries électriques)`], ['Vannes de régulation', `${tot.vannes}`]],
      tableaux: [{ titre: 'Terminaux', entetes: ['Repère', 'Pièce', 'Type', 'Régulation', 'Batterie', 'P chaud (kW/u)', 'P froid (kW/u)', 'Débit eau (m³/h/u)', 'Vanne', 'Kvs', 'P élec (kW/u)', 'P élec totale (kW)', 'Alimentation'],
        lignes: lignes.map(x => [x.rep, x.local, x.t[0], x.regul === 'esclave' ? `esclave de ${x.maitre}` : x.esclaves.length ? `maître de ${x.esclaves.join(', ')}` : (REGULATIONS[x.regul] || '').split(' (')[0], BATTERIES[x.b], x.Pch ? nf(x.Pch, 2) : '—', x.Pfr ? nf(x.Pfr, 2) : '—', x.qc || x.qf ? [x.qc && `ch ${nf(x.qc, 3)}`, x.qf && `fr ${nf(x.qf, 3)}`].filter(Boolean).join(' · ') : '—',
          x.nbV ? `${VANNES[x.v].split(' (')[0]}${x.nbV > 1 ? ' × 2' : ''}` : '—', x.kvs ? nf(x.kvs, 2) : '—', nf(x.pU, 3), nf(x.P, 2), libAlim(x.alim)]) },
        ...(cmp.length ? [{ titre: 'Besoins des pièces (bilan pièce par pièce) et terminaux installés', entetes: ['Pièce', 'Étage', 'Besoin chaud (kW)', 'Installé chaud (kW)', 'Besoin froid (kW)', 'Installé froid (kW)', 'Terminaux', 'Couverture'],
          lignes: cmp.map(c => [c.b.nom, c.b.etage || '', nf(c.b.Pch, 2), nf(c.ch, 2), nf(c.b.Pfr, 2), nf(c.fr, 2), String(c.n), !c.n ? 'aucun terminal' : c.ch + 1e-9 >= c.b.Pch * 0.95 && c.fr + 1e-9 >= c.b.Pfr * 0.95 ? 'OK' : 'insuffisant']) }] : []),
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
      // Perte de charge côté eau de la batterie (kPa, ou mCE)
      if (/perte de charge|pertes de charge|delta ?p|pressure drop/.test(x) && /eau|hydraulique|water|batterie/.test(x) && !/air|aeraulique/.test(x)) {
        const k = nombres(x, 'kpa').filter(n => n > 0 && n < 200), m = k.length ? [] : nombres(x, 'm\\s*ce|mce').filter(n => n > 0 && n < 20).map(n => n * 9.81);
        const p = k.length ? k : m;
        if (p.length) { if (/froid|frigorifique|cooling|glacee/.test(x)) pose('dpEauF', p[0], i); else if (/chaud|calorifique|heating/.test(x)) pose('dpEauC', p[0], i); else { pose('dpEauC', p[0], i); pose('dpEauF', p[0], i); } }
      }
      if (/debit d'air|debit air|air flow|airflow/.test(x)) { const q = nombres(x, 'm3/h').filter(n => n >= 50 && n < 20000); if (q.length) pose('Qair', Math.max(...q), i); }
      if (/\bkvs\b/.test(x)) { const m = /kvs[^0-9]{0,10}(\d+(?:[.,]\d+)?)/.exec(x); if (m) pose('Kvs', Number(m[1].replace(',', '.')), i); }
      if (/alimentation|tension|power supply|supply/.test(x)) { if (/400\s*v|3\s*~|3\s*ph|tri/.test(x)) { if (!v.tension) { v.tension = 'tri'; src.tension = L[i].trim().slice(0, 140); } } else if (/230\s*v|220-240|1\s*~|mono/.test(x) && !v.tension) { v.tension = 'mono'; src.tension = L[i].trim().slice(0, 140); } }
    });
    // Pompe : point de fonctionnement et puissance absorbée (lecture des fiches de pompes)
    try {
      const FE = typeof FicheEquip !== 'undefined' ? FicheEquip : require('./fiche-equipement'), p = FE.lire(L);
      const q = p.valeurs.Q ?? p.valeurs.Qmax, h = p.valeurs.H ?? p.valeurs.Hmax;
      if (Number.isFinite(q) && Number.isFinite(h)) { v.Qp = q; v.Hp = h; src.Qp = p.sources.Q || p.sources.Qmax; src.Hp = p.sources.H || p.sources.Hmax; if (v.Pvent === undefined && Number.isFinite(p.valeurs.P1)) { v.Pvent = p.valeurs.P1; src.Pvent = p.sources.P1; } }
    } catch (err) { /* sans lecteur de fiches de pompes */ }
    let fabricant = '', reference = '';
    try {
      const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
      const a = FT.analyser({ texte: L.join('\n') }); fabricant = a.fabricant || ''; reference = (a.references || [])[0] || '';
    } catch (err) { /* sans bibliothèque */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }
  const LIBELLES = { Pch: ['Puissance chaud', 'kW', 'Pch'], Pfr: ['Puissance froid', 'kW', 'Pfr'], Pvent: ['Puissance électrique du ventilateur', 'W', 'Pvent'], Pbe: ['Batterie électrique', 'kW', 'Pbe'], tension: ['Tension', '', 'tension'], dpEauC: ['Perte de charge eau, batterie chaude', 'kPa', 'dpEauC'], dpEauF: ['Perte de charge eau, batterie froide', 'kPa', 'dpEauF'], Qp: ['Pompe : débit au point de fonctionnement', 'm³/h', 'Qp'], Hp: ['Pompe : hauteur au point de fonctionnement', 'mCE', 'Hp'] };

  N.TYPES.terminaux = {
    titre: 'Terminaux : cassettes, ventilo-convecteurs, aérothermes…', icone: '🌀', famille: 'Hydraulique',
    description: 'Terminaux local par local : batterie à eau (chaude, froide, 2 ou 4 tubes) ou électrique, vanne 2, 3 ou 4 voies, débits d\'eau et Kvs, puissance électrique du ventilateur et de la batterie électrique (fiche technique) et alimentation de chaque appareil (électricien ou armoire CVC), reprises dans le bilan électrique.',
    champs: [{ g: 'Régimes d\'eau' },
      { k: 'prodChaud', l: 'Production d\'eau chaude (régime repris)', t: 's', o: (e, et) => [['', 'Saisie'], ...(et ? (et.notes || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'pid').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`]) : e.prodChaud ? [[e.prodChaud, e.prodChaud]] : [])], d: '' },
      { k: 'prodFroid', l: 'Production d\'eau glacée (régime repris)', t: 's', o: (e, et) => [['', 'Saisie'], ...(et ? (et.notes || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'pid').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`]) : e.prodFroid ? [[e.prodFroid, e.prodFroid]] : [])], d: '' },
      { k: 'TcAller', l: 'Eau chaude : départ', u: '°C', d: 45 }, { k: 'TcRetour', l: 'Eau chaude : retour', u: '°C', d: 40 },
      { k: 'TfAller', l: 'Eau glacée : départ', u: '°C', d: 7 }, { k: 'TfRetour', l: 'Eau glacée : retour', u: '°C', d: 12 }, { k: 'dpVanne', l: 'Perte de charge des vannes (Kvs)', u: 'kPa', d: 15 },
      { g: 'Terminaux' },
      { k: 'appareils', l: 'Appareils, une ligne par appareil (« + Ajouter une ligne » copie la précédente avec le repère suivant) — « 📄 Fiche technique » remplit une ligne', t: 'lignes', d: [{ rep: 'CA-01', local: 'Bureau 1', type: 'cassette2', Pch: 3.2, Pfr: 3.6, batterie: '2t', vanne: '2v', Pvent: 45, Pbe: '', tension: 'mono', alim: '', regul: 'propre', maitre: '', ref: '' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'local', l: 'Pièce (repérage)', t: 't' }, { k: 'type', l: 'Type', t: 's', o: Object.entries(TYPES).map(([k, x]) => [k, x[0]]) },
          { k: 'Pch', l: 'P chaud (kW/u)' }, { k: 'Pfr', l: 'P froid (kW/u)' }, { k: 'batterie', l: 'Batterie', t: 's', o: Object.entries(BATTERIES) }, { k: 'vanne', l: 'Vanne', t: 's', o: Object.entries(VANNES) },
          { k: 'dpEauC', l: 'ΔP eau chaud (kPa)' }, { k: 'dpEauF', l: 'ΔP eau froid (kPa)' },
          { k: 'Qp', l: 'Pompe : débit (m³/h)' }, { k: 'Hp', l: 'Pompe : HMT (mCE)' },
          { k: 'Pvent', l: 'Moteur : ventilateur ou pompe (W)' }, { k: 'Pbe', l: 'Batterie élec. (kW/u)' }, { k: 'tension', l: 'Tension', t: 's', o: [['', 'Auto'], ['mono', '230 V mono'], ['tri', '400 V tri']] },
          { k: 'alim', l: 'Alimenté par', t: 's', o: (e, et) => optAlim(e, et) }, { k: 'regul', l: 'Régulation', t: 's', o: Object.entries(REGULATIONS) },
          { k: 'maitre', l: 'Maître (si esclave)', t: 's', o: e => [['', '—'], ...((e && e.appareils) || []).filter(a => a.rep && a.regul !== 'esclave').map(a => [a.rep, `${a.rep}${a.local ? ` (${a.local})` : ''}`])] },
          { k: 'circuit', l: 'Circuit du schéma de principe', t: 's', o: (e, et) => [['', '—'], ...(et ? (et.notes || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'pid').flatMap(([n, i]) => ((n.entrees || {}).circuits || []).filter(c => c.rep).map(c => [`${n.id}|${c.rep}`, `N${i + 1} — ${c.rep}`])) : [])] },
          { k: 'ref', l: 'Fabricant, référence', t: 't' }] }],
    calcul: calculer,
  };

  // Points automate d'un appareil piloté par l'automate : ventilateur, vanne(s), batterie électrique, sonde d'ambiance, défaut
  function pointsTerminal(x) {
    if (x.type === 'registreMot') return [['Commande du registre (0-10 V)', 'SA'], ['Recopie de position du registre', 'EA']];
    if (x.type === 'sondeCO2') return [['Concentration de CO₂', 'EA']];
    if (x.type === 'tourelle') return [['Commande de marche de la tourelle', 'STOR'], ['Retour de marche (pressostat)', 'ETOR'], ['Défaut de la tourelle', 'ETOR'], ...(x.pVent > 0.37 ? [['Consigne de vitesse', 'SA']] : [])];
    if (x.pompe) return [['Commande de marche de la pompe', 'STOR'], ['Consigne de vitesse de la pompe', 'SA'], ['Retour de marche de la pompe', 'ETOR'], ['Défaut de la pompe', 'ETOR']];
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
    const lieu = x.local ? ` (${x.local})` : '';
    if (x.type === 'registreMot') return `${x.t[0]}${lieu} modulé (0-10 V) selon la concentration de CO₂${x.maitre ? ` mesurée par ${x.maitre}` : ' du local'} (débit mini d'hygiène, ouverture progressive de 800 à 1 000 ppm), fermé en inoccupation`;
    if (x.type === 'sondeCO2') return `${x.t[0]}${lieu} : mesure de la qualité d'air transmise ${x.regul === 'automate' ? 'à l\'automate' : x.regul === 'bus' ? 'par le bus' : 'au registre ou au régulateur associé'} (consigne 800 à 1 000 ppm)`;
    if (x.type === 'registreMan') return `${x.t[0]}${lieu} : réglé et bloqué à la mise en service (relevé d'équilibrage aéraulique)`;
    if (x.type === 'tourelle') return `${x.t[0]}${lieu} ${x.regul === 'automate' ? 'mise en marche par l\'automate selon la programmation horaire, retour de marche contrôlé par pressostat' : 'en marche selon son interrupteur ou son horloge'}, défaut reporté`;
    if (x.pompe) return `${x.t[0]}${x.local ? ` (${x.local})` : ''}${x.Qp ? ` : ${nf(x.Qp, 2)} m³/h sous ${nf(x.Hp, 1)} mCE` : ''}, ${x.regul === 'automate' ? 'mise en marche et vitesse commandées par l\'automate (pression différentielle constante ou proportionnelle), retour de marche et défaut contrôlés' : x.regul === 'bus' ? 'pilotée par bus (marche, consigne, vitesse, défauts)' : 'à vitesse variable intégrée (consigne réglée sur la pompe), défaut reporté à la GTB'}`;
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
    ((r && r.valeurs && r.valeurs.lignes) || []).filter(x => x.type !== 'registreMan' && (x.P > 0 || x.regul === 'automate' || x.nbV || ['registreMot', 'sondeCO2'].includes(x.type))).forEach((x, i) => {
      const m = /^(.*?)(\d+)$/.exec(x.rep);
      for (let k = 0; k < x.n; k++) {
        const rep = x.n === 1 ? x.rep : m ? `${m[1]}${String(+m[2] + k).padStart(m[2].length, '0')}` : `${x.rep}.${k + 1}`;
        // Esclave d'un maître piloté par l'automate : commandé par le maître, pas de points propres
        const aero = { registreMot: ['vanne', x.regul === 'automate' ? 'terminal' : 'v010r'], sondeCO2: ['sonde', x.regul === 'automate' ? 'terminal' : 'sonde'] }[x.type];
        const regulation = aero ? aero[1] : x.regul === 'esclave' ? 'esclave' : x.regul === 'automate' ? 'terminal' : x.regul === 'bus' ? 'bus' : x.type === 'radElec' ? 'tor' : 'regul';
        out.push({ src: `${n.id}:t${i}:${x.rep}${x.n > 1 ? `:${k}` : ''}`, rep, designation: `${x.t[0]}${x.local ? ` — ${x.local}` : ''}${x.ref ? ` — ${x.ref}` : ''}${x.pBe ? ` (dont batterie électrique ${nf(x.pBe, 2)} kW)` : ''}`,
          type: aero ? aero[0] : x.t[1] === 'aucun' ? 'autre' : x.type === 'radElec' ? 'resistance' : x.t[1], P: Math.round(x.pU * 100) / 100, tension: x.pU > 0 ? x.tension : '24V', regulation,
          regImpose: true, alim: x.alim || '', local: x.local, nb: 1, pointsUnit: x.regul === 'automate' ? pointsTerminal(x) : null, afAuto: fonctionnement({ ...x, n: 1 }) });
      }
    });
    return out;
  }
  // Pompes de l'étude (distribution, primaire) à placer sur une branche du réseau arborescent
  function pompesEtude(et) {
    const out = [];
    ((et && et.notes) || []).filter(n => n.type === 'terminaux').forEach(n => ((n.entrees || {}).appareils || []).filter(a => a.rep && estPompe(a.type)).forEach(a => out.push({ cle: `${n.id}:${a.rep}`, rep: a.rep, libelle: `${a.rep} — ${TYPES[a.type][0]}${a.local ? ` (${a.local})` : ''}`, Qp: num(a.Qp), Hp: num(a.Hp) })));
    return out;
  }
  return { estPompe, pompesEtude, TYPES, BATTERIES, VANNES, REGULATIONS, eclater, pointsTerminal, fonctionnement, optAlim, libAlim, calculer, lireFiche, LIBELLES, versElec };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Terminaux;
