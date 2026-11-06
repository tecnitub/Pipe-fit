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
  function echange(pts, armoires = []) {
    const devices = new Map(armoires.map((a, i) => [a, 1000 + i + 1])), cpt = {};
    return pts.map(p => {
      const ar = p[3], des = p[7] || p[1], obj = objetDe(p[2], p[4], des), k = `${ar}|${obj}`, mb = MODBUS[obj];
      if (!devices.has(ar)) devices.set(ar, 1000 + devices.size + 1);
      const c = cpt[k] || (cpt[k] = { inst: 0, reg: 0 }); c.inst += 1; const reg = c.reg; c.reg += mb[2];
      const binaire = ['BI', 'BO', 'BV'].includes(obj), unite = binaire ? 'état' : obj === 'SCHEDULE' ? '—' : ((UNITES.find(([re]) => re.test(des)) || [, ''])[1]);
      const mn = (ABR.find(([re]) => re.test(des)) || [, String(des).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8)])[1];
      const nom = `${ar}_${p[0]}_${mn}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '').replace(/\./g, '_').toUpperCase();
      const alarme = p[4] === 'TA' ? ((SECU.test(des) || SECU_EQ.test(p[6] || '')) ? 'P1 (sécurité)' : 'P2 (défaut)') : /encrassement|filtre/i.test(des) ? 'P3 (maintenance)' : '';
      const histo = ['TM', 'TCP'].includes(p[4]) ? (p[4] === 'TCP' ? 'horaire + mensuel (5 ans)' : '15 min') : ['TS', 'TC', 'TA'].includes(p[4]) ? 'sur changement' : '';
      return [ar, `${devices.get(ar)}`, p[0], des, p[2], p[4], obj, String(c.inst), `${mb[0]} ${mb[1]}${String(reg).padStart(4, '0')}`, unite, alarme, histo, nom];
    });
  }
  const ENTETES_ECHANGE = ['Armoire', 'Device BACnet', 'Repère', 'Libellé', 'E/S', 'Classe', 'Objet BACnet', 'Instance', 'Registre Modbus', 'Unité', 'Alarme', 'Historique', 'Nom d\'objet'];
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

  return { bacs, echange, ENTETES_ECHANGE, csv, comptages, essais, essai, ENTETES_ESSAIS, sequences };
})();
if (typeof module !== 'undefined') module.exports = Gtb;
