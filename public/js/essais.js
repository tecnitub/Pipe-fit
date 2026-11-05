// Mise en service des équipements CVC (points de contrôle et mesures par type d'équipement, conclusion) et relevé
// d'équilibrage (débits théoriques / mesurés, écarts, tolérance). Module commun navigateur / serveur / tests.
const Essais = (() => {
  const n = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
  const r1 = v => Math.round(v * 10) / 10;

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
    cta: { libelle: 'Centrale de traitement d\'air (CTA)',
      controles: ['Filtres en place et propres', 'Sens de rotation des ventilateurs', 'Registres et clapets fonctionnels', 'Batteries raccordées et purgées', 'Évacuation des condensats / siphon', 'Sécurités (antigel, pressostats filtres) testées', 'Communication avec la GTB'],
      mesures: [['Débit de soufflage', 'm³/h'], ['Débit de reprise', 'm³/h'], ['Pression disponible', 'Pa'], ['Perte de charge des filtres', 'Pa'], ['Température de soufflage', '°C'], ['Intensité moteur', 'A']] },
    vmc: { libelle: 'Ventilation mécanique (VMC, extracteur)',
      controles: ['Bouches et entrées d\'air conformes', 'Sens de rotation', 'Réseau étanche, gaines raccordées et supportées', 'Rejet extérieur conforme'],
      mesures: [['Débit total', 'm³/h'], ['Dépression au caisson', 'Pa'], ['Intensité moteur', 'A']] },
    pompes: { libelle: 'Pompes et circulateurs',
      controles: ['Circuit rempli et purgé', 'Sens de rotation', 'Consigne réglée (pression différentielle ou vitesse)', 'Absence de bruit et de vibrations'],
      mesures: [['Débit', 'm³/h'], ['Hauteur manométrique', 'mCE'], ['Pression aspiration', 'bar'], ['Pression refoulement', 'bar'], ['Intensité', 'A']] },
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
  const modele = type => { const t = TYPES[type] || TYPES.autre; return { controles: t.controles.map(libelle => ({ libelle, etat: '', obs: '' })), mesures: t.mesures.map(([libelle, unite]) => ({ libelle, unite, valeur: '' })) }; };
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
  function conclusion(m) {
    const c = m.controles || [], att = mesuresAttendues(m);
    if (c.some(x => x.etat === 'Non conforme') || att.some(x => conformeMesure(x) === false)) return 'Mis en service avec réserves';
    return c.length && c.every(x => x.etat) && att.every(x => conformeMesure(x) !== null) ? 'Mis en service' : '';
  }
  const manquesMES = m => { const sansMesure = mesuresAttendues(m).filter(x => !aValeur(x.valeur));
    return [!m.affaireId && 'chantier', !String(m.equipement || '').trim() && 'équipement', !m.userId && 'technicien', !m.date && 'date',
      (m.controles || []).some(x => !x.etat) && 'points de contrôle non renseignés', sansMesure.length && `mesure(s) attendue(s) non relevée(s) : ${sansMesure.map(x => x.libelle).join(', ')}`, !m.resultat && 'conclusion'].filter(Boolean); };

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
  return { releve, TYPES, ETATS, modele, conclusion, manquesMES, tolerance, conformeMesure, ecart, conforme, synthese, manquesEQ, importerLignes };
})();
if (typeof module !== 'undefined') module.exports = Essais;
