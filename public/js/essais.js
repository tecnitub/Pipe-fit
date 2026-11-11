// Mise en service des équipements CVC (points de contrôle et mesures par type d'équipement, conclusion) et relevé
// d'équilibrage (débits théoriques / mesurés, écarts, tolérance). Module commun navigateur / serveur / tests.
const Essais = (() => {
  const n = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
  const r1 = v => Math.round(v * 10) / 10;

  // Fiches de relevés de fonctionnement (format de l'entreprise) : caractéristiques de la plaque, mesures par côté
  // (soufflage / extraction, pompe 1 / pompe 2), équipements, réglages, autocontrôle des sécurités, équilibrage, fin d'antenne.
  // Mesure : [libellé, unité, section, alias (libellés des valeurs attendues de l'étude)]
  const PLAQUE_VENT = ['Marque du moto-ventilateur', 'Type du moto-ventilateur', 'Puissance', 'Intensité plaquée', 'Tension plaquée', 'Vitesse', 'Cos φ', 'Coefficient K'];
  const mesVent = (sec, alias = []) => [['Signal ventilateur', '%', sec], ['Fréquence ventilateur', 'Hz', sec], ['Tension moteur', 'V', sec], ['Intensité moteur', 'A', sec],
    ['Débit mesuré', 'm³/h', sec, alias], ['Débit ventilateur (facteur K)', 'm³/h', sec], ['ΔP ventilateur', 'Pa', sec], ['ΔP filtres M5 (ePM10)', 'Pa', sec], ['ΔP filtres F7 (ePM1)', 'Pa', sec],
    ['ΔP batterie eau chaude', 'Pa', sec], ['ΔP batterie eau glacée', 'Pa', sec], ['ΔP pavillon', 'Pa', sec], [sec === 'Extraction' ? 'Pression d\'extraction' : 'Pression de soufflage', 'Pa', sec]];
  const mesPompe = (sec, a) => [['Tension mesurée', 'V', sec], ['Intensité absorbée mini', 'A', sec], ['Intensité absorbée maxi', 'A', sec], ['Puissance lue mini', 'W', sec], ['Puissance lue maxi', 'W', sec],
    ['Vitesse lue mini', 'tr/min', sec], ['Vitesse lue maxi', 'tr/min', sec], ['Consigne', '', sec], ['Débit mesuré', 'm³/h', sec, a ? ['Débit', 'Débit de la pompe'] : []], ['Débit lu (info pompe)', 'm³/h', sec],
    ['Débit lu (info compteur)', 'm³/h', sec], ['HMT mesurée', 'mCE', sec, a ? ['Hauteur manométrique'] : []], ['HMT lue (info pompe)', 'mCE', sec]];
  const FIN = ['Pression de fin d\'antenne', 'Pa', ''];
  // Types d'équipement : points de contrôle et mesures relevées [libellé, unité]
  const TYPES = {
    pac: { libelle: 'PAC / thermofrigopompe / groupe froid', frigo: true,
      controles: ['Raccordements hydrauliques et frigorifiques conformes', 'Tirage au vide et contrôle d\'étanchéité du circuit frigorifique', 'Alimentation électrique et protections conformes',
        'Sécurités HP / BP et débit d\'eau testées', 'Évacuation des condensats', 'Régulation paramétrée (consignes, lois d\'eau, priorités)', 'Fiche d\'intervention fluides (Cerfa) établie'],
      mesures: [['Pression HP', 'bar'], ['Pression BP', 'bar'], ['Surchauffe', 'K'], ['Sous-refroidissement', 'K'], ['Température départ eau', '°C'], ['Température retour eau', '°C'], ['Intensité absorbée', 'A'], ['Température extérieure', '°C']] },
    split: { libelle: 'Climatisation à détente directe (split, multisplit, DRV)', frigo: true,
      controles: ['Liaisons frigorifiques isolées et fixées', 'Tirage au vide et contrôle d\'étanchéité', 'Complément de charge selon longueur des liaisons', 'Évacuation des condensats (pompe testée)', 'Télécommande / régulation paramétrée', 'Fiche d\'intervention fluides (Cerfa) établie'],
      mesures: [['Pression BP', 'bar'], ['Surchauffe', 'K'], ['Température soufflage UI', '°C'], ['Température reprise UI', '°C'], ['Intensité absorbée', 'A']] },
    chaudiere: { libelle: 'Chaudière / production de chaleur',
      controles: ['Étanchéité du raccordement gaz', 'Évacuation des fumées et amenée d\'air conformes', 'Remplissage, purge et pression du circuit', 'Sécurités (manque d\'eau, surchauffe, flamme) testées', 'Régulation paramétrée'],
      mesures: [['CO2', '%'], ['CO', 'ppm'], ['Température des fumées', '°C'], ['Rendement de combustion', '%'], ['Pression gaz', 'mbar'], ['Température départ', '°C'], ['Température retour', '°C']] },
    cta: { libelle: 'Centrale de traitement d\'air (CTA)', fiche: { titre: 'Centrale de traitement d\'air', sections: ['Soufflage', 'Extraction'], plaque: PLAQUE_VENT, prevu: ['Débit de soufflage', 'Débit de reprise'] },
      controles: ['Filtres en place et propres', 'Sens de rotation des ventilateurs', 'Registres et clapets fonctionnels', 'Batteries raccordées et purgées', 'Évacuation des condensats / siphon', 'Antigel testé', 'Pressostats des filtres testés', 'Communication avec la GTB'],
      mesures: [...mesVent('Soufflage', ['Débit de soufflage']), ...mesVent('Extraction', ['Débit de reprise']), FIN] },
    vmc: { libelle: 'Ventilation mécanique (VMC, extracteur)', fiche: { titre: 'Ventilateur d\'extraction', sections: [''], plaque: PLAQUE_VENT, prevu: ['Débit', 'Débit total', 'Débit de reprise', 'Débit de soufflage'] },
      controles: ['Bouches et entrées d\'air conformes', 'Sens de rotation', 'Réseau étanche, gaines raccordées et supportées', 'Rejet extérieur conforme', 'Interrupteur de proximité et sécurités testés'],
      mesures: [['Tension', 'V', ''], ['Intensité', 'A', ''], ['Signal', 'V', ''], ['Débit extraction', 'm³/h', '', ['Débit', 'Débit total', 'Débit de reprise', 'Débit de soufflage']], ['Débit ventilateur (facteur K)', 'm³/h', ''],
        ['Pression extraction', 'Pa', ''], ['ΔP ventilateur', 'Pa', ''], ['Pression rejet', 'Pa', ''], FIN] },
    pompes: { libelle: 'Pompes et circulateurs', fiche: { titre: 'Pompes', sections: ['Pompe 1', 'Pompe 2'], plaque: ['Tension nominale', 'Intensité nominale', 'Vitesse de rotation', 'Puissance', 'Cos φ', 'Accouplement électrique'], plaqueCommune: true, prevu: ['Débit', 'Débit de la pompe'] },
      controles: ['Circuit rempli et purgé', 'Sens de rotation', 'Consigne réglée (pression différentielle ou vitesse)', 'Absence de bruit et de vibrations'],
      mesures: [...mesPompe('Pompe 1', true), ...mesPompe('Pompe 2', false), ['Vanne de réglage générale (marque, type, position, repère)', '', ''], ['Vanne de réglage by-pass V3V (marque, type, position, repère)', '', ''], ['Pression de fin d\'antenne', 'kPa', '']] },
    desenfumage: { libelle: 'Désenfumage mécanique',
      controles: ['Commandes manuelle et automatique testées', 'Volets et clapets ouverts sur commande', 'Report d\'état au CMSI', 'Alimentation de sécurité'],
      mesures: [['Débit extrait', 'm³/h'], ['Vitesse de passage', 'm/s'], ['Temps de mise en route', 's']] },
    ecs: { libelle: 'Production d\'eau chaude sanitaire',
      controles: ['Remplissage et purge', 'Groupe de sécurité / soupape testés', 'Mitigeur et bouclage réglés', 'Température de stockage au moins 55 °C (prévention légionelles)'],
      mesures: [['Température de stockage', '°C'], ['Température retour bouclage', '°C'], ['Pression du réseau', 'bar']] },
    vase: { libelle: 'Vase d\'expansion, soupapes et maintien de pression',
      controles: ['Pression de gonflage réglée, vase isolé et vidangé côté eau', 'Vanne d\'isolement à verrouillage ouverte, robinet de vidange en place', 'Soupape de sécurité tarée et raccordée à l\'égout (siphon, entonnoir)',
        'Pression de remplissage à froid réglée', 'Remplissage : disconnecteur et compteur d\'eau en place'],
      mesures: [['Pression de gonflage (vase isolé, à vide)', 'bar'], ['Pression de remplissage à froid', 'bar'], ['Tarage de la soupape', 'bar']] },
    terminal: { libelle: 'Terminal (cassette, ventilo-convecteur, poutre, aérotherme…)',
      controles: ['Raccordements hydrauliques (flexibles, vannes d\'isolement) étanches et purgés', 'Vanne de régulation et servomoteur : course complète testée', 'Évacuation des condensats et pompe de relevage testées',
        'Filtre propre, grille et plénum en place', 'Alimentation électrique et protection conformes', 'Thermostat / sonde d\'ambiance et communication (GTB, maître / esclave) testés', 'Vitesses du ventilateur testées'],
      mesures: [['Température d\'eau entrée', '°C'], ['Température d\'eau sortie', '°C'], ['Température de soufflage', '°C'], ['Température de reprise', '°C'], ['Débit d\'eau', 'm³/h'], ['Intensité absorbée', 'A']] },
    reseau: { libelle: 'Réseau hydraulique et ses émetteurs (équilibrage)',
      controles: ['Réseau rempli, purgé et sous pression', 'Pompe : sens de rotation et consigne réglée', 'Filtres et pots à boue nettoyés', 'Vannes d\'équilibrage réglées au préréglage et repérées',
        'Émetteurs raccordés et purgés, vannes de régulation testées', 'Évacuation des condensats des terminaux testée', 'Calorifuge et étiquetage des réseaux'],
      mesures: [['Débit de la pompe', 'm³/h'], ['Hauteur manométrique', 'mCE'], ['Pression statique du réseau', 'bar']] },
    bouche: { libelle: 'Bouche, diffuseur, grille (relevé de débit)',
      controles: ['Bouche posée au repère du plan, fixée', 'Plénum et raccordement étanches', 'Organe de réglage (registre, cône) accessible', 'Réglage bloqué et repéré après équilibrage', 'Jet orienté (ailettes, diffusion)'],
      mesures: [['Débit', 'm³/h'], ['Pression de mesure au plénum', 'Pa'], ['Position du réglage', '']] },
    gtb: { libelle: 'Régulation / GTB',
      controles: ['Points remontés vérifiés', 'Consignes et programmations horaires', 'Alarmes testées (SMS / e-mail)', 'Configuration sauvegardée et remise'], mesures: [] },
    autre: { libelle: 'Autre équipement', controles: ['Installation conforme aux plans et au CCTP', 'Essais de fonctionnement réalisés'], mesures: [] },
  };
  const ETATS = ['OK', 'Non conforme', 'Sans objet'];
  // Points de contrôle et mesures d'un type (pour une nouvelle mise en service)
  const modele = type => { const t = TYPES[type] || TYPES.autre, f = t.fiche;
    return { controles: t.controles.map(libelle => ({ libelle, etat: '', obs: '' })), mesures: t.mesures.map(([libelle, unite, section, alias]) => ({ libelle, unite, valeur: '', ...(section !== undefined ? { section } : {}), ...(alias && alias.length ? { alias } : {}) })),
      ...(f ? { plaque: (f.plaqueCommune ? [''] : f.sections).flatMap(section => f.plaque.map(libelle => ({ section, libelle, valeur: '' }))) } : {}) }; };
  // Débit du ventilateur par le facteur K (buse de mesure du moto-ventilateur) : Q = K · √ΔP, recalculé tant qu'il n'a pas été saisi à la main
  function calculsFiche(m) {
    const sections = [...new Set((m.mesures || []).map(x => x.section).filter(x => x !== undefined))];
    if (!sections.length && (m.mesures || []).some(x => x.libelle === 'Débit ventilateur (facteur K)')) sections.push('');
    sections.forEach(sec => {
      const K = n(((m.plaque || []).find(p => (p.section || '') === (sec || '') && /^Coefficient K$/i.test(p.libelle)) || {}).valeur);
      const dp = n(((m.mesures || []).find(x => (x.section || '') === (sec || '') && x.libelle === 'ΔP ventilateur') || {}).valeur), q = (m.mesures || []).find(x => (x.section || '') === (sec || '') && x.libelle === 'Débit ventilateur (facteur K)');
      if (!q) return;
      // Valeur attendue du débit K : le débit prévu du même côté (écart et tolérance ± 10 % affichés, réserve si hors tolérance)
      const prevu = (m.mesures || []).find(x => (x.section || '') === (sec || '') && /^Débit (mesuré|extraction)$/.test(x.libelle) && x.attendu !== undefined && x.attendu !== '');
      if (prevu && (q.attendu === undefined || q.attenduK)) { q.attendu = prevu.attendu; q.attenduK = true; }
      if (!(String(q.valeur ?? '').trim() === '' || q.auto)) return;
      if (K > 0 && dp > 0) { q.valeur = String(Math.round(K * Math.sqrt(dp))); q.auto = true; } else if (q.auto) { q.valeur = ''; }
    });
    return m;
  }
  // 1. Caractéristiques lues sur la photo de la plaque (texte reconnu) : puissance, intensité, tension, vitesse, cos φ, K
  function lireCaracteristiques(lignes) {
    const t = (Array.isArray(lignes) ? lignes.join('\n') : String(lignes || '')).replace(/\u00a0/g, ' '), out = {}, nb = v => String(v).replace('.', ',');
    const P = /(\d+(?:[.,]\d+)?)\s*kW\b/i.exec(t) || /(\d{2,5})\s*W\b/.exec(t);
    if (P) out.Puissance = /kW/i.test(P[0]) ? `${nb(P[1])} kW` : `${P[1]} W`;
    const I = /(\d+(?:[.,]\d+)?)\s*(?:\/\s*\d+(?:[.,]\d+)?\s*)?A\b/.exec(t); if (I) out.Intensite = `${nb(I[1])} A`;
    const U = /(\d{3})\s*(?:[-–/]\s*\d{3}\s*)?V(?:AC|~)?\b/i.exec(t) || /(\d{2,3})\s*V\b/.exec(t); if (U) out.Tension = `${U[1]} V`;
    const N = /(\d{3,5})\s*(?:tr\s*\/?\s*min|rpm|min-1|min⁻¹|1\/min)/i.exec(t); if (N) out.Vitesse = `${N[1]} tr/min`;
    const C = /cos\s*(?:φ|ϕ|phi|fi)?\s*[:=]?\s*(0[.,]\d{1,3})/i.exec(t); if (C) out.Cos = nb(C[1]);
    const K = /(?:k[-\s]?(?:faktor|factor|facteur)|\bk)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i.exec(t); if (K) out.K = nb(K[1]);
    return out;
  }
  const PLAQUE_CLES = { Puissance: /^Puissance$/, Intensite: /^Intensité (plaquée|nominale)$/, Tension: /^Tension (plaquée|nominale)$/, Vitesse: /^Vitesse/, Cos: /^Cos φ$/, K: /^Coefficient K$/ };
  // Remplit le premier côté dont la plaque est vide (soufflage, puis extraction), sinon les cases vides ; renvoie les libellés remplis
  function remplirPlaque(m, car) {
    const pl = m.plaque || [], secs = [...new Set(pl.map(p => p.section || ''))];
    const vide = sec => pl.filter(p => (p.section || '') === sec).every(p => String(p.valeur ?? '').trim() === '');
    const sec = secs.find(vide) ?? secs[0], lus = [];
    Object.entries(car || {}).forEach(([k, v]) => { const p = pl.find(x => (x.section || '') === sec && PLAQUE_CLES[k] && PLAQUE_CLES[k].test(x.libelle) && String(x.valeur ?? '').trim() === ''); if (p) { p.valeur = v; lus.push(`${p.libelle} ${v}${sec ? ` (${sec.toLowerCase()})` : ''}`); } });
    return lus;
  }

  // 2. Reprise d'une fiche de relevés existante (classeur Excel au format de l'entreprise, feuille « Rév.0 ») : lignes
  // (tableaux de cellules) → brouillon de PV : type, en-tête, plaque, mesures par côté, équipements, réglages,
  // autocontrôle, équilibrage, fin d'antenne, observations. Les cellules « / », « . », « NC » restent vides.
  const nl = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();
  const nombreDe = v => { if (typeof v === 'number') return String(v); const x = /-?\d+(?:[.,]\d+)?/.exec(String(v ?? '')); return x ? x[0].replace(',', '.') : ''; };
  const vraiVide = v => ['', '/', '.', 'NC', '-'].includes(String(v ?? '').trim());
  const PL_EXCEL = { MARQUE: 'Marque du moto-ventilateur', TYPE: 'Type du moto-ventilateur', PUISSANCE: 'Puissance', 'INTENSITE PLAQUEE': 'Intensité plaquée', 'TENSION PLAQUEE': 'Tension plaquée', VITESSE: 'Vitesse', 'COSINUS PHI': 'Cos φ', 'COEFFICIENT K': 'Coefficient K',
    'TENSION NOMINALE': 'Tension nominale', 'INTENSITE NOMINALE': 'Intensité nominale', 'VITESSE ROTATION': 'Vitesse de rotation', 'ACCOUPLEMENT ELECTRIQUE': 'Accouplement électrique' };
  const ME_EXCEL = { 'SIGNAL VENTILATEUR': 'Signal ventilateur', 'FREQUENCE VENTILATEUR': 'Fréquence ventilateur', 'TENSION MOTEUR': 'Tension moteur', 'INTENSITE MOTEUR': 'Intensité moteur', 'DEBIT MESURE': 'Débit mesuré',
    'DEBIT VENTILATEUR': 'Débit ventilateur (facteur K)', 'DP VENTILATEUR': 'ΔP ventilateur', 'DP FILTRES M5': 'ΔP filtres M5 (ePM10)', 'DP FILTRES F7': 'ΔP filtres F7 (ePM1)', 'DP BATTERIE EAU CHAUDE': 'ΔP batterie eau chaude',
    'DP BATTERIE EAU GLACEE': 'ΔP batterie eau glacée', 'DP PAVILLON': 'ΔP pavillon', 'PRESSION DE SOUFFLAGE': 'Pression de soufflage', "PRESSION D'EXTRACTION": "Pression d'extraction",
    TENSION: 'Tension', INTENSITE: 'Intensité', SIGNAL: 'Signal', 'DEBIT EXTRACTION': 'Débit extraction', 'PRESSION EXTRACTION': 'Pression extraction', 'DELTA P VENTILATEUR': 'ΔP ventilateur', 'PRESSION REJET': 'Pression rejet' };
  const POMPE_LIGNES = { 'INTENSITE ABSORBEE': 'Intensité absorbée', 'PUISSANCE LUE': 'Puissance lue', 'VITESSE LUE': 'Vitesse lue' };
  const POMPE_COLS = { 'DEBIT MESURE': 'Débit mesuré', 'DEBIT LUE (INFO POMPE)': 'Débit lu (info pompe)', 'DEBIT LUE (INFO COMPTEUR)': 'Débit lu (info compteur)', 'HMT MESUREE': 'HMT mesurée', 'HMT LUE (INFO POMPE)': 'HMT lue (info pompe)' };
  const ENTETE = ['CHANTIER', 'DATE', 'LOCALISATION', 'DESIGNATION', 'MARQUE', 'REFERENCES', 'TYPE', 'BATIMENT', 'CIRCUIT', 'DEBIT PREVU', 'HMT ESTIMEE'];
  const TITRES = ['CARACTERISTIQUES', 'CARACTERISTIQUES ELECTRIQUES', 'MESURES ELECTRIQUES ET AERAULIQUES', 'MESURES ELECTRIQUES', 'MESURES HYDRAULIQUES', 'EQUIPEMENTS', 'REGLAGES', 'OBSERVATIONS / REMARQUES', 'REMARQUES // OBSERVATIONS', 'EQUILIBRAGE AERAULIQUE', 'EQUILIBRAGE HYDRAULIQUE'];
  function lireFicheExcel(rows) {
    const R = (rows || []).map(r => (r || []).map(c => (c === null || c === undefined ? '' : c)));
    const tout = R.map(r => r.map(nl).join(' | ')).join('\n');
    const type = /CENTRALE DE TRAITEMENT D.AIR/.test(tout) ? 'cta' : /VENTILATEUR D.EXTRACTION/.test(tout) ? 'vmc' : R.some(r => r.some(c => nl(c) === 'POMPES')) ? 'pompes' : '';
    if (!type) return null;
    const m = modele(type), mes = (lib, sec) => m.mesures.find(x => x.libelle === lib && (x.section || '') === (sec || '')), out = { type, entete: {}, composants: [], reglages: [], observations: [], releve: [], fin: null };
    let section = '', bloc = '', colsPompe = null, colsMini = null, colsCNS = null, eq = null, antenne = '', ligneMes = null;
    const sectionDe = c => ({ SOUFFLAGE: 'Soufflage', EXTRACTION: type === 'cta' ? 'Extraction' : '' })[nl(c)];
    R.forEach(r => {
      const cel = r.map((c, i) => ({ i, v: c, n: nl(c) })).filter(x => String(x.v).trim() !== '');
      if (!cel.length) return;
      const premier = cel[0].n;
      if (/^FICHE DE RELEVES/.test(premier)) { bloc = 'entete'; return; }
      if (cel.length === 1 && sectionDe(premier) !== undefined) { section = sectionDe(premier); return; }
      if (TITRES.includes(premier) || /^AUTOCONTROL/.test(premier) || /^PRESSION (DE )?FIN D.ANTENNE/.test(premier)) { bloc = /^AUTOCONTROL/.test(premier) ? 'auto' : /FIN D.ANTENNE/.test(premier) ? 'fin' : premier; if (/^EQUILIBRAGE/.test(premier)) eq = null; return; }
      // En-tête (libellé suivi de sa valeur)
      cel.forEach((c, k) => { const lab = c.n.replace(/\s*:$/, ''); if (ENTETE.includes(lab) && cel[k + 1] && !ENTETE.includes(cel[k + 1].n.replace(/\s*:$/, '')) && out.entete[lab] === undefined && (bloc === 'entete' || bloc === '' || ['DEBIT PREVU', 'HMT ESTIMEE'].includes(lab))) out.entete[lab] = cel[k + 1].v; });
      if (bloc === 'entete' && cel.some(c => ENTETE.includes(c.n.replace(/\s*:$/, '')))) return;
      // Plaque et mesures : paires libellé → dernière valeur de la ligne avant le libellé suivant
      if (/^CARACTERISTIQUES/.test(bloc) || /^MESURES/.test(bloc)) {
        if (type === 'pompes' && cel.some(c => /^MINI$/.test(c.n)) && cel.some(c => /^MAXI$/.test(c.n))) { colsMini = { mini: cel.find(c => c.n === 'MINI').i, maxi: cel.find(c => c.n === 'MAXI').i }; }
        if (type === 'pompes' && cel.length === 2 && cel.every(c => /^POMPE [12]$/.test(c.n))) { colsPompe = Object.fromEntries(cel.map(c => [c.n.slice(-1), c.i])); return; }
        const lab0 = premier.replace(/\s*:$/, '');
        if (type === 'pompes' && POMPE_LIGNES[lab0]) { ligneMes = POMPE_LIGNES[lab0]; return; }
        if (type === 'pompes' && ligneMes && /^POMPE [12]$/.test(premier) && colsMini) { const sec = `Pompe ${premier.slice(-1)}`; [['mini', colsMini.mini], ['maxi', colsMini.maxi]].forEach(([k, i]) => { const x = mes(`${ligneMes} ${k}`, sec); if (x && !vraiVide(r[i])) x.valeur = nombreDe(r[i]) || String(r[i]); }); return; }
        if (type === 'pompes' && lab0 === 'TENSION MESUREE' || lab0 === 'CONSIGNE') { [1, 2].forEach(p => { const k = cel.findIndex(c => c.n === `POMPE ${p}`); if (k >= 0 && cel[k + 1] && !/^POMPE/.test(cel[k + 1].n)) { const x = mes(lab0 === 'CONSIGNE' ? 'Consigne' : 'Tension mesurée', `Pompe ${p}`); if (x && !vraiVide(cel[k + 1].v)) x.valeur = lab0 === 'CONSIGNE' ? String(cel[k + 1].v) : nombreDe(cel[k + 1].v); } }); return; }
        if (type === 'pompes' && POMPE_COLS[lab0] && colsPompe) { [1, 2].forEach(p => { const v = r[colsPompe[p]], x = mes(POMPE_COLS[lab0], `Pompe ${p}`); if (x && !vraiVide(v)) x.valeur = nombreDe(v) || String(v); }); return; }
        if (type === 'pompes' && /^VANNE DE REGLAGE/.test(lab0)) { out.vanne = /BYPASS|BY-PASS/.test(lab0) ? 'by-pass' : 'générale'; out[`vanne_${out.vanne}`] = cel.slice(1).map(c => c.v).join(' '); return; }
        if (type === 'pompes' && out.vanne && /^POSITION DE REGLAGE/.test(lab0)) { out[`vanne_${out.vanne}`] += ` ${cel.map(c => c.v).join(' ')}`; out.vanne = null; return; }
        const labels = cel.map((c, k) => [k, c.n.replace(/\s*:$/, '')]).filter(([, n]) => PL_EXCEL[n] || ME_EXCEL[n]);
        labels.forEach(([k, n], j) => {
          const fin = j + 1 < labels.length ? labels[j + 1][0] : cel.length, vals = cel.slice(k + 1, fin).map(c => c.v).filter(v => !vraiVide(v) && !/^(PV|GV|FACTEUR K)$/i.test(nl(v)));
          const v = vals.length ? vals[vals.length - 1] : '';
          if (/^CARACTERISTIQUES/.test(bloc) && PL_EXCEL[n] && !(n === 'TENSION' || n === 'INTENSITE')) { const p = (m.plaque || []).find(x => x.libelle === PL_EXCEL[n] && (x.section || '') === (m.plaque.some(y => y.section) ? section : '')); if (p && v !== '') p.valeur = String(v); }
          else if (ME_EXCEL[n]) { const x = mes(ME_EXCEL[n], type === 'cta' ? section : ''); if (x && v !== '') x.valeur = nombreDe(v) || String(v); }
        });
        return;
      }
      if (bloc === 'EQUIPEMENTS') { out.composants.push(cel.map(c => String(c.v).replace(/^\.\s*/, '')).join(' ')); return; }
      if (bloc === 'REGLAGES') { out.reglages.push(cel.map(c => String(c.v).replace(/^\.\s*/, '')).join(' ')); return; }
      if (/OBSERVATIONS/.test(bloc)) { out.observations.push(cel.map(c => String(c.v).replace(/^>\s*/, '')).join(' ')); return; }
      if (bloc === 'auto') {
        if (cel.some(c => /^NC = /.test(c.n))) { colsCNS = Object.fromEntries(cel.map(c => [c.n.split(' ')[0], c.i])); return; }
        if (colsCNS) { const lib = cel.filter(c => !/^(TRUE|FALSE|VRAI|FAUX|X)$/.test(c.n)).map(c => c.v).join(' '); const coche = k => { const v = r[colsCNS[k]]; return v === true || /^(TRUE|VRAI|X|OUI)$/.test(nl(v)); };
          if (lib) out.autocontrole = [...(out.autocontrole || []), { libelle: String(lib), etat: coche('C') ? 'OK' : coche('NC') ? 'Non conforme' : coche('SO') ? 'Sans objet' : '' }]; }
        return;
      }
      if (/^EQUILIBRAGE/.test(bloc)) {
        if (cel.some(c => /^ANTENNE/.test(c.n))) { eq = { nom: cel[0].i, dim: (cel.find(c => /SECTION|VANNE/.test(c.n)) || {}).i, reg: (cel.find(c => /REGLAGE/.test(c.n)) || {}).i, prevu: (cel.find(c => /PREVU/.test(c.n)) || {}).i, mesure: (cel.find(c => /MESURE/.test(c.n)) || {}).i, eau: /HYDRAULIQUE/.test(bloc), unite: /L\/H/.test(cel.map(c => c.n).join(' ')) ? 'l/h' : 'm³/h' }; return; }
        if (!eq) return;
        if (cel.length === 1) { antenne = String(cel[0].v); return; }
        const nom = r[eq.nom], pv = r[eq.prevu], ms = r[eq.mesure];
        if (String(nom ?? '').trim() === '') return;
        const debit = v => { const s2 = String(v ?? ''); const lh = /(\d+(?:[.,]\d+)?)\s*l\/h/i.exec(s2); if (lh) return Number(lh[1].replace(',', '.')) / 1000; const n = Number(nombreDe(v)); return !vraiVide(v) && Number.isFinite(n) && nombreDe(v) !== '' ? (eq.unite === 'l/h' ? n / 1000 : n) : null; };
        const dp = /(\d+(?:[.,]\d+)?)\s*kPa/i.exec(String(ms ?? ''));
        out.releve.push({ nom: String(nom).trim(), antenne, section: type === 'cta' ? section : '', dim: vraiVide(r[eq.dim]) ? '' : String(r[eq.dim]), reglage: [vraiVide(r[eq.reg]) ? '' : String(r[eq.reg]).trim(), dp ? `${dp[1]} kPa` : ''].filter(Boolean).join(' · '), prevu: debit(pv), mesure: debit(ms), eau: eq.eau });
        return;
      }
      if (bloc === 'fin' && cel.length >= 2) { const v = cel[cel.length - 1].v; if (!vraiVide(v)) out.fin = { lieu: String(cel[0].v), valeur: nombreDe(v) }; }
    });
    // Brouillon de PV
    const e = out.entete, date = typeof e.DATE === 'number' ? new Date(Date.UTC(1899, 11, 30) + e.DATE * 86400000).toISOString().slice(0, 10) : /^\d{4}-\d\d-\d\d/.test(String(e.DATE || '')) ? String(e.DATE).slice(0, 10) : '';
    const prevu = nombreDe(e['DEBIT PREVU']);
    const hmt = nombreDe(e['HMT ESTIMEE']); if (hmt && type === 'pompes') { const x = mes('HMT mesurée', 'Pompe 1'); if (x) x.attendu = Number(hmt); }
    if (prevu) { const cible = type === 'pompes' ? mes('Débit mesuré', 'Pompe 1') : type === 'vmc' ? mes('Débit extraction', '') : null; if (cible) cible.attendu = Number(prevu); else m.mesures.filter(x => x.libelle === 'Débit mesuré').forEach(x => { x.attendu = Number(prevu); }); }
    if (out.fin) { const x = m.mesures.find(y => /fin d'antenne/.test(y.libelle)); if (x) x.valeur = out.fin.valeur; }
    ['générale', 'by-pass'].forEach(k => { const x = m.mesures.find(y => y.libelle.startsWith(`Vanne de réglage ${k === 'générale' ? 'générale' : 'by-pass'}`)); const v = out[`vanne_${k}`]; if (x && v && v.replace(/[\s/:A-Z]|MARQUE|TYPE|POSITION DE REGLAGE|REPERE/gi, '')) x.valeur = v.replace(/\s+/g, ' ').trim(); });
    let nb = 0;
    out.releve.forEach(l => { nb += 1; m.mesures.push({ libelle: `${l.eau ? 'Débit d\'eau' : 'Débit'} ${l.eau ? 'U' : 'B'}${String(nb).padStart(2, '0')} — ${l.nom} · ${[l.section && l.section.toLowerCase(), l.antenne].filter(Boolean).join(' · ') || 'réseau'}`, unite: 'm³/h', valeur: l.mesure === null ? '' : String(Math.round(l.mesure * 1000) / 1000), ...(l.prevu !== null ? { attendu: l.prevu } : {}), dim: l.dim, reglage: l.reglage }); });
    const controles = m.controles.map(c => ({ ...c }));
    (out.autocontrole || []).forEach(a => { const c = controles.find(x => nl(x.libelle).includes(nl(a.libelle)) || nl(a.libelle).includes(nl(x.libelle).split(' ')[0])); if (c) c.etat = a.etat; else controles.push({ libelle: a.libelle, etat: a.etat, obs: '' }); });
    calculsFiche(m);
    return { type, date, equipement: String(e.DESIGNATION || '').trim(), localisation: String(e.LOCALISATION || e.BATIMENT || '').trim(), zone: String(e.CIRCUIT ? `Circuit ${e.CIRCUIT}` : '').trim(), marque: String(e.MARQUE || '').trim(), modele: String(e.REFERENCES || e.TYPE || '').trim(), chantier: String(e.CHANTIER || '').trim(),
      plaque: m.plaque, mesures: m.mesures, controles, composants: out.composants.join('\n'), reglages: out.reglages.join('\n'), observations: out.observations.join('\n') };
  }

  // 4. Pompe : point prévu (étude) et point mesuré sur la courbe du réseau H = Hp · (Q / Qp)², et sur la courbe du
  // fabricant si l'étude l'a transmise ; écart de débit
  function pointsPompe(m) {
    const ms = m.mesures || [], v = l => { const x = ms.find(y => l.some(z => y.libelle === z) && (y.section || 'Pompe 1') === 'Pompe 1' && String(y.valeur ?? '').trim() !== '' && Number.isFinite(n(y.valeur))); return x ? n(x.valeur) : null; };
    const att = l => { const x = ms.find(y => (l.includes(y.libelle) || (y.alias || []).some(a => l.includes(a))) && y.attendu !== undefined && y.attendu !== ''); return x ? Number(x.attendu) : null; };
    const Qp = att(['Débit mesuré', 'Débit de la pompe', 'Débit']), Hp = att(['HMT mesurée', 'Hauteur manométrique']);
    const Q = v(['Débit mesuré', 'Débit lu (info compteur)', 'Débit lu (info pompe)', 'Débit de la pompe', 'Débit']), H = v(['HMT mesurée', 'HMT lue (info pompe)', 'Hauteur manométrique']);
    if (!(Qp > 0 && Hp > 0)) return null;
    return { Qp, Hp, Q, H, ecart: Q !== null ? r1((Q - Qp) / Qp * 100) : null, courbe: (m.courbePompe || []).filter(p => Number.isFinite(p.Q) && Number.isFinite(p.H)) };
  }
  function courbePompeSvg(m) {
    const p = pointsPompe(m); if (!p) return '';
    const Qmax = Math.max(p.Qp * 1.6, (p.Q || 0) * 1.2, ...p.courbe.map(c => c.Q)), Hmax = Math.max(p.Hp * 1.8, (p.H || 0) * 1.2, ...p.courbe.map(c => c.H));
    const W = 460, H = 280, x0 = 50, y0 = 240, w = 380, h = 210, X = q => x0 + q / Qmax * w, Y = v => y0 - v / Hmax * h, o = [];
    o.push(`<rect width="${W}" height="${H}" fill="#fff"/><line x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}" stroke="#333"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - h}" stroke="#333"/>`);
    for (let i = 1; i <= 4; i++) { const q = Qmax * i / 4, hh = Hmax * i / 4; o.push(`<text x="${X(q)}" y="${y0 + 14}" font-size="9" text-anchor="middle">${(Math.round(q * 10) / 10).toString().replace('.', ',')}</text><text x="${x0 - 4}" y="${Y(hh) + 3}" font-size="9" text-anchor="end">${(Math.round(hh * 10) / 10).toString().replace('.', ',')}</text>`); }
    o.push(`<text x="${x0 + w}" y="${y0 + 28}" font-size="9" text-anchor="end">Débit (m³/h)</text><text x="${x0}" y="${y0 - h - 8}" font-size="9">HMT (mCE)</text>`);
    const res = Array.from({ length: 41 }, (_, i) => { const q = Qmax * i / 40; return `${X(q)},${Y(p.Hp * (q / p.Qp) ** 2)}`; }).filter((_, i) => p.Hp * (Qmax * i / 40 / p.Qp) ** 2 <= Hmax);
    o.push(`<polyline points="${res.join(' ')}" fill="none" stroke="#888" stroke-dasharray="4 3"/>`);
    if (p.courbe.length > 1) o.push(`<polyline points="${p.courbe.map(c => `${X(c.Q)},${Y(c.H)}`).join(' ')}" fill="none" stroke="#1f618d" stroke-width="2"/>`);
    o.push(`<circle cx="${X(p.Qp)}" cy="${Y(p.Hp)}" r="5" fill="#1f618d"/>`);
    if (p.Q !== null && p.H !== null) o.push(`<circle cx="${X(p.Q)}" cy="${Y(p.H)}" r="5" fill="#c0392b"/>`);
    else if (p.Q !== null) o.push(`<line x1="${X(p.Q)}" y1="${y0}" x2="${X(p.Q)}" y2="${y0 - h}" stroke="#c0392b" stroke-dasharray="2 2"/>`);
    o.push(`<text x="${x0 + 8}" y="16" font-size="10"><tspan fill="#1f618d">● prévu ${String(p.Qp).replace('.', ',')} m³/h × ${String(p.Hp).replace('.', ',')} mCE</tspan>${p.Q !== null ? `<tspan fill="#c0392b" dx="10">● mesuré ${String(p.Q).replace('.', ',')} m³/h${p.H !== null ? ` × ${String(p.H).replace('.', ',')} mCE` : ''} (${p.ecart > 0 ? '+' : ''}${String(p.ecart).replace('.', ',')} %)</tspan>` : ''}</text>`);
    o.push(`<text x="${x0 + 8}" y="30" font-size="9" fill="#666">- - courbe du réseau H = Hp · (Q / Qp)²${p.courbe.length > 1 ? ' · — courbe de la pompe (étude)' : ''}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">${o.join('')}</svg>`;
  }

  // 6. Suivi des mises en service d'un chantier : PV signés, réserves ouvertes, bouches / émetteurs hors tolérance, points GTB
  function suiviMes(mises) {
    const l = mises || [], sig = l.filter(x => x.statut === 'Signé'), lignes = l.flatMap(x => (x.mesures || []).filter(releve)), pap = l.map(avancementPap);
    return { pv: l.length, signes: sig.length, reserves: sig.reduce((t, x) => t + reserves(x).length, 0) + sig.reduce((t, x) => t + (x.mesures || []).filter(y => conformeMesure(y) === false && !releve(y)).length, 0),
      lignes: lignes.length, mesurees: lignes.filter(x => String(x.valeur ?? '').trim() !== '').length, horsTolerance: lignes.filter(x => conformeMesure(x) === false).length,
      points: pap.reduce((t, x) => t + x.nb, 0), pointsFaits: pap.reduce((t, x) => t + x.faits, 0), pointsNc: pap.reduce((t, x) => t + x.nc, 0) };
  }

  // Débit prévu (en-tête de la fiche) : première valeur attendue de l'étude parmi les libellés du type
  const debitPrevu = m => { const f = (TYPES[m.type] || {}).fiche; if (!f) return null; const x = (m.mesures || []).find(v => v.attendu !== undefined && v.attendu !== '' && (f.prevu.includes(v.libelle) || (v.alias || []).some(a => f.prevu.includes(a)))); return x ? x.attendu : null; };
  // Tolérance de réception d'une mesure comparée à la valeur attendue de l'étude (comme la chute admissible d'une épreuve) :
  // températures ± 2 K, pressions de réglage ± 0,2 bar, autres grandeurs ± 10 %
  function tolerance(libelle, unite) {
    const u = String(unite || ''), l = String(libelle || '');
    if (/°C|^K$/.test(u)) return { abs: 2, texte: '± 2 K' };
    if (/bar/.test(u) && /pression|gonflage|tarage|remplissage/i.test(l)) return { abs: 0.2, texte: '± 0,2 bar' };
    return { pct: 10, texte: '± 10 %' };
  }
  const aValeur = v => v !== '' && v !== null && v !== undefined && Number.isFinite(n(v));
  // Mesure dans la tolérance : null tant que la valeur attendue ou la mesure manque
  function conformeMesure(m) {
    const a = Number(m.attendu), v = n(m.valeur);
    if (m.attendu === null || m.attendu === undefined || m.attendu === '' || !Number.isFinite(a) || !aValeur(m.valeur)) return null;
    const t = tolerance(m.libelle, m.unite);
    return t.abs !== undefined ? Math.abs(v - a) <= t.abs + 1e-9 : a ? Math.abs(v - a) / Math.abs(a) * 100 <= t.pct + 1e-9 : v === 0;
  }
  const mesuresAttendues = m => (m.mesures || []).filter(x => x.attendu !== null && x.attendu !== undefined && x.attendu !== '');
  // Conclusion proposée, comme le résultat d'une épreuve : contrôle non conforme ou mesure hors tolérance -> avec réserves ;
  // tous les contrôles faits et toutes les mesures attendues relevées dans la tolérance -> mis en service
  // Point à point (GTB) : un contrôle porte deux états, côté automate (etat) et côté supervision (etatGtb)
  const ncCtl = x => x.etat === 'Non conforme' || (x.pap && x.etatGtb === 'Non conforme'), faitCtl = x => !!x.etat && (!x.pap || !!x.etatGtb);
  const reserves = m => (m.controles || []).filter(ncCtl).map(x => ({ libelle: x.libelle, cote: [x.etat === 'Non conforme' && 'automate', x.pap && x.etatGtb === 'Non conforme' && 'GTB'].filter(Boolean).join(' et '), obs: x.obs || '' }));
  const avancementPap = m => { const l = (m.controles || []).filter(x => x.pap); return { nb: l.length, faits: l.filter(faitCtl).length, nc: l.filter(ncCtl).length }; };
  function conclusion(m) {
    const c = m.controles || [], att = mesuresAttendues(m);
    if (c.some(ncCtl) || att.some(x => conformeMesure(x) === false)) return 'Mis en service avec réserves';
    return c.length && c.every(faitCtl) && att.every(x => conformeMesure(x) !== null) ? 'Mis en service' : '';
  }
  const manquesMES = m => { const sansMesure = mesuresAttendues(m).filter(x => !aValeur(x.valeur));
    return [!m.affaireId && 'chantier', !String(m.equipement || '').trim() && 'équipement', !m.userId && 'technicien', !m.date && 'date',
      (m.controles || []).some(x => !faitCtl(x)) && 'points de contrôle non renseignés', sansMesure.length && `mesure(s) attendue(s) non relevée(s) : ${sansMesure.map(x => x.libelle).join(', ')}`, !m.resultat && 'conclusion'].filter(Boolean); };

  // Équilibrage : écart d'une bouche ou d'un organe, conformité, synthèse
  const ecart = l => (n(l.theorique) > 0 && n(l.mesure) !== null ? r1((n(l.mesure) - n(l.theorique)) / n(l.theorique) * 100) : null);
  const conforme = (l, tol) => { const e = ecart(l); return e === null ? null : Math.abs(e) <= (n(tol) ?? 10) + 1e-9; };
  function synthese(eq) {
    const l = (eq.lignes || []).filter(x => String(x.repere || x.local || '').trim() || n(x.theorique));
    const mes = l.filter(x => ecart(x) !== null), ok = mes.filter(x => conforme(x, eq.tolerance));
    const tTh = l.reduce((t, x) => t + (n(x.theorique) || 0), 0), tMe = mes.reduce((t, x) => t + (n(x.mesure) || 0), 0), tThMes = mes.reduce((t, x) => t + (n(x.theorique) || 0), 0);
    return { nb: l.length, mesurees: mes.length, conformes: ok.length, horsTolerance: mes.length - ok.length, totalTheorique: r1(tTh), totalMesure: r1(tMe),
      ecartGlobal: tThMes ? r1((tMe - tThMes) / tThMes * 100) : null, resultat: !l.length || mes.length < l.length ? '' : ok.length === mes.length ? 'Conforme' : 'Non conforme' };
  }
  const manquesEQ = e => [!e.affaireId && 'chantier', !String(e.installation || '').trim() && 'installation', !e.userId && 'technicien', !e.date && 'date',
    !(e.lignes || []).length && 'lignes de mesure', synthese(e).mesurees < synthese(e).nb && 'débits mesurés manquants'].filter(Boolean);
  // Lignes importées d'un tableau (Excel, CSV) : repère, local, débit théorique (en-têtes reconnus, sinon 3 premières colonnes)
  function importerLignes(rows) {
    const t = rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
    if (!t.length) return [];
    const h = t[0].map(c => c.toLowerCase());
    const col = re => h.findIndex(c => re.test(c));
    let iR = col(/rep[èe]re|bouche|n°|terminal|organe/), iL = col(/local|pi[èe]ce|zone|d[ée]signation/), iT = col(/th[ée]o|pr[ée]vu|nominal|consigne|d[ée]bit/), iTy = col(/type|nature/);
    const entete = iR >= 0 || iL >= 0 || iT >= 0;
    if (!entete) { iR = 0; iL = 1; iT = 2; }
    return (entete ? t.slice(1) : t).map(r => ({ repere: r[iR] || '', local: iL >= 0 ? r[iL] || '' : '', type: iTy >= 0 ? r[iTy] || '' : '', theorique: n(r[iT]) ?? '', mesure: '', reglage: '' }))
      .filter(x => x.repere || x.local || x.theorique !== '');
  }
  // Ligne d'un relevé par bouche ou par émetteur (fiche d'une CTA, d'un extracteur, d'un réseau hydraulique) :
  // « Débit S-02 — Bureau 2 (Zone A) · soufflage · branche S1.1 » → { grandeur, repere, piece, detail } ; sinon null
  function releve(m) {
    const x = /^(Débit(?: d'eau)?) (\S+)(?: — (.*?))? · (.+)$/.exec(String((m && m.libelle) || ''));
    return x ? { grandeur: x[1], repere: x[2], piece: x[3] || '', detail: x[4].replace(/ · /g, ', ') } : null;
  }
  // Mesures d'un relevé d'équilibrage reprises sur les lignes du PV de mise en service (même repère de bouche, ou repère
  // de la vanne d'équilibrage VE-… d'un émetteur) : débit mesuré et réglage ; renvoie le nombre de lignes reprises
  function reprendreReleve(mesures, releves) {
    const par = new Map();
    (releves || []).forEach(r => (r.lignes || []).forEach(l => { const k = String(l.repere || '').trim(); if (k && String(l.mesure ?? '').trim() !== '') par.set(k, l); }));
    let k = 0;
    (mesures || []).forEach(m => {
      const r = releve(m); if (!r) return;
      const ve = /vanne(?: partenaire)? ([^\s,]+)/.exec(r.detail), l = par.get(r.repere) || (ve && par.get(ve[1]));
      if (!l) return;
      m.valeur = String(l.mesure).replace('.', ','); if (l.reglage) m.reglage = l.reglage; k++;
    });
    return k;
  }
  // Sens inverse : débits et réglages relevés sur les PV de mise en service reportés sur les lignes du relevé d'équilibrage
  // (ligne sans mesure seulement) ; renvoie le nombre de lignes complétées
  function versReleve(lignes, mises) {
    const par = new Map();
    (mises || []).forEach(r => (r.mesures || []).forEach(m => {
      const x = releve(m); if (!x || String(m.valeur ?? '').trim() === '') return;
      par.set(x.repere, m); const ve = /vanne(?: partenaire)? ([^\s,]+)/.exec(x.detail); if (ve) par.set(ve[1], m);
    }));
    let k = 0;
    (lignes || []).forEach(l => { if (String(l.mesure ?? '').trim() !== '') return; const m = par.get(String(l.repere || '').trim()); if (!m) return; l.mesure = String(m.valeur).replace(',', '.'); if (m.reglage && !l.reglage) l.reglage = m.reglage; k++; });
    return k;
  }
  // Repères renumérotés dans l'étude (lots successifs ancien → nouveau) appliqués aux lignes d'un relevé ou d'un PV
  function renumeroter(cible, lots) {
    let k = 0;
    (lots || []).forEach(lot => {
      const map = (lot && lot.map) || {};
      (cible || []).forEach(x => {
        if (x.repere !== undefined) { const n = map[String(x.repere).trim()]; if (n) { x.repere = n; k++; } return; }
        const r = releve(x); if (!r || !map[r.repere]) return;
        x.libelle = x.libelle.replace(`${r.grandeur} ${r.repere}`, `${r.grandeur} ${map[r.repere]}`); k++;
      });
    });
    return k;
  }
  // Pressions de gaine relevées à la mise en service des CTA (consignes de la régulation) : la plus récente par équipement
  function pressionsCta(mises) {
    const out = new Map(), val = (m, re) => { const x = (m.mesures || []).find(y => re.test(y.libelle || '') && n(y.valeur) !== null); return x ? n(x.valeur) : null; };
    (mises || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).forEach(m => {
      const s = val(m, /^Pression de soufflage/i), r = val(m, /^Pression (de reprise|d'extraction)/i), cta = String(m.equipement || m.installation || '').trim();
      if (cta && (s !== null || r !== null)) out.set(cta.toLowerCase(), { cta, soufflage: s === null ? '' : s, reprise: r === null ? '' : r, source: `PV ${m.numero || ''} du ${String(m.date || '').slice(0, 10)}`.replace(/\s+/g, ' ') });
    });
    return [...out.values()];
  }
  return { pressionsCta, versReleve, renumeroter, reprendreReleve, releve, TYPES, ETATS, modele, conclusion, reserves, avancementPap, calculsFiche, debitPrevu, lireCaracteristiques, remplirPlaque, lireFicheExcel, pointsPompe, courbePompeSvg, suiviMes, manquesMES, tolerance, conformeMesure, ecart, conforme, synthese, manquesEQ, importerLignes };
})();
if (typeof module !== 'undefined') module.exports = Essais;
