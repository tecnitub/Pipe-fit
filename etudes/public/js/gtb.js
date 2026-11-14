// GTB / GTC d'une étude, à partir des points et des équipements du calcul des armoires :
// - décret BACS (R.175-1 à R.175-6 du CCH) : assujettissement, échéance, exigences, et classe de la régulation
//   d'après la NF EN ISO 52120-1 (fonctions retenues → classe A, B, C ou D) ;
// - table d'échange GTB : objets BACnet et registres Modbus de chaque point, unités, alarmes, historiques ;
// - comptage d'énergie par usage (chauffage, froid, ECS, ventilation, auxiliaires, gaz) : compteurs à prévoir ;
// - fiches d'essais point à point (une ligne par point câblé ou communiqué) ;
// - analyse fonctionnelle en séquences (démarrage, marche, arrêt, défaut, réarmement) avec paramètres par défaut.
// Évaluations de pré-dimensionnement : la classe BACS réelle se justifie avec l'intégrateur GTB et le programme livré.
const Gtb = (() => {
  const Nt = () => (typeof Notes !== 'undefined' ? Notes : require('./notes'));
  const num = (v, d) => Nt().num(v, d), nf = (v, d) => Nt().nf(v, d);
  const CLASSES = ['A', 'B', 'C', 'D'], pire = l => l.reduce((m, c) => (CLASSES.indexOf(c) > CLASSES.indexOf(m) ? c : m), 'A');

  /* ---------- Décret BACS et NF EN ISO 52120-1 ---------- */
  // ctx : { P (kW chauffage + climatisation), neuf, eqs, REG, opt (Set), gtb, pts }
  function bacs(ctx) {
    const P = num(ctx.P), eqs = ctx.eqs || [], REG = ctx.REG || { installations: [] }, opt = ctx.opt || new Set(), pts = ctx.pts || [];
    const assujetti = ctx.neuf || P > 70, echeance = ctx.neuf ? 'dès la livraison (permis de construire déposé après le 21 juillet 2021)' : P > 290 ? '1er janvier 2025 (puissance > 290 kW)' : P > 70 ? '1er janvier 2027 (puissance > 70 kW, décret n° 2023-259)' : '—';
    const a = (t, re) => eqs.some(q => q.type === t || re && re.test(q.designation || ''));
    const com = q => ['bus', 'terminal'].includes(q.regulation) || (q.pilote && q.pilote.techno === 'synco');
    const termin = eqs.filter(q => ['ventilo', 'split', 'regulateur'].includes(q.type) || q.regulation === 'terminal');
    const loiEau = REG.installations.some(x => (x.params || []).some(p => /loi d'eau|courbe de chauffe/i.test(p.libelle)));
    const prod = eqs.filter(q => ['generateur', 'pac'].includes(q.type)), pompes = eqs.filter(q => q.type === 'pompe'), vent = eqs.filter(q => ['cta', 'ventilateur'].includes(q.type));
    const co2 = eqs.some(q => /co2|co₂|qualit[ée] d.air|présence|presence/i.test(`${q.designation || ''} ${q.fonctionnement || ''}`));
    const comptage = opt.has('compteurElec') || opt.has('comptageUsages') || pts.some(p => p[4] === 'TCP');
    const gtb = ctx.gtb && ctx.gtb !== 'aucune';
    const f = [];
    if (termin.length || REG.installations.some(x => x.app === 'terminaux')) f.push(['Émission (régulation d\'ambiance)', termin.some(com) ? 'Régulation pièce par pièce communicante (consignes et horaires depuis la GTB)' : 'Régulation pièce par pièce (régulateurs autonomes)', termin.some(com) ? 'A' : 'B']);
    else if (prod.length) f.push(['Émission (régulation d\'ambiance)', loiEau ? 'Régulation centrale selon l\'extérieur (loi d\'eau), sans régulation par pièce' : 'Sans régulation d\'ambiance', loiEau ? 'C' : 'D']);
    if (prod.length) f.push(['Production', prod.some(q => ['bus', 'mod'].includes(q.regulation)) ? 'Puissance et température de départ modulées selon la demande (communication / 0-10 V)' : loiEau ? 'Température de départ selon l\'extérieur (loi d\'eau)' : 'Température de départ fixe', prod.some(q => ['bus', 'mod'].includes(q.regulation)) ? 'A' : loiEau ? 'B' : 'C']);
    if (pompes.length) f.push(['Distribution (pompes)', pompes.some(q => q.depart === 'variateur' || q.regulation === 'bus') ? 'Pompes à vitesse variable selon la demande (pression différentielle)' : pompes.some(q => ['tor', 'torRetour'].includes(q.regulation)) ? 'Pompes arrêtées hors besoin (programmation, demande des circuits)' : 'Pompes en marche permanente', pompes.some(q => q.depart === 'variateur' || q.regulation === 'bus') ? 'A' : pompes.some(q => ['tor', 'torRetour'].includes(q.regulation)) ? 'B' : 'D']);
    if (vent.length) f.push(['Ventilation (débit d\'air)', co2 ? 'Débit selon la qualité d\'air ou la présence (sonde CO₂ / détecteur)' : vent.some(q => q.regulation !== 'aucune') ? 'Débit selon la programmation horaire' : 'Marche permanente', co2 ? 'A' : vent.some(q => q.regulation !== 'aucune') ? 'C' : 'D']);
    if (REG.installations.some(x => /ecs/i.test(x.titre || '') || (REG.types || {})[x.noteId] === 'ecs')) f.push(['Eau chaude sanitaire', 'Charge programmée, priorité réglable, traitement anti-légionelle', 'B']);
    f.push(['Supervision, suivi des consommations (TBM)', gtb && comptage ? 'GTB : historiques, comptage par usage, alarmes et détection des dérives' : gtb ? 'GTB : états, alarmes et historiques, sans comptage par usage' : opt.has('webServeur') ? 'Supervision locale (serveur web) sans comptage' : 'Aucune supervision', gtb && comptage ? 'A' : gtb ? 'B' : opt.has('webServeur') ? 'C' : 'D']);
    const classe = pire(f.map(x => x[2])), conforme = ['A', 'B'].includes(classe);
    const exigences = [
      ['Suivre, enregistrer et analyser les données de production et de consommation par zone fonctionnelle, au pas de temps horaire', gtb && comptage ? 'GTB avec historiques horaires et comptages par usage' : 'À compléter : comptage par usage et historiques horaires', gtb && comptage],
      ['Conserver les données à l\'échelle mensuelle pendant 5 ans', gtb ? 'Archivage de la GTB à paramétrer (5 ans)' : 'Pas de GTB', gtb],
      ['Situer l\'efficacité énergétique par rapport à des valeurs de référence', gtb && comptage ? 'Tableaux de bord de la GTB (ratios kWh/m², comparaison aux années précédentes)' : 'À prévoir', gtb && comptage],
      ['Détecter les pertes d\'efficacité et en informer l\'exploitant', gtb ? 'Alarmes de dérive (consommations, températures, temps de marche) vers l\'exploitant' : 'À prévoir', gtb],
      ['Interopérabilité avec les différents systèmes techniques', gtb ? `Protocole ouvert : ${ctx.gtb}` : 'Protocole ouvert (BACnet, Modbus, KNX) à retenir', gtb && /bacnet|modbus|knx|lon/i.test(ctx.gtb)],
      ['Arrêt manuel et gestion autonome par la suite', 'Commutateurs Manu / Auto / Arrêt en façade, forçages GTB, reprise automatique', true],
      ['Classe A ou B de la NF EN ISO 52120-1', `Classe ${classe} estimée`, conforme],
    ];
    return { P, assujetti, echeance, fonctions: f, classe, conforme, exigences };
  }

  /* ---------- Table d'échange BACnet / Modbus ---------- */
  const UNITES = [[/humidit/i, '%HR'], [/co2|co₂/i, 'ppm'], [/temp[ée]rature|°c|loi d'eau|consigne de (confort|soufflage|départ|température)|sonde/i, '°C'], [/pression diff/i, 'kPa'], [/pression/i, 'bar'], [/débit/i, 'm³/h'], [/vitesse|0-10|modulation|position|recopie/i, '%'],
    [/énergie|energie|comptage|impulsion|index/i, 'kWh'], [/puissance/i, 'kW'], [/heures|temps de marche/i, 'h']];
  const ABR = [[/commande de marche|marche \/ arrêt|autorisation/i, 'CMD'], [/retour de marche|état de marche/i, 'ETAT'], [/défaut|defaut|alarme/i, 'DEF'], [/consigne/i, 'CSG'], [/vitesse/i, 'VIT'], [/ouverture/i, 'OUV'], [/fermeture/i, 'FER'], [/recopie|position/i, 'POS'], [/température|temperature/i, 'T'], [/pression/i, 'P'], [/débit/i, 'Q'], [/énergie|index|comptage|impulsion/i, 'NRJ'], [/puissance/i, 'PUI'], [/mesure/i, 'MES'], [/programme horaire/i, 'PH'], [/synthèse/i, 'SYNT'], [/commutateur/i, 'COMM'], [/contact/i, 'CTC']];
  const objetDe = (type, classe, des) => {
    if (type === 'EA') return 'AI'; if (type === 'SA') return 'AO'; if (type === 'ETOR') return 'BI'; if (type === 'STOR') return 'BO';
    if (type === 'LOG') return /programme horaire/i.test(des) ? 'SCHEDULE' : /synthèse|défaut/i.test(des) ? 'BV' : 'AV';
    return { TM: 'AI', TCP: 'AI', TA: 'BI', TS: 'BI', TC: 'BV', TR: 'AV' }[classe] || 'AV';
  };
  const MODBUS = { AI: ['IR', '3x', 2], AO: ['HR', '4x', 2], AV: ['HR', '4x', 2], BI: ['DI', '1x', 1], BO: ['Coil', '0x', 1], BV: ['Coil', '0x', 1], SCHEDULE: ['HR', '4x', 16] };
  const SECU = /sécurité|securite|gaz|incendie|ssi|manque d'eau|arrêt d'urgence|antigel|surchauffe/i;
  const SECU_EQ = /arrêt d'urgence|détection gaz|pressostat|manque d'eau|thermostat de sécurité|incendie|ssi/i;
  // pts : [repère, libellé, type, armoire, classe, protocole, équipement, libellé court, …] ; armoires : repères dans l'ordre
  // reglages : [{ rep, libelle, priorite, bas, haut, historique }] saisis dans l'étude, appliqués aux points concernés
  // (repère identique ou « * », libellé contenant le texte saisi) ; la dernière ligne qui s'applique l'emporte
  /* ---------- Nommage des points par installation (CH_, ECS_, CTA_…), états et unités ---------- */
  // p : point de la liste des points [repère, libellé, type E/S, armoire, classe, —, « REP — équipement », fonction, src, app]
  const PREFIXES = [[/\becs\b|eau chaude sanitaire|ballon|bouclage|légionelle/i, 'ECS', 'Eau chaude sanitaire'], [/cassette/i, 'CAS', 'Cassettes'], [/ventilo/i, 'VC', 'Ventilo-convecteurs'],
    [/\bcta\b|centrale de traitement|traitement d'air/i, 'CTA', 'CTA'], [/désenfumage|desenfumage/i, 'DES', 'Désenfumage'], [/\bvmc\b|extraction|extracteur|caisson/i, 'VMC', 'Ventilation'],
    [/compteur|comptage/i, 'CPT', 'Comptages'], [/surpresseur|adoucisseur|eau froide sanitaire/i, 'SAN', 'Sanitaire']];
  const PAR_APP = { production: ['CH', 'Chaufferie / production'], chauffage: ['CH', 'Chaufferie / production'], ventilation: ['VENT', 'Ventilation'], terminaux: ['TERM', 'Terminaux'], autre: ['CVC', 'Communs'] };
  function installationPoint(p) {
    const t = `${p[6] || ''} ${p[1] || ''}`, m = PREFIXES.find(([re]) => re.test(t));
    if (m) return { prefixe: m[1], nom: m[2] };
    if (p[9] === 'production' && /froid|eau glacée|refroidisseur|groupe frigorifique|tour aéro/i.test(t)) return { prefixe: 'FR', nom: 'Production de froid' };
    const a = PAR_APP[p[9]] || PAR_APP.autre;
    return { prefixe: a[0], nom: a[1] };
  }
  const FCT = [[/autorisation/i, 'AUT'], [/commande de marche|marche \/ arrêt/i, 'CMD'], [/retour de marche|état de marche/i, 'RET'], [/défaut|defaut|alarme/i, 'DEF'], [/consigne|modulation/i, 'CSG'],
    [/vitesse/i, 'VIT'], [/ouverture/i, 'OUV'], [/fermeture/i, 'FER'], [/recopie|position/i, 'POS'], [/mode chaud|change-over|inversion/i, 'CO'], [/encrassement|filtre/i, 'FILT'],
    [/co2|co₂/i, 'CO2'], [/humidit/i, 'HR'], [/température|temperature|sonde/i, 'T'], [/pression/i, 'P'], [/débit/i, 'Q'], [/énergie|index|comptage|impulsion/i, 'NRJ'], [/puissance/i, 'PUI'],
    [/programme horaire/i, 'PH'], [/commutateur/i, 'COMM'], [/mesure/i, 'MES'], [/commande/i, 'CMD']];
  const propre = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
  function nomPoint(p) {
    const f = FCT.find(([re]) => re.test(p[7] || '')) || FCT.find(([re]) => re.test(p[1] || ''));
    let c = f ? f[1] : propre(p[7] || p[1]).slice(0, 6) || 'PT';
    if (p[2] === 'SA' && c === 'CMD') c = 'CSG'; // sortie 0-10 V : consigne / position demandée
    if (p[2] === 'EA' && c === 'MES') { const g = FCT.find(([re]) => re.test(p[6] || '')); if (g && ['T', 'P', 'Q', 'HR', 'CO2'].includes(g[1])) c = g[1]; }
    return `${installationPoint(p).prefixe}_${propre(p[0]) || 'PT'}_${c}`;
  }
  // Noms uniques d'une liste de points (doublon : suffixe _2, _3…)
  function nomsPoints(pts) {
    const vus = {};
    return pts.map(p => { const n = nomPoint(p); vus[n] = (vus[n] || 0) + 1; return vus[n] > 1 ? `${n}_${vus[n]}` : n; });
  }
  // États (points TOR) ou unité (points analogiques)
  function etats(p) {
    const t = `${p[7] || ''} ${p[1] || ''}`, eq = String(p[6] || '');
    if (p[2] === 'ETOR') return SECU_EQ.test(eq) || SECU.test(p[7] || '') ? 'Normal / Alarme' : /défaut|defaut/i.test(t) ? 'Normal / Défaut' : /encrass|filtre/i.test(t) ? 'Propre / Encrassé'
      : /fenêtre|fenetre|fin de course|position|ouvert/i.test(t) ? 'Fermé / Ouvert' : /commutateur/i.test(t) ? 'Arrêt / Manu / Auto' : /mode|chaud \/ froid|été|hiver/i.test(t) ? 'Chaud / Froid' : 'Arrêt / Marche';
    if (p[2] === 'STOR') return /mode|change-over|inversion|chaud \/ froid/i.test(t) ? 'Chaud / Froid' : /vanne|volet|registre|ouverture|fermeture|clapet/i.test(`${t} ${eq}`) && !/pompe|ventilateur|chaudière|brûleur/i.test(eq) ? 'Fermée / Ouverte' : 'Arrêt / Marche';
    if (p[2] === 'SA') return '0-100 %';
    if (p[2] === 'EA') return ((UNITES.find(([re]) => re.test(t)) || [, ''])[1]) || 'selon le capteur';
    return p[2] === 'Bus' ? 'valeurs lues sur le bus' : '';
  }
  const TYPE_ES = { STOR: 'DO', ETOR: 'DI', SA: 'AO', EA: 'AI', Bus: 'Bus' };

  // materiel : { repère: « Fabricant Référence » } du matériel retenu (colonne « Matériel retenu »)
  function echange(pts, armoires = [], reglages = [], { nommage = 'installation', materiel = {} } = {}) {
    const mat = rep => { const r = String(rep || ''); return (materiel || {})[r] || (materiel || {})[r.replace(/\.\d+$/, '')] || ''; };
    const regl = (reglages || []).filter(r => r && (String(r.rep || '').trim() || String(r.libelle || '').trim()));
    const devices = new Map(armoires.map((a, i) => [a, 1000 + i + 1])), cpt = {}, noms = nomsPoints(pts);
    return pts.map((p, ip) => {
      const ar = p[3], des = p[7] || p[1], obj = objetDe(p[2], p[4], des), k = `${ar}|${obj}`, mb = MODBUS[obj];
      if (!devices.has(ar)) devices.set(ar, 1000 + devices.size + 1);
      const c = cpt[k] || (cpt[k] = { inst: 0, reg: 0 }); c.inst += 1; const reg = c.reg; c.reg += mb[2];
      const binaire = ['BI', 'BO', 'BV'].includes(obj), unite = binaire ? 'état' : obj === 'SCHEDULE' ? '—' : ((UNITES.find(([re]) => re.test(des)) || UNITES.find(([re]) => re.test(`${p[1]} ${p[6] || ''}`)) || [, ''])[1]);
      const mn = (ABR.find(([re]) => re.test(des)) || [, String(des).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8)])[1];
      const nom = nommage === 'installation' ? noms[ip] : `${ar}_${p[0]}_${mn}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '').replace(/\./g, '_').toUpperCase();
      const alarme = p[4] === 'TA' ? ((SECU.test(des) || SECU_EQ.test(p[6] || '')) ? 'P1 (sécurité)' : 'P2 (défaut)') : /encrassement|filtre/i.test(des) ? 'P3 (maintenance)' : '';
      const histo = ['TM', 'TCP'].includes(p[4]) ? (p[4] === 'TCP' ? 'horaire + mensuel (5 ans)' : '15 min') : ['TS', 'TC', 'TA'].includes(p[4]) ? 'sur changement' : '';
      const x = { alarme, histo, bas: '', haut: '' };
      regl.filter(r => { const rr = String(r.rep || '').trim(), rl = String(r.libelle || '').trim().toLowerCase(); return (!rr || rr === '*' || rr === p[0] || String(p[0]).startsWith(`${rr}.`)) && (!rl || `${des} ${p[1]}`.toLowerCase().includes(rl)); })
        .forEach(r => { if (r.priorite) x.alarme = r.priorite === 'aucune' ? '' : r.priorite; if (r.historique) x.histo = r.historique; if (String(r.bas ?? '') !== '') x.bas = String(r.bas); if (String(r.haut ?? '') !== '') x.haut = String(r.haut); });
      return [ar, `${devices.get(ar)}`, p[0], des, p[2], p[4], obj, String(c.inst), `${mb[0]} ${mb[1]}${String(reg).padStart(4, '0')}`, unite, x.alarme, x.histo, nom, x.bas, x.haut, mat(p[0])];
    });
  }
  const ENTETES_ECHANGE = ['Armoire', 'Device BACnet', 'Repère', 'Libellé', 'E/S', 'Classe', 'Objet BACnet', 'Instance', 'Registre Modbus', 'Unité', 'Alarme', 'Historique', 'Nom d\'objet', 'Seuil bas', 'Seuil haut', 'Matériel retenu'];
  // Export selon un profil (colonnes du logiciel de l'intégrateur ou de l'automaticien : nom de colonne ← donnée ou valeur fixe)
  // profil : [{ colonne, source, fixe }] ; sans profil, toutes les colonnes de la table d'échange ; séparateur « ; », « , » ou tabulation
  function exporter(lignes, profil = [], sep = ';') {
    const p = (profil || []).filter(x => x && String(x.colonne || '').trim());
    const ent = p.length ? p.map(x => String(x.colonne).trim()) : ENTETES_ECHANGE;
    const ls = p.length ? lignes.map(l => p.map(x => (x.source === 'fixe' || !x.source ? String(x.fixe ?? '') : l[ENTETES_ECHANGE.indexOf(x.source)] ?? ''))) : lignes;
    const s = sep === 'tab' ? '\t' : sep === ',' ? ',' : ';';
    return [ent, ...ls].map(l => l.map(v => { const t = String(v ?? ''); return t.includes(s) || /["\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(s)).join('\r\n');
  }
  const csv = (entetes, lignes) => [entetes, ...lignes].map(l => l.map(v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');

  /* ---------- Comptage d'énergie par usage ---------- */
  // Compteurs à prévoir d'après les usages présents (RE2020 / RT 2012 art. 31, décret tertiaire, BACS) ; un compteur
  // déjà présent (même repère) n'est pas doublé. Renvoie des équipements « virtuels » à ajouter au calcul des armoires.
  function comptages(eqs, REG, opts = {}) {
    const inst = (REG && REG.installations) || [], types = (REG && REG.types) || {}, out = [];
    const a = (f) => eqs.some(f), pTh = (lib) => [['Index d\'énergie', 'Bus'], ['Puissance instantanée', 'Bus'], ['Débit', 'Bus'], ['Températures départ / retour', 'Bus']].map(([d, t]) => [`${d}`, t]);
    const chaud = a(q => q.type === 'generateur') || inst.some(x => x.app === 'production'), froid = a(q => q.type === 'pac' && /froid|groupe|réversible|reversible/i.test(q.designation || '')) || inst.some(x => (x.params || []).some(p => /froid|glacée|rafraîchissement/i.test(p.libelle)) && x.app === 'production');
    const ecs = inst.some(x => types[x.noteId] === 'ecs' || /ecs|sanitaire/i.test(x.titre || '')), vent = a(q => ['cta', 'ventilateur'].includes(q.type)), gaz = a(q => q.type === 'generateur' && /gaz/i.test(q.designation || '')) || opts.gaz;
    const th = (rep, usage) => out.push({ rep, designation: `Compteur d'énergie thermique — ${usage}`, type: 'sonde', P: 0, tension: '24V', regulation: 'terminal', pointsUnit: pTh(), usage, afAuto: `compteur d'énergie thermique (${usage}) relevé par bus M-Bus / Modbus : index, puissance, débit et températures historisés`, src: `comptage:${rep}` });
    const el = (rep, usage) => out.push({ rep, designation: `Sous-compteur électrique — ${usage}`, type: 'sonde', P: 0, tension: '24V', regulation: 'terminal', pointsUnit: [['Index d\'énergie électrique', 'Bus'], ['Puissance active', 'Bus']], usage, afAuto: `sous-compteur d'énergie électrique (${usage}) relevé par bus Modbus : index et puissance historisés`, src: `comptage:${rep}` });
    if (chaud) th('CET-CH', 'chauffage');
    if (froid) th('CET-FR', 'refroidissement');
    if (ecs) { th('CET-ECS', 'eau chaude sanitaire'); out.push({ rep: 'CE-ECS', designation: 'Compteur d\'eau froide d\'alimentation de l\'ECS (émetteur d\'impulsions)', type: 'sonde', P: 0, tension: '24V', regulation: 'impulsion', usage: 'eau chaude sanitaire', src: 'comptage:CE-ECS' }); }
    if (gaz) out.push({ rep: 'CPT-GAZ', designation: 'Compteur de gaz (émetteur d\'impulsions)', type: 'sonde', P: 0, tension: '24V', regulation: 'impulsion', usage: 'chauffage (gaz)', src: 'comptage:CPT-GAZ' });
    if (a(q => ['generateur', 'pac'].includes(q.type) && num(q.P) > 0)) el('CPT-E-PROD', 'production (générateurs, PAC)');
    if (a(q => q.type === 'pompe')) el('CPT-E-AUX', 'auxiliaires (pompes, circulateurs)');
    if (vent) el('CPT-E-VENT', 'ventilation (CTA, extracteurs)');
    const reps = new Set(eqs.map(q => String(q.rep || '').trim()));
    return out.filter(x => !reps.has(x.rep));
  }

  /* ---------- Essais point à point ---------- */
  const ESSAIS = {
    EA: ['Comparer la mesure à un appareil étalonné ; débrancher la sonde : alarme de sonde', 'Écart ≤ 0,5 K (température), ≤ 5 % (autres)'],
    SA: ['Imposer 0, 50 et 100 % depuis l\'automate ; observer l\'organe', 'Course complète, sens d\'action correct'],
    ETOR: ['Provoquer l\'état sur site (contact, défaut simulé) ; lire la remontée', 'État et horodatage corrects, alarme si défaut'],
    STOR: ['Forcer la sortie depuis l\'automate ; observer l\'organe commandé', 'Marche / arrêt effectif, retour de marche cohérent'],
    Bus: ['Lire la valeur et écrire une consigne depuis la GTB', 'Valeur cohérente avec l\'afficheur, écriture prise en compte'],
    LOG: ['Modifier depuis la supervision ; vérifier l\'effet', 'Paramètre enregistré et appliqué'],
  };
  const essai = type => ESSAIS[type] || ESSAIS.Bus;
  // adresses : [adresse, bornes, repère, désignation, type, signal] d'une armoire (lignes de réserve exclues)
  const essais = adresses => (adresses || []).filter(x => x[2] && x[2] !== '—').map(x => [x[0], x[1], x[2], x[3], x[4], ...essai(x[4]), '☐', '☐', '']);
  const ENTETES_ESSAIS = ['Adresse', 'Bornes', 'Repère', 'Désignation', 'Type', 'Essai', 'Attendu', 'Automate', 'GTB', 'Date / visa'];

  /* ---------- Analyse fonctionnelle en séquences ---------- */
  const val = (params, re, d, u = '') => { const p = (params || []).find(x => re.test(x.libelle)); return p ? `${nf(p.valeur, p.valeur % 1 ? 1 : 0)} ${p.unite || u}`.trim() : d; };
  function sequences(inst, type, opts = {}) {
    const P = inst.params || [], perm = num(opts.permutation, 168);
    // Séquences propres de l'installation (calculs annexes : hotte, parking, géothermie, solaire, bouclage…)
    if (Array.isArray(inst.sequences) && inst.sequences.length) return inst.sequences;
    if (inst.securite) return null;
    if (inst.app === 'production') return [
      ['Démarrage', 'Autorisation par la programmation horaire et la demande des circuits ; pompes primaires puis générateur(s) après retour de marche', 'Temporisation de démarrage 30 s'],
      ['Marche normale', `Température de départ selon la loi d'eau (consigne ${val(P, /consigne de départ de la production/i, 'selon la courbe')}) ; cascade : générateur suivant si la consigne n'est pas tenue après 10 min à 100 % ; permutation de la priorité`, `PID départ : bande proportionnelle 20 K, temps intégral 240 s ; permutation ${nf(perm, 0)} h`],
      ['Arrêt', `Arrêt du chauffage au-dessus de ${val(P, /non-chauffage|arrêt chauffage/i, '17 °C ext.')} ; générateur arrêté puis post-circulation des pompes`, 'Post-circulation 5 min ; dégommage hebdomadaire 30 s'],
      ['Défaut', 'Défaut d\'un générateur : basculement sur le suivant, alarme P2 ; sécurité (manque d\'eau, gaz, arrêt d\'urgence) : coupure câblée, alarme P1', 'Alarme si consigne non atteinte après 30 min'],
      ['Réarmement', 'Sécurités câblées : réarmement manuel sur site après levée du défaut ; défauts logiciels : acquittement depuis la GTB', '—']];
    if (inst.app === 'ventilation' && type === 'cta') return [
      ['Démarrage', 'Ouverture des registres (fin de course contrôlée), ventilateur de reprise puis de soufflage', `Temporisation soufflage ${val(P, /temporisation/i, '30 s')}`],
      ['Marche normale', `Soufflage à ${val(P, /soufflage hiver/i, '20 °C')} l'hiver${val(P, /soufflage été/i, '') ? `, ${val(P, /soufflage été/i, '')} l'été` : ''} ; séquences récupérateur → batterie chaude → froide sans chevauchement ; débit tenu par la vitesse`, 'PID soufflage : 8 K, 180 s ; PID pression de gaine : 100 Pa, 60 s'],
      ['Arrêt', 'Arrêt des ventilateurs (post-ventilation si batterie électrique), fermeture des registres, vannes fermées', 'Post-ventilation 2 min'],
      ['Défaut', `Antigel (${val(P, /antigel/i, '5 °C')}) : arrêt des ventilateurs, registres fermés, vanne chaude 100 %, alarme P1 ; défaut ventilateur : arrêt de la CTA, alarme P2 ; filtres encrassés : alarme P3`, 'Seuils d\'encrassement selon la fiche des filtres'],
      ['Réarmement', 'Antigel et sécurités incendie : réarmement manuel ; autres défauts : acquittement GTB', '—']];
    if (inst.app === 'ventilation') return [
      ['Démarrage', 'Mise en marche selon la programmation horaire (ou permanente en logement)', 'Retour de marche contrôlé après 60 s'],
      ['Marche normale', `Débit ${val(P, /débit/i, 'nominal')} tenu par la vitesse (variateur)`, 'Vitesse réglée à la mise en service'],
      ['Arrêt', 'Arrêt hors occupation (sauf hygiène), arrêt par le SSI', '—'],
      ['Défaut', 'Absence de retour de marche ou défaut du variateur : alarme P2', 'Temporisation 60 s'],
      ['Réarmement', 'Acquittement depuis la GTB ; défaut variateur : réarmement local', '—']];
    if (inst.app === 'terminaux') return [
      ['Démarrage', 'Programmation horaire par zone ; relance anticipée avant l\'occupation', 'Relance optimisée (1 à 3 h selon l\'inertie)'],
      ['Marche normale', `Régulation sur la température de la pièce : confort ${val(P, /confort chauffage/i, '20 °C')}${val(P, /rafraîchissement/i, '') ? `, rafraîchissement ${val(P, /rafraîchissement/i, '')}` : ''} ; dérogation locale ± 3 K`, 'PI ambiance : 2 K, 600 s'],
      ['Arrêt', `Inoccupation : réduit ${val(P, /inoccupation/i, '16 °C')}, ventilateur arrêté ; hors gel ${val(P, /hors gel/i, '8 °C')}`, '—'],
      ['Défaut', 'Défaut du terminal ou de la communication : alarme P2, terminal en sécurité (vanne fermée)', '—'],
      ['Réarmement', 'Automatique au retour de la communication ; acquittement GTB', '—']];
    if (/ecs/i.test(inst.titre || '') || type === 'ecs') return [
      ['Démarrage', 'Charge selon la programmation horaire (heures creuses si électrique) et la température du ballon', `Différentiel de charge ${val(P, /différentiel/i, '5 K')}`],
      ['Marche normale', `Stockage à ${val(P, /stockage/i, '60 °C')}, priorité réglable sur le chauffage, bouclage permanent (retour ≥ 50 °C)`, 'PID échangeur : 15 K, 120 s'],
      ['Arrêt', 'Fin de charge à la consigne ; pompe de bouclage maintenue', '—'],
      ['Défaut', 'Température de retour de bouclage < 50 °C ou stockage < 55 °C : alarme P2', 'Temporisation 30 min'],
      ['Réarmement', `Choc anti-légionelle hebdomadaire ${val(P, /légionelle/i, '70 °C')} pendant 1 h, acquittement GTB`, '—']];
    return [
      ['Démarrage', 'Autorisation par l\'automate selon la programmation horaire', '—'],
      ['Marche normale', (inst.af || [])[0] || 'Selon l\'analyse fonctionnelle', '—'],
      ['Arrêt', 'Hors occupation ou sur ordre de la GTB', '—'],
      ['Défaut', 'Alarme P2 vers la GTB', '—'],
      ['Réarmement', 'Acquittement depuis la GTB', '—']];
  }

  /* ---------- Synoptique GTB d'une installation (base pour l'intégrateur) ---------- */
  // Une vignette par équipement (symbole selon le type), reliées par la ligne du réseau ; sous chaque vignette, ses points
  // avec leur classe (TA, TS, TM…) ; pts : liste des points du calcul des armoires
  const ech = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const COUL = { TA: '#c0392b', TS: '#2471a3', TCP: '#7d3c98', TM: '#117a65', TC: '#b9770e', TR: '#a04000', LOG: '#555' };
  function synoptique(titre, eqs, pts) {
    const parRep = rep => pts.filter(p => p[0] === rep || String(p[0]).startsWith(`${rep}.`));
    const l = eqs.filter(q => parRep(q.rep).length), parLigne = 7, lw = 150, haut = 250;
    if (!l.length) return '';
    const lignes = Math.ceil(l.length / parLigne), W = 40 + Math.min(l.length, parLigne) * lw, H = 60 + lignes * haut, out = [];
    const t = (x, y, s, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 9}" text-anchor="${o.a || 'middle'}"${o.b ? ' font-weight="bold"' : ''} fill="${o.c || '#222'}">${ech(s)}</text>`);
    t(12, 22, `Synoptique GTB — ${titre}`, { a: 'start', b: true, fs: 13 });
    t(12, 40, 'Base de vue pour l\'intégrateur : équipements, points et classes (TA alarme, TS état, TM mesure, TC commande, TR réglage, TCP comptage)', { a: 'start', fs: 9, c: '#555' });
    for (let r = 0; r < lignes; r++) { const y = 60 + r * haut + 60, n = Math.min(parLigne, l.length - r * parLigne); out.push(`<line x1="${40 + lw / 2}" y1="${y}" x2="${40 + (n - 0.5) * lw}" y2="${y}" stroke="#c0392b" stroke-width="3"/>`); }
    l.forEach((q, i) => {
      const x = 40 + (i % parLigne) * lw + lw / 2, y = 60 + Math.floor(i / parLigne) * haut + 60, ty = q.type;
      if (ty === 'pompe') out.push(`<circle cx="${x}" cy="${y}" r="16" fill="#fff" stroke="#222" stroke-width="1.5"/><polygon points="${x - 8},${y - 10} ${x + 12},${y} ${x - 8},${y + 10}" fill="#222"/>`);
      else if (ty === 'vanne') out.push(`<polygon points="${x - 14},${y - 9} ${x + 14},${y + 9} ${x + 14},${y - 9} ${x - 14},${y + 9}" fill="#fff" stroke="#222" stroke-width="1.5"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 20}" stroke="#222"/><rect x="${x - 7}" y="${y - 28}" width="14" height="9" fill="#fff" stroke="#222"/>`);
      else if (ty === 'sonde' || ty === 'securite') out.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 22}" stroke="#222"/><circle cx="${x}" cy="${y - 28}" r="7" fill="#fff" stroke="#222" stroke-width="1.5"/>`);
      else if (ty === 'ventilateur') out.push(`<circle cx="${x}" cy="${y}" r="17" fill="#fff" stroke="#222" stroke-width="1.5"/><path d="M${x} ${y} L${x - 9} ${y - 12} A15 15 0 0 1 ${x + 6} ${y - 14} Z M${x} ${y} L${x + 13} ${y + 5} A15 15 0 0 1 ${x + 3} ${y + 15} Z M${x} ${y} L${x - 12} ${y + 8} A15 15 0 0 1 ${x - 15} ${y - 6} Z" fill="#888"/>`);
      else out.push(`<rect x="${x - 26}" y="${y - 18}" width="52" height="36" rx="4" fill="#fff" stroke="#222" stroke-width="1.5"/>`, `<text x="${x}" y="${y + 4}" font-size="9" text-anchor="middle" font-weight="bold">${ech(({ generateur: 'GÉN.', pac: 'PAC', cta: 'CTA', ventilo: 'VC', split: 'SPLIT', resistance: 'R', electrovanne: 'EV', regulateur: 'RÉG.' })[ty] || 'ÉQ.')}</text>`);
      t(x, y + 34, q.rep, { b: true, fs: 10 }); t(x, y + 46, String(q.designation || '').slice(0, 26), { fs: 8, c: '#555' });
      parRep(q.rep).slice(0, 9).forEach((p, k) => { const c = p[4] || 'TM', yy = y + 62 + k * 14;
        out.push(`<rect x="${x - lw / 2 + 8}" y="${yy - 9}" width="26" height="11" rx="2" fill="${COUL[c] || '#555'}"/>`); t(x - lw / 2 + 21, yy, c, { fs: 7, b: true, c: '#fff' }); t(x - lw / 2 + 38, yy, String(p[7] || p[1]).slice(0, 24), { a: 'start', fs: 7.5 }); });
      if (parRep(q.rep).length > 9) t(x, y + 62 + 9 * 14, `… ${parRep(q.rep).length - 9} autre(s) point(s)`, { fs: 7, c: '#777' });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }

  /* ---------- Logique de fonctionnement pas à pas (par installation de l'armoire) ---------- */
  // pilotes : équipements pilotés par l'armoire ; REG : installations de la régulation ; renvoie [[installation, n°, logique]]
  function logique(pilotes, REG, { permutation = 168, noms = {}, projet = null } = {}) {
    const co = projet ? projet.changeOver : { chaud: 30, froid: 18 }, pr = projet && projet.production, nfr = v => String(Math.round(v * 10) / 10).replace('.', ',');
    const out = [], P = id => ((REG.installations || []).find(x => x.noteId === id) || {}).params || [];
    const idDe = q => String(q.src || '').split(':')[0], tous = pilotes.map(q => q.designation || '').join(' ');
    const n = rep => noms[rep] || rep, ajoute = (inst, l) => l.filter(Boolean).forEach((t, i) => out.push([inst, String(i + 1), t]));
    const gens = pilotes.filter(q => q.type === 'generateur' || q.type === 'pac');
    const te = pilotes.find(q => /extérieur/i.test(q.designation || '') && (q.type === 'sonde' || q.regulation === 'sonde'));
    const tdg = pilotes.find(q => /départ général|collecteur|découplage/i.test(q.designation || '') && (q.type === 'sonde' || q.regulation === 'sonde'));
    const params = gens.length ? P(idDe(gens[0])) : [];
    // Production hétérogène (rôles saisis sur le schéma) : ordre de priorité base → relève → appoint, secours en défaut
    const ROLES = [['recuperation', 'récupération'], ['base', 'base'], ['releve', 'relève'], ['appoint', 'appoint']], roles = gens.some(q => q.role);
    const parRole = r => gens.filter(q => q.role === r).map(q => n(q.rep));
    if (gens.length >= 2) ajoute('Cascade des générateurs', [
      `Demande de chaleur si un circuit ou l'ECS demande ; sinon générateurs à l'arrêt.`,
      roles ? `Ordre de priorité : ${ROLES.filter(([r]) => parRole(r).length).map(([r, l]) => `${l} (${parRole(r).join(', ')})`).join(' → ')}${parRole('secours').length ? ` ; secours (${parRole('secours').join(', ')}) seulement en défaut d'un générateur` : ''} ; permutation entre générateurs de même rôle chaque semaine (lundi 10 h).`
        : `Générateur pilote = celui qui a le moins d'heures de marche ; permutation chaque semaine (lundi 10 h).`,
      `Enclenchement du pilote : pompe primaire en marche, retour de marche contrôlé (30 s), puis autorisation (${gens.map(q => n(q.rep)).join(', ')}).`,
      pr ? `Consigne de départ = plus haute demande des circuits + 5 K, plafonnée à ${nfr(pr.Td)} °C (${nfr(pr.consigneBase)} °C par grand froid)${pr.ecsMin ? ` ; ${nfr(pr.ecsMin)} °C au moins pendant une charge ECS` : ''}.` : '',
      `Si ${tdg ? n(tdg.rep) : 'la température de départ général'} reste sous la consigne (${pr ? 'calculée ci-dessus' : val(params, /consigne de départ de la production/i, 'loi d\'eau')}) de plus de 5 °C pendant 10 min : enclenchement du générateur suivant.`,
      `Si elle dépasse la consigne de plus de 5 °C pendant 5 min : délestage du dernier enclenché ; sa pompe s'arrête 3 min après (post-circulation).`,
      `Un générateur en défaut sort de la séquence, le suivant prend le relais ; alarme P2.`]);
    else if (gens.length) ajoute(`Production (${gens[0].designation || gens[0].rep})`, [
      `Autorisation de ${n(gens[0].rep)} si un circuit ou l'ECS demande ; consigne de départ ${val(params, /consigne de départ de la production/i, 'selon la loi d\'eau')}.`,
      'Arrêt sur fin de demande, post-circulation de la pompe primaire 3 min.', 'Défaut : alarme P2, sécurités câblées en dur (coupure indépendante de l\'automate).']);
    // Pompes doubles et pompes de circuit
    const grp = [...new Set(pilotes.filter(q => q.groupe).map(q => q.groupe))];
    if (grp.length) ajoute('Pompes doubles', [
      `Une seule pompe en service par groupe (${grp.join(', ')}) ; permutation toutes les ${permutation} h de marche, avec 5 s de recouvrement.`,
      'Défaut ou discordance (ordre sans retour de marche sous 30 s) de la pompe en service : bascule immédiate sur l\'autre et alarme P2.']);
    const circ = pilotes.filter(q => q.type === 'pompe' && !q.groupe && !/primaire|bouclage|ecs/i.test(q.designation || ''));
    if (circ.length) ajoute('Pompes de circuit', [
      `Marche si le programme horaire du circuit est en occupation (relance comprise)${te ? `, ou si ${n(te.rep)} < 3 °C (hors gel, hystérésis 1 K)` : ''}.`,
      'Arrêt hors occupation après fermeture de la vanne du circuit ; dégommage 30 s chaque lundi 10 h si arrêtée depuis 7 jours.']);
    pilotes.filter(q => ['v3p', 'v010', 'v010r'].includes(q.regulation) && !/ecs|ballon/i.test(q.designation || '')).forEach(q => {
      const circuit = String(q.designation || '').replace(/^(Vanne de régulation|Vanne)\s*/i, '').trim(), p = P(idDe(q)).filter(x => /loi d'eau|pente|consigne/i.test(x.libelle) && (!circuit || x.libelle.includes(circuit.split(' ')[0])));
      const loi = p.some(x => /loi d'eau|pente/i.test(x.libelle)), txt = p.map(x => `${x.libelle.replace(/^Loi d'eau [^:]*: /, '')} ${String(x.valeur).replace('.', ',')} ${x.unite || ''}`.trim()).join(' ; ');
      ajoute(`Circuit ${circuit || q.rep}`, [loi ? `Loi d'eau sur ${te ? n(te.rep) : 'la température extérieure'} : ${txt}.` : `Consigne : ${txt || 'selon l\'analyse fonctionnelle'}.`,
        `${n(q.rep)} régule la température de départ (PI, bande 20 K, intégrale 240 s) ; réduit de 4 °C hors occupation, hors gel toujours actif.`]);
    });
    // ECS
    const ecs = pilotes.filter(q => /\becs\b|ballon|bouclage/i.test(q.designation || ''));
    if (ecs.length) {
      const pe = P(idDe(ecs[0])), cons = val(pe, /stockage/i, '60 °C');
      ajoute('ECS', [`Charge du ballon quand sa température passe sous ${cons} − 5 K ; arrêt à ${cons}.`,
        'Pendant la charge : pompe primaire ECS en marche, priorité ECS sur les circuits de chauffage (consigne de production portée à 70 °C au moins).',
        ecs.some(q => /bouclage/i.test(q.designation || '')) ? 'Pompe de bouclage en marche permanente ; retour de bouclage ≥ 50 °C (alarme sinon).' : 'Bouclage : retour ≥ 50 °C à contrôler.',
        `Montée en température anti-légionelle ${val(pe, /légionelle/i, '70 °C')} pendant 1 h, fréquence selon le carnet sanitaire.`]);
    }
    // CTA (change-over si le réseau est réversible)
    const cta = pilotes.filter(q => q.type === 'cta' || /^cta\b|centrale de traitement/i.test(q.designation || ''));
    if (cta.length) {
      const coCta = /change-over|réversible|reversible|2 tubes/i.test(tous) || !!(projet && projet.circuits.length && (REG.installations || []).some(x => x.donnees && x.donnees.changeOver)), pc = P(idDe(cta[0]));
      const pCta = projet && projet.pressionsCta.find(x => x.soufflage !== null);
      ajoute(`CTA${cta[0].designation ? ` (${String(cta[0].designation).replace(/^.*— /, '').replace(/\s*\(.*\)$/, '')})` : ''}`, [
        coCta ? `Mode chaud si la température d'eau arrivée batterie > ${co.chaud} °C, froid si < ${co.froid} °C (${projet ? projet.changeOver.source : 'valeurs courantes'}), sinon le dernier mode est gardé ; inversion uniquement vanne de batterie fermée.` : '',
        'Démarrage : registres air neuf / rejet ouverts (fin de course), attente 60 s ; ventilateur de reprise puis de soufflage à 10 s d\'écart ; contrôle des pressostats sous 30 s.',
        `Régulation de la température (reprise ou ambiance) : ${val(pc, /soufflage hiver|confort/i, '20 °C')} en chaud${val(pc, /soufflage été|rafraîchissement/i, '') ? `, ${val(pc, /soufflage été|rafraîchissement/i, '')} en froid` : ''} ; soufflage limité entre 16 et 30 °C ; séquence récupérateur ou volet de mélange, puis batterie.`,
        `Débits : pressions de gaine soufflage et reprise tenues par la vitesse des ventilateurs (${pCta ? `consignes ${pCta.soufflage} Pa${pCta.reprise !== null ? ` / ${pCta.reprise} Pa` : ''}, ${pCta.source}` : 'consignes relevées à la mise en service'}) ; CO₂ > 1 000 ppm : débits augmentés progressivement.`,
        `Arrêt : ventilateurs arrêtés, registres fermés ; vanne de batterie chaude maintenue à 20 % si la température extérieure < 3 °C.`,
        `Antigel (${val(pc, /antigel/i, '5 °C')}) ou incendie (SSI) : priorité absolue, ventilateurs arrêtés, registres fermés, vanne chaude 100 % sur antigel.`]);
    }
    // Terminaux : ventilo-convecteurs, cassettes (vitesses, maître / esclave)
    const term = pilotes.filter(q => q.type === 'ventilo' || /ventilo|cassette/i.test(q.designation || ''));
    if (term.length) ajoute(`Terminaux (${term.length} : ${term.slice(0, 4).map(q => n(q.rep)).join(', ')}${term.length > 4 ? '…' : ''})`, [
      `Mode chaud / froid lu sur la température d'eau d'arrivée (chaud > ${co.chaud} °C, froid < ${co.froid} °C) ; sans circulation, vannes ouvertes 2 min toutes les heures pour relire le mode.`,
      ...((projet && projet.vitesses.length ? projet.vitesses : [{ zone: '', chaud: 20, froid: 24, decalage: 2, ouverture: 0.5, pv: 1, mv: 2 }]).map(v => `${v.zone ? `${v.zone} : ` : ''}consigne ${nfr(v.chaud)} °C en chaud, ${nfr(v.froid)} °C en froid, plus le décalage occupant (± ${nfr(v.decalage)} °C) ; vanne ouverte à consigne ∓ ${nfr(v.ouverture)} °C ; vitesse PV jusqu'à ${nfr(v.pv)} °C d'écart, MV jusqu'à ${nfr(v.mv)} °C, GV au-delà.`)),
      '2 min au moins entre deux changements de vitesse ; une seule vitesse à la fois (verrouillage câblé et logiciel) ; zone neutre entre chaud et froid.',
      'Vanne ouverte seulement ventilateur en marche ; en chaud, ventilation retardée tant que l\'eau < 30 °C ; post-ventilation 2 min à l\'arrêt.',
      'Plusieurs terminaux d\'une même pièce : maître / esclave, le thermostat du maître commande, les esclaves suivent (vitesse et vanne).',
      'Contact de fenêtre ouvert ou hors programme horaire : arrêt (ou réduit) ; alarme condensats : seule la vanne du terminal concerné se ferme.']);
    return out;
  }
  // Liste « À valider avant la saisie dans l'automate »
  function aValider(pilotes, { wit = false, gtb = '' } = {}) {
    const has = re => pilotes.some(q => re.test(`${q.type} ${q.designation || ''}`));
    return [
      wit ? 'Composition matérielle (UC, PLUG d\'E/S, embases, alimentations) validée avec Wit ou son distributeur.' : 'Composition matérielle de l\'automate (UC, cartes, alimentations) validée avec le fournisseur.',
      wit ? 'Applications types REDY (chaufferie, CTA, ventilo-convecteurs) demandées à l\'assistance technique Wit.' : '',
      has(/generateur|pac|chaudi/i) ? 'Générateurs : pilotage par contact + 0-10 V ou par bus Modbus / BACnet, échelle de la consigne relevée sur la notice.' : '',
      'Lois d\'eau, consignes et régimes d\'eau confirmés par le bureau d\'études.',
      has(/cta|ventilateur/i) ? 'Consignes de pression des CTA reprises du relevé d\'équilibrage ; scénario incendie validé avec le SSI.' : '',
      has(/\becs\b|ballon|bouclage/i) ? 'Exigences ECS et fréquence des montées en température conformes au carnet sanitaire.' : '',
      'Type de chaque sonde (PT1000, NTC, 0-10 V…) relevé et entrées configurées en conséquence.',
      'Plannings réels d\'occupation, jours fériés et vacances donnés par l\'exploitant.',
      gtb ? `Objets publiés vers la GTB (${gtb}) et adresses validés avec l'intégrateur.` : '',
      'Essais de chaque point (point à point) puis de chaque séquence, consignés dans les PV de mise en service.'].filter(Boolean);
  }

  /* ---------- Étiquettes de repérage de l'armoire (planches autocollantes ou étiqueteuse) ---------- */
  // cahier : cahier de programmation ; feuilles : feuilles du classeur (E-S, carnet de câbles, équipements)
  function etiquettes(cahier, feuilles) {
    const f = re => (feuilles || []).filter(x => re.test(x.name));
    const points = (cahier || []).flatMap(c => ((c.sections.find(s => s.titre === 'Entrées / sorties') || { lignes: [] }).lignes).map(l => ({ titre: l[0], sous: `${l[4]} · ${l[3]} · ${l[1]}` })));
    const bornes = f(/^E-S /).flatMap(x => x.lignes.filter(l => l[1]).map(l => ({ titre: String(l[1]), sous: `${l[2]} ${String(l[3]).split(' — ')[0]}` })));
    const cables = f(/^Carnet de câbles/).flatMap(x => x.lignes.map(l => ({ titre: String(l[1]), sous: `${l[4]} → ${l[5]}` })));
    const facade = f(/^Équipements/).flatMap(x => x.lignes.filter(l => /armoire|AR-/i.test(String(l[4] || ''))).map(l => ({ titre: String(l[0]), sous: String(l[1] || '').slice(0, 60) })));
    return { points, bornes, cables, facade };
  }
  /* ---------- Fichier EDE (Engineering Data Exchange, BACnet, version 2.3) pour l'intégrateur GTB ---------- */
  // Liste des objets de la table d'échange (type, instance, nom, unité BACnet, seuils, inscriptible) + fichier des textes d'états
  const TYPE_BACNET = { AI: 0, AO: 1, AV: 2, BI: 3, BO: 4, BV: 5, SCHEDULE: 17 };
  const UNITE_BACNET = { '°C': 62, '%': 98, '%HR': 29, Pa: 53, kPa: 54, bar: 55, 'm³/h': 135, ppm: 96, kW: 48, kWh: 19, W: 47, 'm³': 80 };
  function ede(lignes, { projet = 'Projet', auteur = 'Pipe-Fit', date = '' } = {}) {
    const etatsRef = [], refDe = t => { const k = etatsRef.indexOf(t); if (k >= 0) return k + 1; etatsRef.push(t); return etatsRef.length; };
    const cel = v => String(v ?? '').replace(/[;\r\n]+/g, ' ');
    const devices = [...new Map(lignes.map(l => [l[1], l[0]])).entries()];
    const tete = ['# Proposal_Engineering-Data-Exchange - B.I.G.-EU', `PROJECT_NAME;${cel(projet)}`, 'VERSION_OF_REFERENCEFILE;1', `TIMESTAMP_OF_LAST_CHANGE;${cel(date)}`, `AUTHOR_OF_LAST_CHANGE;${cel(auteur)}`, 'VERSION_OF_LAYOUT;2.3',
      '#mandatory;mandatory;mandatory;mandatory;mandatory;optional;optional;optional;optional;optional;optional;optional;optional;optional;optional;optional',
      '# keyname;device obj.-instance;object-name;object-type;object-instance;description;present-value-default;min-present-value;max-present-value;settable;supports COV;hi-limit;low-limit;state-text-reference;unit-code;vendor-specific-address'];
    const corps = [...devices.map(([dev, arm]) => [`DEV_${cel(arm)}`, dev, cel(arm), 8, dev, `Automate de l'armoire ${cel(arm)}`, '', '', '', '', '', '', '', '', '', ''].join(';')),
      ...lignes.map(l => {
        const t = TYPE_BACNET[l[6]], bin = [3, 4, 5].includes(t), p = [l[2], l[3], l[4], l[0], l[5], '', '', l[3]];
        const etat = bin ? etats(p).split(' / ').slice(0, 2) : null, ref = etat && etat.length === 2 ? refDe(etat.join(';')) : '';
        return [cel(l[12]), l[1], cel(l[12]), t ?? '', l[7], cel(`${l[2]} — ${l[3]}`), '', '', '', [1, 4, 2, 5, 17].includes(t) ? 'Y' : 'N', 'Y', cel(l[14]), cel(l[13]), ref, bin || t === 17 ? '' : (UNITE_BACNET[l[9]] ?? 95), cel(l[8])].join(';');
      })];
    const etatsTxt = ['#State Text Reference', '#Reference-Number;Inactive-Text;Active-Text', ...etatsRef.map((t, i) => `${i + 1};${t}`)];
    return { ede: [...tete, ...corps].join('\r\n'), etats: etatsTxt.join('\r\n'), objets: lignes.length, devices: devices.length };
  }
  // Que faire en cas d'alarme (notice d'exploitation) : d'après le libellé de l'alarme et l'action automatique
  function queFaire(alarme, action = '') {
    const t = `${alarme} ${action}`.toLowerCase();
    if (/sécurité|coupure câblée|gaz|arrêt d'urgence|manque d'eau/.test(t)) return 'Ne pas réarmer avant d\'avoir trouvé la cause ; mettre en sécurité, prévenir le mainteneur (et les secours si odeur de gaz).';
    if (/antigel/.test(t)) return 'Vérifier la production de chaleur, la vanne et la pompe de la batterie ; réarmer sur site une fois la batterie en température.';
    if (/incendie|ssi/.test(t)) return 'Laisser le scénario SSI se dérouler ; réarmement après levée de l\'alarme incendie et accord du responsable sécurité.';
    if (/générateur|chaudière|cascade/.test(t)) return 'Lire le code défaut sur le générateur, réarmer une fois ; si le défaut revient, appeler le mainteneur.';
    if (/pompe|secours/.test(t)) return 'Vérifier le disjoncteur moteur et le relais thermique, réarmer ; contrôler la pompe (bruit, blocage) ; prévenir le mainteneur si la pompe de secours est aussi en défaut.';
    if (/condensat/.test(t)) return 'Vérifier la pompe de relevage et l\'évacuation des condensats du terminal ; nettoyer le bac.';
    if (/filtre|encrass/.test(t)) return 'Remplacer les filtres de la CTA (type et dimensions sur la fiche de maintenance).';
    if (/ventilateur|cta/.test(t)) return 'Vérifier le variateur ou le disjoncteur du ventilateur et la courroie ; réarmer ; contrôler les registres.';
    if (/ecs|bouclage/.test(t)) return 'Vérifier la production ECS et la pompe de bouclage ; prévenir l\'exploitant (risque légionelle) et lancer une montée en température.';
    if (/ambiance|départ|soufflage|hors plage|trop bas|trop haut/.test(t)) return 'Vérifier le planning, les consignes et la vanne de régulation ; comparer la mesure avec un thermomètre de contrôle.';
    return 'Lire le défaut sur l\'équipement, réarmer une fois ; prévenir le mainteneur s\'il revient.';
  }

  /* ---------- Cahier de programmation de l'automate (Wit ou autre) ---------- */
  // Pour chaque armoire en automate : entrées / sorties, boucles de régulation (mesure, sortie, consigne, réglages par
  // défaut), commandes des moteurs (retour de marche, défaut, permutation des doubles), horloges, consignes et paramètres,
  // sécurités et asservissements, alarmes (priorité, temporisation, seuils), historiques et comptages, communication.
  // Colonnes communes : [Repère, Désignation, Entrée(s), Sortie(s), Réglages / consignes, Remarque]
  const ENTETES_CAHIER = ['Repère', 'Désignation', 'Entrée(s)', 'Sortie(s)', 'Réglages / consignes', 'Remarque'];
  const TEMPO = { 'P1 (sécurité)': '0 s', 'P2 (défaut)': '30 s', 'P3 (maintenance)': '5 min' };
  // ctx : { arm: [{ rep, techno, adresses, pts, eqs }], eqs, REG, echange, permutation, gtb, devices }
  // Action automatique d'une alarme (d'après l'équipement et la nature du défaut)
  function actionAlarme(lib, q, prio) {
    const t = `${lib} ${q.designation || ''}`;
    if (q.type === 'generateur' || q.type === 'pac') return 'générateur retiré de la cascade, le suivant prend le relais';
    if (/antigel/i.test(t)) return 'ventilateurs arrêtés, registres fermés, vanne batterie chaude 100 %';
    if (/incendie|ssi|dad/i.test(t)) return 'scénario SSI (arrêt ou désenfumage), prioritaire sur tout';
    if (q.type === 'securite' || q.regulation === 'securite' || SECU_EQ.test(q.designation || '') || /sécurité/.test(prio || '')) return 'coupure câblée en dur (chaîne de sécurité), report et réarmement sur site';
    if (/condensat/i.test(t)) return 'vanne du terminal concerné fermée';
    if (/encrass|filtre/i.test(t)) return '— (maintenance)';
    if (q.groupe) return 'bascule sur la pompe de secours du groupe';
    if (q.type === 'pompe' && /primaire/i.test(q.designation || '')) return 'générateur associé retiré de la cascade, alarme';
    if (q.type === 'pompe') return 'commande retombée, circuit en défaut (hors gel assuré par les autres circuits)';
    if (q.type === 'cta' || q.type === 'ventilateur') return 'arrêt de la CTA / du ventilateur, registres fermés';
    if (q.type === 'ventilo') return 'terminal arrêté, vanne fermée';
    return '—';
  }
  function cahier(ctx) {
    const REG = ctx.REG || { installations: [] }, perm = num(ctx.permutation, 168);
    // Désignation d'un équipement suivie du matériel retenu (fabricant + référence) s'il est connu
    const Rg = typeof Regulation !== 'undefined' ? Regulation : (() => { try { return require('./regulation'); } catch (e) { return null; } })();
    const desig = q => (Rg && REG.materiel ? Rg.avecMateriel(q.designation || q.rep, Rg.materielDe(REG.materiel, q)) : q.designation || q.rep);
    const nomInst = q => { const id = String(q.src || '').split(':')[0], x = REG.installations.find(y => y.noteId === id); return x ? x.titre : ''; };
    return (ctx.arm || []).filter(a => a.techno === 'automate').map(a => {
      const adr = (rep, type) => (a.adresses.find(x => x[2] === rep && (!type || x[4] === type)) || [])[0] || '';
      const adrs = (rep, type) => a.adresses.filter(x => x[2] === rep && x[4] === type).map(x => `${x[0]} (${String(x[3]).split(' — ')[0]})`).join(', ');
      const pilotes = (ctx.eqs || []).filter(q => q.pilote && q.pilote.rep === a.rep), sections = [];
      // Noms des points (préfixe d'installation), synthèse des E/S par installation avec 20 % de réserve
      const noms = nomsPoints(a.pts), nomDe = new Map(a.pts.map((p, i) => [`${p[0]}|${p[1]}|${p[2]}`, noms[i]])), ptDe = new Map(a.pts.map(p => [`${p[0]}|${p[1]}|${p[2]}`, p]));
      const nomRep = {}; a.pts.forEach((p, i) => { if (!nomRep[p[0]]) nomRep[p[0]] = `${installationPoint(p).prefixe}_${propre(p[0])}`; });
      const groupes = new Map();
      a.pts.forEach(p => { const k = installationPoint(p).nom, g = groupes.get(k) || { STOR: 0, ETOR: 0, SA: 0, EA: 0, Bus: 0 }; if (g[p[2]] !== undefined) g[p[2]]++; groupes.set(k, g); });
      const tot = { STOR: 0, ETOR: 0, SA: 0, EA: 0, Bus: 0 }; groupes.forEach(g => Object.keys(tot).forEach(k => { tot[k] += g[k]; }));
      const T5 = ['STOR', 'ETOR', 'SA', 'EA', 'Bus'];
      sections.push({ titre: 'Synthèse des entrées / sorties', entetes: ['Installation', 'Sorties TOR (DO)', 'Entrées TOR (DI)', 'Sorties 0-10 V (AO)', 'Entrées analogiques (AI)', 'Points bus'],
        intro: `${tot.STOR} DO, ${tot.ETOR} DI, ${tot.SA} AO et ${tot.EA} AI câblées${tot.Bus ? `, ${tot.Bus} point(s) bus` : ''} ; ${T5.slice(0, 4).map(k => Math.ceil(tot[k] * 1.2)).join(' / ')} avec 20 % de réserve. Préfixes : ${[...new Set(a.pts.map(p => `${installationPoint(p).prefixe}_ ${installationPoint(p).nom.toLowerCase()}`))].join(', ')}.`,
        lignes: [...[...groupes].filter(([, g]) => T5.some(t => g[t])).map(([k, g]) => [k, ...T5.map(t => String(g[t]))]), ['Total', ...T5.map(t => String(tot[t]))], ['Avec 20 % de réserve', ...T5.map(t => (t === 'Bus' ? '—' : String(Math.ceil(tot[t] * 1.2))))]] });
      // Entrées / sorties câblées : nom du point, unité / états, échelle à paramétrer
      const echelle = x => (x[4] === 'EA' ? (/temp|sonde|départ|retour|extérieur/i.test(x[3]) ? 'PT1000 ou 0-10 V, −50 à +150 °C' : '0-10 V / 4-20 mA, échelle selon le capteur') : x[4] === 'SA' ? '0-10 V = 0-100 %' : x[4] === 'ETOR' ? 'contact sec, 1 = défaut / marche' : x[4] === 'STOR' ? 'relais, 1 = marche / ouverture' : '');
      const es = a.adresses.filter(x => x[2] && x[2] !== '—' && ['EA', 'SA', 'ETOR', 'STOR'].includes(x[4])).map(x => { const k = `${x[2]}|${x[3]}|${x[4]}`, p = ptDe.get(k) || [x[2], x[3], x[4], a.rep, '', '', x[3], x[3], '', '']; return { x, p, nom: nomDe.get(k) || nomPoint(p) }; });
      const ordre = [...new Set(es.map(e => installationPoint(e.p).prefixe))];
      es.sort((u, v) => ordre.indexOf(installationPoint(u.p).prefixe) - ordre.indexOf(installationPoint(v.p).prefixe));
      sections.push({ titre: 'Entrées / sorties', entetes: ['Nom du point', 'Repère', 'Libellé', 'Type', 'Adresse · bornes', 'Unité / états', 'Signal / échelle', 'Remarque'],
        lignes: es.map(({ x, p, nom }) => [nom, x[2], x[3], TYPE_ES[x[4]] || x[4], `${x[0]} · ${x[1]}`, etats(p), echelle(x), x[5] || '']) });
      // Boucles de régulation
      const sondes = pilotes.filter(q => ['sonde'].includes(q.type) || q.regulation === 'sonde');
      const no = r => (/(\d+)$/.exec(String(r)) || [])[1];
      const params = id => (REG.installations.find(y => y.noteId === id) || {}).params || [];
      const boucles = [];
      pilotes.forEach(q => {
        const id = String(q.src || '').split(':')[0], circuit = String(q.designation || '').replace(/^(Vanne de régulation|Vanne)\s*/i, '').trim();
        if (['v3p', 'v010', 'v010r'].includes(q.regulation)) {
          const s = sondes.find(x => String(x.src || '').split(':')[0] === id && no(x.rep) && no(x.rep) === no(q.rep) && /^T/.test(x.rep)) || sondes.find(x => circuit && String(x.designation || '').includes(circuit));
          const p = params(id).filter(x => circuit && x.libelle.includes(circuit.split(' ')[0]) && /loi d'eau|consigne|pente|déplacement/i.test(x.libelle));
          boucles.push([`R-${q.rep}`, `Régulation ${circuit || q.rep}`, s ? `${s.rep} ${adr(s.rep, 'EA')}` : 'sonde à affecter', q.regulation === 'v3p' ? `${q.rep} ouverture ${adr(q.rep, 'STOR')} / fermeture (2e sortie)` : `${q.rep} ${adr(q.rep, 'SA')}`,
            `${p.length ? p.map(x => `${x.libelle.replace(/^Loi d'eau [^:]*: /, '')} ${String(x.valeur).replace('.', ',')} ${x.unite}`).join(' ; ') : 'consigne selon l\'analyse fonctionnelle'} ; PI : bande 20 K, intégrale 240 s`,
            q.regulation === 'v3p' ? 'action inverse ; temps de course du servomoteur à saisir (120 s usuel), sorties verrouillées entre elles' : `action inverse, limites 0-100 %${q.regulation === 'v010r' ? ', alarme d\'écart avec la recopie > 10 % pendant 5 min' : ''}`]);
        }
        if (q.regulation === 'var' || (q.depart === 'variateur' && q.regulation !== 'bus')) boucles.push([`R-${q.rep}`, `Vitesse ${q.designation || q.rep}`, q.type === 'pompe' ? 'pression différentielle (capteur à affecter) ou débit' : 'pression de gaine ou débit (capteur à affecter)', `${q.rep} ${adr(q.rep, 'SA')}`,
          q.type === 'pompe' ? 'consigne Δp selon le calcul du réseau ; PI : bande 50 kPa, intégrale 60 s' : 'consigne de pression selon l\'équilibrage ; PI : bande 100 Pa, intégrale 60 s', 'vitesse mini 30 %, rampe 30 s ; repli à vitesse fixe sur défaut capteur']);
        if (q.regulation === 'mod') boucles.push([`R-${q.rep}`, `Modulation ${q.designation || q.rep}`, 'température de départ production', `${q.rep} ${adr(q.rep, 'SA')}`, `consigne de départ : ${(params(id).find(x => /consigne de départ de la production/i.test(x.libelle)) || {}).valeur ?? 'loi d\'eau'} °C ; PI : bande 20 K, intégrale 240 s`, 'autorisation par la demande des circuits']);
      });
      // Réglages PID de départ selon l'organe (consignes du projet)
      if (ctx.projet) boucles.forEach(b => { const x = ctx.projet.pid.find(y => `R-${y[0]}` === b[0]); if (x) b[4] = b[4].replace(/(PI|PID)[^;]*(;|$)/, `PI : bande ${x[3]}, intégrale ${x[4]}${x[5] !== '—' ? `, temps de course ${x[5]}` : ''}$2`); });
      sections.push({ titre: 'Boucles de régulation', lignes: boucles });
      // Commandes des moteurs
      sections.push({ titre: 'Commandes des moteurs', lignes: pilotes.filter(q => q.moteur || q.type === 'generateur' || q.regulation === 'evGaz').filter(q => adr(q.rep, 'STOR')).map(q => [q.rep, desig(q),
        [adrs(q.rep, 'ETOR')].filter(Boolean).join(' ; ') || '—', adrs(q.rep, 'STOR'),
        q.groupe ? `${q.moteur2 ? 'secours' : 'principal'} du groupe ${q.groupe} : permutation toutes les ${perm} h de marche, basculement immédiat sur défaut ou absence de retour de marche (30 s)` : q.regulation === 'evGaz' ? 'ouverture si chaufferie autorisée et chaîne de sécurité fermée ; contrôle de fermeture 5 s' : 'retour de marche attendu sous 30 s ; anti-court-cycle 3 min ; dégommage hebdomadaire 30 s si arrêté',
        q.groupe ? 'commutateur M1 / M2 / Auto / Arrêt lu en entrée ; en M1 / M2 : marche forcée hors automate' : 'commutateur Manu / Auto / Arrêt : l\'automate ne commande qu\'en Auto']) });
      // Horloges et dérogations
      const inst = REG.installations.filter(x => !x.securite && pilotes.some(q => String(q.src || '').split(':')[0] === x.noteId));
      if (ctx.projet) {
        const pj = ctx.projet;
        sections.push({ titre: 'Plannings horaires', entetes: ['Planning', 'Agit sur', 'Occupation', 'Relance (h)', 'Hors occupation'], intro: `Jours fériés ${pj.feries[0][0].slice(0, 4)} (calendrier d'exception) : ${pj.feries.map(([d, l]) => `${d.slice(8, 10)}/${d.slice(5, 7)} ${l}`).join(', ')}. Dérogation locale ou GTB de 2 h.`,
          lignes: pj.plannings.map(p => [p.nom, p.agit, p.occupation, p.relance ? String(p.relance).replace('.', ',') : '—', p.hors]) });
      } else sections.push({ titre: 'Horloges et dérogations', lignes: inst.map((x, i) => [`H${i + 1}`, `Programme horaire — ${x.titre}`, 'calendrier, jours fériés', pilotes.filter(q => String(q.src || '').split(':')[0] === x.noteId && adr(q.rep, 'STOR')).map(q => q.rep).join(', ') || '—', 'occupation à saisir (par défaut lundi-vendredi 7 h-19 h), relance optimisée', 'dérogation locale ou GTB de 2 h ; réduit / hors gel hors occupation']) });
      // Consignes du projet (saisie) et réglages qui en découlent
      if (ctx.projet) {
        const pj = ctx.projet, f1 = v => String(Math.round(v * 10) / 10).replace('.', ',');
        sections.push({ titre: 'Consignes du projet (saisie)', entetes: ['Objet', 'Nom', 'Consignes', 'Occupation / régime', 'Origine'], lignes: pj.saisie });
        sections.push({ titre: 'Réglages déduits des consignes', entetes: ['Réglage', 'Valeur', 'Déduit de'], lignes: [
          ...(pj.production ? [['Consigne de départ de la production', `plus haute demande des circuits + 5 K, plafonnée à ${f1(pj.production.Td)} °C (${f1(pj.production.consigneBase)} °C par grand froid)`, 'lois d\'eau des circuits'],
            ...(pj.production.ecsMin ? [['Priorité ECS', `départ production ≥ ${f1(pj.production.ecsMin)} °C pendant la charge`, 'consigne de stockage ECS + 10 K (70 °C mini)']] : []),
            ...(pj.production.generateurs > 1 ? [['Cascade des générateurs', 'enclenchement si départ < consigne − 5 K pendant 10 min ; délestage si > consigne + 5 K pendant 5 min', 'consigne de départ']] : [])] : []),
          ['Change-over', `chaud si eau > ${pj.changeOver.chaud} °C, froid si < ${pj.changeOver.froid} °C`, pj.changeOver.source],
          ...pj.regimes.map(r => [`Réduit / hors gel / relance — ${r.quoi}`, `réduit ${f1(r.reduit)} K${/^Circuit/.test(r.quoi) ? ' (déplacement parallèle de la loi d\'eau)' : ''}, hors gel ${f1(r.horsGel)} °C, relance ${f1(r.relance)} h`, `consignes de la zone, inertie ${r.emetteur || 'de l\'émetteur'}`]),
          ...pj.vitesses.map(v => [`Vitesses des terminaux — ${v.zone}`, `PV jusqu'à ${f1(v.pv)} K d'écart, MV jusqu'à ${f1(v.mv)} K, GV au-delà ; vanne à ± ${f1(v.ouverture)} K ; décalage occupant ± ${f1(v.decalage)} K`, 'différentiel de la zone']),
          ...pj.pressionsCta.map(p => [`Pression de gaine — ${p.cta}`, p.soufflage !== null ? `soufflage ${p.soufflage} Pa${p.reprise !== null ? `, reprise ${p.reprise} Pa` : ''}` : 'à relever à la mise en service', p.soufflage !== null ? p.source : 'PV de mise en service de la CTA']),
          ...pj.seuils.map(x => [`Seuil d'alarme — ${x.libelle}`, `${x.bas !== '' ? `< ${f1(x.bas)} °C` : ''}${x.bas !== '' && x.haut !== '' ? ' ou ' : ''}${x.haut !== '' ? `> ${f1(x.haut)} °C` : ''}, ${x.tempo}`, x.cible === 'ambiance' ? 'consignes de la zone' : x.cible === 'circuit' ? 'loi d\'eau et régime du circuit' : x.cible === 'soufflage' ? 'consignes de soufflage de la CTA' : 'consigne ECS'])] });
      }
      // Consignes et paramètres
      sections.push({ titre: 'Consignes et paramètres', lignes: inst.flatMap(x => (x.params || []).map((p, k) => [`P${String(k + 1).padStart(2, '0')}`, `${x.titre} — ${p.libelle}`, '', '', `${String(p.valeur).replace('.', ',')} ${p.unite || ''}`.trim(), 'modifiable depuis la GTB (objet AV)'])) });
      // Sécurités et asservissements
      const secu = pilotes.filter(q => q.regulation === 'securite'), te = pilotes.find(q => /extérieur/i.test(q.designation || '') && (q.type === 'sonde' || q.regulation === 'sonde'));
      const pompes = pilotes.filter(q => q.type === 'pompe').map(q => q.rep), vent = pilotes.filter(q => ['cta', 'ventilateur'].includes(q.type)).map(q => q.rep);
      sections.push({ titre: 'Sécurités et asservissements', lignes: [
        ...(secu.length ? [['KA1', 'Chaîne de sécurité câblée', secu.map(q => `${q.rep} ${adr(q.rep, 'ETOR')}`).join(', '), 'coupure en dur (relais KA1), indépendante de l\'automate', 'lecture de chaque sécurité pour l\'alarme et l\'historique', 'réarmement manuel sur site']] : []),
        ...(te && pompes.length ? [['HG', 'Hors gel', `${te.rep} ${adr(te.rep, 'EA')}`, pompes.join(', '), 'marche des pompes si T ext. < 3 °C (hystérésis 1 K), vannes à 30 % mini', 'prioritaire sur l\'horloge']] : []),
        ...(vent.length ? [['SSI', 'Arrêt incendie', 'contact SSI (entrée TOR)', vent.join(', '), 'arrêt immédiat des CTA et ventilateurs concernés', 'prioritaire sur tous les modes, y compris Manu (câblé)']] : []),
        ...(pompes.length ? [['DG', 'Dégommage', '—', pompes.join(', '), 'marche 30 s chaque lundi 10 h si arrêtées depuis 7 jours', '']] : []),
        ['RS', 'Reprise secteur', 'retour tension', 'tous les départs', 'redémarrages échelonnés de 10 s', '']] });
      // Alarmes, historiques et comptages (table d'échange)
      const ech = (ctx.echange || []).filter(l => l[0] === a.rep);
      const nomEch = l => l[12] || `${l[2]}`, f2 = v => String(Math.round(v * 10) / 10).replace('.', ',');
      const derives = ctx.projet ? ctx.projet.seuils.filter(x => x.cible === 'ambiance' || x.cible === 'soufflage').map(x => [x.cible === 'ambiance' ? `ALM_AMB_${propre(x.zone).slice(0, 12)}` : `ALM_SOUF_${propre(x.cta).slice(0, 12)}`, x.libelle,
        `${x.bas !== '' ? `< ${f2(x.bas)} °C` : ''}${x.haut !== '' ? ` ou > ${f2(x.haut)} °C` : ''}`, x.tempo, x.prio, x.cible === 'soufflage' ? 'vanne batterie chaude 100 % si trop froid en hiver' : '—']) : [];
      sections.push({ titre: 'Alarmes', entetes: ['Nom du point', 'Alarme', 'Condition', 'Tempo', 'Priorité', 'Action automatique'], lignes: ech.filter(l => l[10]).map(l => {
        const q = pilotes.find(y => y.rep === l[2]) || (ctx.eqs || []).find(y => y.rep === l[2]) || {};
        const cond = l[13] || l[14] ? [l[13] ? `< ${l[13]} ${l[9] || ''}`.trim() : '', l[14] ? `> ${l[14]} ${l[9] || ''}`.trim() : ''].filter(Boolean).join(' ou ') : /^B/.test(l[6]) ? `= ${/sécurité/.test(l[10]) ? 'Alarme' : 'Défaut'}` : 'hors plage';
        return [nomEch(l), q.designation && !String(l[3]).includes(q.designation) ? `${l[3]} — ${q.designation}` : l[3], cond, /seuils|</.test(cond) && ctx.projet ? '30 min' : TEMPO[l[10]] || '30 s', l[10], actionAlarme(l[3], q, l[10])];
      }).concat(derives) });
      const lg = logique(pilotes, REG, { permutation: perm, noms: nomRep, projet: ctx.projet });
      if (lg.length) sections.push({ titre: 'Logique de fonctionnement pas à pas', entetes: ['Fonction', 'Étape', 'Logique'], lignes: lg });
      sections.push({ titre: 'Historiques et comptages', lignes: ech.filter(l => l[11]).map(l => [l[2], l[3], `${l[6]} ${l[7]}`, '', l[11], l[5] === 'TCP' ? 'conservation 5 ans (décret BACS)' : '']) });
      sections.push({ titre: 'Communication', lignes: [[`Device ${ech[0] ? ech[0][1] : '—'}`, `Automate de l'armoire ${a.rep}`, ctx.gtb || 'protocole GTB à définir', '', `${ech.length} objet(s) publiés (voir la table d'échange)`, ctx.nommage === 'armoire' ? 'nommage des objets : ARMOIRE_REPÈRE_FONCTION' : 'nommage des objets : INSTALLATION_REPÈRE_FONCTION (CH_, ECS_, CTA_…)'],
        ...pilotes.filter(q => q.regulation === 'bus').map(q => [q.rep, desig(q), q.protocole || 'Modbus RTU / BACnet', '', 'adresse esclave et vitesse à relever sur l\'équipement', `${a.pts.filter(p => p[0] === q.rep && p[2] === 'Bus').length} point(s) lus / écrits`])] });
      if (a.wit) sections.unshift({ titre: 'ULI Wit REDY : ressources et matériel', lignes: [
        ['UC', a.wit.uc[0], `${a.pts.length} point(s)`, '', `taille ${a.wit.taille[0]} : ${a.wit.taille[1]} ressources (${a.wit.ressources} estimées)`, 'ressource = point d\'information, point de pilotage ou processus (catalogue Wit)'],
        ...a.chassis.flatMap(c => c.modules.map(m => [`${c.nom}.${m.emplacement}`, `PLUG ${m.nom} (${m.ref})`, m.type === 'ETOR' || m.type === 'EA' ? `${m.utilisees}/${m.voies} voie(s)` : '', m.type === 'STOR' || m.type === 'SA' ? `${m.utilisees}/${m.voies} voie(s)` : m.type === 'Bus' ? `${m.utilisees} compteur(s)` : '', `embase ${c.embase[0]}`, m.lib || '']))] });
      sections.push({ titre: 'À valider avant la saisie dans l\'automate', entetes: ['Fait', 'À valider'], cases: true, lignes: aValider(pilotes, { wit: !!a.wit, gtb: ctx.gtb }).map(t => ['☐', t]) });
      return { armoire: a.rep, sections: sections.filter(x => x.lignes.length) };
    });
  }

  return { etiquettes, ede, queFaire, TYPE_BACNET, UNITE_BACNET, cahier, ENTETES_CAHIER, logique, aValider, actionAlarme, nomPoint, nomsPoints, etats, installationPoint, synoptique, exporter, bacs, echange, ENTETES_ECHANGE, csv, comptages, essais, essai, ENTETES_ESSAIS, sequences };
})();
if (typeof module !== 'undefined') module.exports = Gtb;
