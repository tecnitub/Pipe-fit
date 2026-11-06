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
  function echange(pts, armoires = [], reglages = []) {
    const regl = (reglages || []).filter(r => r && (String(r.rep || '').trim() || String(r.libelle || '').trim()));
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
      const x = { alarme, histo, bas: '', haut: '' };
      regl.filter(r => { const rr = String(r.rep || '').trim(), rl = String(r.libelle || '').trim().toLowerCase(); return (!rr || rr === '*' || rr === p[0] || String(p[0]).startsWith(`${rr}.`)) && (!rl || `${des} ${p[1]}`.toLowerCase().includes(rl)); })
        .forEach(r => { if (r.priorite) x.alarme = r.priorite === 'aucune' ? '' : r.priorite; if (r.historique) x.histo = r.historique; if (String(r.bas ?? '') !== '') x.bas = String(r.bas); if (String(r.haut ?? '') !== '') x.haut = String(r.haut); });
      return [ar, `${devices.get(ar)}`, p[0], des, p[2], p[4], obj, String(c.inst), `${mb[0]} ${mb[1]}${String(reg).padStart(4, '0')}`, unite, x.alarme, x.histo, nom, x.bas, x.haut];
    });
  }
  const ENTETES_ECHANGE = ['Armoire', 'Device BACnet', 'Repère', 'Libellé', 'E/S', 'Classe', 'Objet BACnet', 'Instance', 'Registre Modbus', 'Unité', 'Alarme', 'Historique', 'Nom d\'objet', 'Seuil bas', 'Seuil haut'];
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

  /* ---------- Cahier de programmation de l'automate (Wit ou autre) ---------- */
  // Pour chaque armoire en automate : entrées / sorties, boucles de régulation (mesure, sortie, consigne, réglages par
  // défaut), commandes des moteurs (retour de marche, défaut, permutation des doubles), horloges, consignes et paramètres,
  // sécurités et asservissements, alarmes (priorité, temporisation, seuils), historiques et comptages, communication.
  // Colonnes communes : [Repère, Désignation, Entrée(s), Sortie(s), Réglages / consignes, Remarque]
  const ENTETES_CAHIER = ['Repère', 'Désignation', 'Entrée(s)', 'Sortie(s)', 'Réglages / consignes', 'Remarque'];
  const TEMPO = { 'P1 (sécurité)': '0 s', 'P2 (défaut)': '30 s', 'P3 (maintenance)': '5 min' };
  // ctx : { arm: [{ rep, techno, adresses, pts, eqs }], eqs, REG, echange, permutation, gtb, devices }
  function cahier(ctx) {
    const REG = ctx.REG || { installations: [] }, perm = num(ctx.permutation, 168);
    const nomInst = q => { const id = String(q.src || '').split(':')[0], x = REG.installations.find(y => y.noteId === id); return x ? x.titre : ''; };
    return (ctx.arm || []).filter(a => a.techno === 'automate').map(a => {
      const adr = (rep, type) => (a.adresses.find(x => x[2] === rep && (!type || x[4] === type)) || [])[0] || '';
      const adrs = (rep, type) => a.adresses.filter(x => x[2] === rep && x[4] === type).map(x => `${x[0]} (${String(x[3]).split(' — ')[0]})`).join(', ');
      const pilotes = (ctx.eqs || []).filter(q => q.pilote && q.pilote.rep === a.rep), sections = [];
      // Entrées / sorties câblées (échelle à paramétrer)
      const echelle = x => (x[4] === 'EA' ? (/temp|sonde|départ|retour|extérieur/i.test(x[3]) ? 'PT1000 ou 0-10 V, −50 à +150 °C' : '0-10 V / 4-20 mA, échelle selon le capteur') : x[4] === 'SA' ? '0-10 V = 0-100 %' : x[4] === 'ETOR' ? 'contact sec, 1 = défaut / marche' : x[4] === 'STOR' ? 'relais, 1 = marche / ouverture' : '');
      sections.push({ titre: 'Entrées / sorties', lignes: a.adresses.filter(x => x[2] && x[2] !== '—' && ['EA', 'SA', 'ETOR', 'STOR'].includes(x[4])).map(x => [x[2], x[3], ['EA', 'ETOR'].includes(x[4]) ? `${x[0]} · ${x[1]}` : '', ['SA', 'STOR'].includes(x[4]) ? `${x[0]} · ${x[1]}` : '', echelle(x), x[5] || '']) });
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
      sections.push({ titre: 'Boucles de régulation', lignes: boucles });
      // Commandes des moteurs
      sections.push({ titre: 'Commandes des moteurs', lignes: pilotes.filter(q => q.moteur || q.type === 'generateur' || q.regulation === 'evGaz').filter(q => adr(q.rep, 'STOR')).map(q => [q.rep, q.designation || q.rep,
        [adrs(q.rep, 'ETOR')].filter(Boolean).join(' ; ') || '—', adrs(q.rep, 'STOR'),
        q.groupe ? `${q.moteur2 ? 'secours' : 'principal'} du groupe ${q.groupe} : permutation toutes les ${perm} h de marche, basculement immédiat sur défaut ou absence de retour de marche (30 s)` : q.regulation === 'evGaz' ? 'ouverture si chaufferie autorisée et chaîne de sécurité fermée ; contrôle de fermeture 5 s' : 'retour de marche attendu sous 30 s ; anti-court-cycle 3 min ; dégommage hebdomadaire 30 s si arrêté',
        q.groupe ? 'commutateur M1 / M2 / Auto / Arrêt lu en entrée ; en M1 / M2 : marche forcée hors automate' : 'commutateur Manu / Auto / Arrêt : l\'automate ne commande qu\'en Auto']) });
      // Horloges et dérogations
      const inst = REG.installations.filter(x => !x.securite && pilotes.some(q => String(q.src || '').split(':')[0] === x.noteId));
      sections.push({ titre: 'Horloges et dérogations', lignes: inst.map((x, i) => [`H${i + 1}`, `Programme horaire — ${x.titre}`, 'calendrier, jours fériés', pilotes.filter(q => String(q.src || '').split(':')[0] === x.noteId && adr(q.rep, 'STOR')).map(q => q.rep).join(', ') || '—', 'occupation à saisir (par défaut lundi-vendredi 7 h-19 h), relance optimisée', 'dérogation locale ou GTB de 2 h ; réduit / hors gel hors occupation']) });
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
      sections.push({ titre: 'Alarmes', lignes: ech.filter(l => l[10]).map(l => [l[2], l[3], l[8] ? `${l[6]} ${l[7]} · ${l[8]}` : l[6], '', `priorité ${l[10]}, temporisation ${TEMPO[l[10]] || '30 s'}${l[13] || l[14] ? `, seuils ${l[13] || '—'} / ${l[14] || '—'} ${l[9] || ''}` : ''}`, 'acquittement depuis la GTB ; report défaut général']) });
      sections.push({ titre: 'Historiques et comptages', lignes: ech.filter(l => l[11]).map(l => [l[2], l[3], `${l[6]} ${l[7]}`, '', l[11], l[5] === 'TCP' ? 'conservation 5 ans (décret BACS)' : '']) });
      sections.push({ titre: 'Communication', lignes: [[`Device ${ech[0] ? ech[0][1] : '—'}`, `Automate de l'armoire ${a.rep}`, ctx.gtb || 'protocole GTB à définir', '', `${ech.length} objet(s) publiés (voir la table d'échange)`, 'nommage des objets : ARMOIRE_REPÈRE_FONCTION'],
        ...pilotes.filter(q => q.regulation === 'bus').map(q => [q.rep, q.designation || q.rep, q.protocole || 'Modbus RTU / BACnet', '', 'adresse esclave et vitesse à relever sur l\'équipement', `${a.pts.filter(p => p[0] === q.rep && p[2] === 'Bus').length} point(s) lus / écrits`])] });
      return { armoire: a.rep, sections: sections.filter(x => x.lignes.length) };
    });
  }

  return { cahier, ENTETES_CAHIER, synoptique, exporter, bacs, echange, ENTETES_ECHANGE, csv, comptages, essais, essai, ENTETES_ESSAIS, sequences };
})();
if (typeof module !== 'undefined') module.exports = Gtb;
