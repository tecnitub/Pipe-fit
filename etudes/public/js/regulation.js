// Régulation de l'étude : trois technologies par armoire CVC,
//  - automate programmable (points d'entrées / sorties, programme écrit d'après l'analyse fonctionnelle) ;
//  - régulateurs préprogrammés type Siemens Synco (application choisie puis paramétrée, pas de programmation) :
//    affectation des entrées / sorties sur le régulateur et ses modules d'extension, bornes N.X / N.Y / N.Q ;
//  - régulation intégrée aux équipements (PAC, chaudière, CTA « plug and play ») : l'armoire ne porte que la puissance
//    et les reports ; les réglages se font sur le régulateur de l'équipement.
// Pour toutes : analyse fonctionnelle par installation, reliée aux valeurs des calculs (régimes, lois d'eau, consignes
// de soufflage, débits, ECS), et liste des paramètres à régler et vérifier à la mise en service. Module pur.
const Regulation = (() => {
  const Nt = () => (typeof Notes !== 'undefined' ? Notes : require('./notes'));
  const Sc = () => (typeof Schema !== 'undefined' ? Schema : require('./schema'));
  const num = (v, d = 0) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) && String(v ?? '').trim() !== '' ? x : d; };
  const nf = (v, d = 1) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '—');

  const TECHNOS = {
    automate: ['Automate programmable', 'programme écrit par l\'automaticien d\'après l\'analyse fonctionnelle ; points câblés sur les cartes de l\'automate'],
    synco: ['Régulateurs préprogrammés type Siemens Synco', 'application préprogrammée choisie puis paramétrée (pas de programmation) ; régulateur de base et modules d\'extension'],
    integree: ['Régulation intégrée aux équipements', 'chaque équipement est régulé par son propre régulateur (fabricant) ; l\'armoire porte la puissance, l\'autorisation de marche et les reports'],
  };
  // Familles de régulateurs préprogrammés (désignations indicatives) et capacités par défaut [entrées universelles,
  // sorties 0-10 V, sorties relais] — à reprendre de la fiche du régulateur retenu
  const APPS = {
    production: ['Production (chaufferie, PAC, groupe froid)', 'Régulateur de production préprogrammé (type Synco 700 RMK)'],
    chauffage: ['Circuits de chauffage et ECS', 'Régulateur de chauffage préprogrammé (type Synco 700 RMH)'],
    ventilation: ['Centrale de traitement d\'air, ventilation', 'Régulateur de ventilation préprogrammé (type Synco 700 RMU)'],
    terminaux: ['Terminaux et zones', 'Régulateur d\'ambiance communicant, un par terminal (type Synco RXB / RDG, KNX)'],
    autre: ['Auxiliaires', 'Régulateur universel préprogrammé (type Synco 700 RMU)'],
  };
  const COURT = { production: 'production', chauffage: 'chauffage et ECS', ventilation: 'ventilation', terminaux: 'terminaux', autre: 'auxiliaires' };
  const CAPACITES = { production: [8, 4, 6], chauffage: [8, 4, 6], ventilation: [8, 4, 6], autre: [8, 4, 6], extension: [4, 2, 2] };
  const MODULES_MAX = 3;

  // Application d'un équipement d'après le calcul d'où il vient (src « note:clé ») ; types : { idNote: type }
  function application(q, types = {}) {
    const [id, cle = ''] = String(q.src || '').split(':'), t = types[id] || '';
    if (t === 'terminaux') return 'terminaux';
    if (['cta', 'aero', 'aeraulique', 'desenfumage'].includes(t)) return 'ventilation';
    if (['ecs', 'sanitaire'].includes(t)) return 'chauffage';
    if (t === 'pid') return /^(pc|v|td|ce|em)\d/.test(cle) ? 'chauffage' : 'production';
    if (q.type === 'cta') return 'ventilation';
    if (['ventilo', 'split', 'regulateur'].includes(q.type)) return 'terminaux';
    if (['pac', 'generateur'].includes(q.type)) return 'production';
    return 'autre';
  }

  // Affectation des points physiques d'une application sur des régulateurs préprogrammés : régulateur de base et modules
  // d'extension (MODULES_MAX au plus), bornes N.X (entrées), N.Y (sorties 0-10 V), N.Q (relais), A1.X… sur les modules
  function allouer(points, app, capa = {}) {
    const C = capa[app] || CAPACITES[app] || CAPACITES.autre, M = capa.extension || CAPACITES.extension;
    const ent = points.filter(p => p[2] === 'EA' || p[2] === 'ETOR'), sa = points.filter(p => p[2] === 'SA'), rel = points.filter(p => p[2] === 'STOR');
    const reg = [], aff = [];
    let i = 0, j = 0, k = 0;
    while (i < ent.length || j < sa.length || k < rel.length || !reg.length) {
      const n = reg.length + 1, nom = `RC${n}`;
      // Modules nécessaires pour ce régulateur (au plus MODULES_MAX)
      const reste = [ent.length - i - C[0], sa.length - j - C[1], rel.length - k - C[2]], mods = Math.min(MODULES_MAX, Math.max(0, ...reste.map((r, x) => (r > 0 ? Math.ceil(r / [M[0], M[1], M[2]][x]) : 0))));
      const capX = C[0] + mods * M[0], capY = C[1] + mods * M[1], capQ = C[2] + mods * M[2];
      const borne = (prefixe, idx, cBase, cMod) => (idx < cBase ? `${nom}/N.${prefixe}${idx + 1}` : `${nom}/A${Math.floor((idx - cBase) / cMod) + 1}.${prefixe}${((idx - cBase) % cMod) + 1}`);
      const e0 = i, s0 = j, r0 = k;
      for (let x = 0; x < capX && i < ent.length; x++, i++) aff.push([borne('X', x, C[0], M[0]), ...ent[i]]);
      for (let x = 0; x < capY && j < sa.length; x++, j++) aff.push([borne('Y', x, C[1], M[1]), ...sa[j]]);
      for (let x = 0; x < capQ && k < rel.length; x++, k++) aff.push([borne('Q', x, C[2], M[2]), ...rel[k]]);
      reg.push({ rep: nom, app, modules: mods, entrees: [i - e0, capX], sorties: [j - s0, capY], relais: [k - r0, capQ] });
      if (reg.length > 20) break;
    }
    return { regulateurs: points.length ? reg : [], affectations: aff };
  }

  // Analyse fonctionnelle et paramètres de chaque installation de l'étude, d'après ses calculs
  function contexte(etude, Liens) {
    const notes = (etude && etude.notes) || [], types = {}, installations = [], N = Nt();
    notes.forEach(n => { types[n.id] = n.type; });
    const res = n => { const e = Liens.resoudre(etude, n).entrees; return { e, v: (N.calculer(n.type, e).valeurs || {}) }; };
    const p = (libelle, valeur, unite) => (Number.isFinite(valeur) ? { libelle, valeur: Math.round(valeur * 100) / 100, unite } : null);
    notes.forEach(n => {
      try {
        const titre = n.titre || n.type;
        if (n.type === 'pid') {
          const { e } = res(n), d = Sc().dimensionner(e), r = Sc().regulation(d, e), Tb = num(e.Tbase, -10);
          const params = [p('Consigne de départ de la production', d.Td, '°C'), p('Abaissement en période réduite', num(e.reduit, 3), 'K')];
          if (d.n > 1) params.push(p('Permutation de la priorité des générateurs', num(e.permutation, 168), 'h'));
          d.circuits.forEach(c => {
            const loi = c.rc[0] > c.rc[1] && ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(c.emetteur);
            if (loi && c.reg !== 'direct') { params.push(p(`Loi d'eau ${c.rep} : départ à ${nf(Tb, 0)} °C extérieur`, c.rc[0], '°C'), p(`Loi d'eau ${c.rep} : départ à 18 °C extérieur`, Sc().depMini ? Sc().depMini(e, c) : (c.emetteur === 'plancher' ? 25 : 30), '°C')); }
            else params.push(p(`Consigne de départ ${c.rep}`, c.rc[0], '°C'));
          });
          const cc = Sc().courbeChauffe ? Sc().courbeChauffe(d.co ? d.co.dC : d, e) : null;
          if (cc) cc.circuits.forEach(c => { params.push(p(`Pente de la courbe de chauffe ${c.rep} (type Synco)`, Math.round(c.pente * 20) / 20, ''), p(`Déplacement parallèle ${c.rep}`, Math.round(c.deplacement * 2) / 2, 'K')); });
          if (d.chaud) params.push(p('Arrêt chauffage (non-chauffage) au-dessus de', cc ? cc.arret : 17, '°C ext.'));
          installations.push({ noteId: n.id, titre, app: 'production', af: ((Array.isArray(r) ? r.find(b => b.liste) : r) || {}).liste || r.af || [], params: params.filter(Boolean) });
        } else if (n.type === 'cta') {
          const { e } = res(n), f = e.froid || 'oui', recup = e.recup || '', co = f === 'co';
          const af = [
            `Démarrage : ouverture des registres d'air neuf et de rejet (fin de course contrôlée), puis ventilateur de reprise et, après temporisation (30 s), ventilateur de soufflage ; débits ${nf(num(e.Qs), 0)} m³/h soufflés${num(e.Qr) ? ` et ${nf(num(e.Qr), 0)} m³/h repris` : ''} tenus par la vitesse des ventilateurs (consigne de débit ou de pression, variateurs).`,
            `Température de soufflage : consigne ${nf(num(e.TsH, 20), 0)} °C l'hiver et ${nf(num(e.TsE, 16), 0)} °C l'été (ou décalée selon la température de reprise, régulation en cascade) ; séquences dans l'ordre : ${[recup && recup !== 'aucun' ? 'récupérateur' : '', f === 'froide' ? '' : co ? 'batterie change-over (eau chaude l\'hiver)' : 'batterie chaude', ['oui', 'froide'].includes(f) ? 'batterie froide' : co ? 'batterie change-over (eau glacée l\'été)' : ''].filter(Boolean).join(' → ')}, sans chevauchement chaud / froid.`,
            ...(recup && recup !== 'aucun' ? [`Récupérateur (${recup}) : modulé en tête de séquence ; protection antigivre (${recup === 'roue' ? 'vitesse de la roue réduite' : 'by-pass ou préchauffage'}) d'après la température de l'air rejeté ; by-pass en free-cooling quand l'air extérieur est plus favorable.`] : []),
            ...(f !== 'froide' ? ['Antigel : thermostat sur l\'aval de la batterie chaude (5 °C) — arrêt des ventilateurs, fermeture des registres, vanne chaude ouverte en grand et pompe en marche ; réarmement manuel.'] : []),
            ...(['oui', 'froide', 'co'].includes(f) ? ['Rafraîchissement nocturne (free-cooling) en été si l\'air extérieur est plus frais que l\'ambiance de plus de 2 K, batteries arrêtées.'] : []),
            ...(e.humid === 'vapeur' ? [`Humidificateur vapeur : humidité relative mini ${nf(num(e.HRmin, 40), 0)} % sur la reprise, hygrostat de sécurité sur le soufflage (85 %).`] : []),
            ...(num(e.PelBe) ? ['Batterie électrique : verrouillée sur le débit d\'air (pressostat), post-ventilation de 2 min à l\'arrêt, thermostat de sécurité à réarmement manuel.'] : []),
            'Filtres : pressostats d\'encrassement (alarme de maintenance) ; arrêt : fermeture des registres après l\'arrêt des ventilateurs ; programmation horaire et dérogation.',
          ];
          const params = [p('Consigne de soufflage hiver', num(e.TsH, 20), '°C'), ...(['oui', 'froide', 'co'].includes(f) ? [p('Consigne de soufflage été', num(e.TsE, 16), '°C')] : []), p('Débit de soufflage', num(e.Qs), 'm³/h'), ...(num(e.Qr) ? [p('Débit de reprise', num(e.Qr), 'm³/h')] : []),
            ...(f !== 'froide' ? [p('Seuil de l\'antigel', 5, '°C')] : []), p('Temporisation du ventilateur de soufflage', 30, 's'), ...(e.humid === 'vapeur' ? [p('Humidité relative mini', num(e.HRmin, 40), '%')] : [])];
          installations.push({ noteId: n.id, titre, app: 'ventilation', af, params: params.filter(Boolean) });
        } else if (n.type === 'aero' && !(n.entrees || {}).cta) {
          const { e, v } = res(n), ext = e.producteur === 'extraction';
          installations.push({ noteId: n.id, titre, app: 'ventilation', af: [`${ext ? 'Caisson d\'extraction' : 'Ventilateur'} en marche selon la programmation horaire${ext ? ' (ou en permanence en logement)' : ''}, retour de marche par pressostat ; débit ${nf(v.Qs || v.Qr, 0)} m³/h ; défaut reporté.`],
            params: [p(ext ? 'Débit extrait' : 'Débit soufflé', v.Qs || v.Qr, 'm³/h')].filter(Boolean) });
        } else if (n.type === 'ecs') {
          const { e } = res(n), Tc = num(e.Tc, 60);
          installations.push({ noteId: n.id, titre, app: 'chauffage', af: [`Production d'ECS : consigne de stockage ${nf(Tc, 0)} °C (différentiel 5 K), priorité réglable sur le chauffage ; traitement anti-légionelle hebdomadaire (70 °C pendant 1 h, ou 60 °C maintenus) ; retour de bouclage ≥ 50 °C.`],
            params: [p('Consigne de stockage ECS', Tc, '°C'), p('Différentiel de charge', 5, 'K'), p('Choc thermique anti-légionelle', 70, '°C')].filter(Boolean) });
        } else if (n.type === 'terminaux') {
          const { v } = res(n), l = v.lignes || [], nb = l.reduce((s, x) => s + (x.n || 1), 0), froid = l.some(x => x.Pfr > 0), co = l.some(x => x.b === '2t');
          if (!nb) return;
          installations.push({ noteId: n.id, titre, app: 'terminaux', af: [`${nb} terminal(aux) : chacun régulé sur la température de sa pièce (consigne locale ajustable ± 3 K), programmation horaire par zone, réduit en inoccupation, hors gel ; ventilateur arrêté en inoccupation.`,
            ...(co ? ['Terminaux 2 tubes : mode chaud / froid suivant l\'inversion (change-over) de la production.'] : []), 'Maîtres / esclaves : les esclaves suivent la consigne et la commande de leur maître.'],
            params: [p('Consigne de confort chauffage', 20, '°C'), ...(froid ? [p('Consigne de confort rafraîchissement', 26, '°C')] : []), p('Consigne d\'inoccupation chauffage', 16, '°C'), p('Consigne hors gel', 8, '°C')].filter(Boolean) });
        } else if (n.type === 'sanitaire') {
          const { v } = res(n);
          if (v.bouclage) installations.push({ noteId: n.id, titre: `${titre} — bouclage ECS`, app: 'chauffage', af: ['Pompe de bouclage ECS en marche permanente (ou horloge hors occupation), vannes thermostatiques de bouclage réglées pour un retour ≥ 50 °C sur chaque antenne.'],
            params: [p('Température mini de retour de bouclage', 50, '°C')].filter(Boolean) });
        }
      } catch (err) { /* calcul incomplet : installation ignorée */ }
    });
    return { types, installations };
  }
  // Points de contrôle de mise en service de la régulation selon la technologie
  const CONTROLES = {
    automate: ['Programme chargé, version et date notées', 'Séquences de l\'analyse fonctionnelle testées une à une', 'Consignes et paramètres réglés suivant la liste', 'Sécurités câblées et alarmes testées', 'Modes arrêt / auto / manu et reprise après coupure secteur testés', 'Sauvegarde du programme remise'],
    synco: ['Application préprogrammée choisie conforme au schéma de l\'installation', 'Entrées / sorties configurées (affectation des bornes)', 'Paramètres réglés suivant la liste', 'Date, heure et programmes horaires', 'Communication (KNX / bus) et serveur web testés', 'Sauvegarde de la configuration remise'],
    integree: ['Paramètres du régulateur intégré réglés (avec le fabricant si besoin)', 'Autorisation de marche depuis l\'armoire testée', 'Reports d\'état et de défaut testés', 'Communication bus avec la GTB testée'],
  };
  return { COURT, TECHNOS, APPS, CAPACITES, CONTROLES, application, allouer, contexte };
})();
if (typeof module !== 'undefined') module.exports = Regulation;
