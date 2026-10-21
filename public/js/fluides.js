// Fluides frigorigènes : registre des équipements des clients, fiches d'intervention (rubriques du Cerfa n° 15497),
// contrôles d'étanchéité périodiques, bouteilles, bilan annuel des quantités chargées et récupérées.
// Règles : règlement (UE) 2024/573 « F-Gas » (seuils en tonnes équivalent CO2) et Code de l'environnement
// (art. R543-75 et suivants) ; pour les HCFC (R22…), seuils historiques en kg. Les valeurs proposées restent
// à vérifier par l'opérateur : la fiche signée fait foi.
// Module commun navigateur / serveur (notifications) / démo / tests.
const Fluides = (() => {
  // [fluide, PRG (pouvoir de réchauffement global, valeurs du règlement), famille]
  const LISTE = [
    ['R32', 675, 'HFC'], ['R410A', 2088, 'HFC'], ['R407C', 1774, 'HFC'], ['R134a', 1430, 'HFC'], ['R404A', 3922, 'HFC'], ['R507A', 3985, 'HFC'],
    ['R407F', 1825, 'HFC'], ['R448A', 1387, 'HFC'], ['R449A', 1397, 'HFC'], ['R452A', 2140, 'HFC'], ['R454B', 466, 'HFC'], ['R454C', 148, 'HFC'],
    ['R513A', 631, 'HFC'], ['R417A', 2346, 'HFC'], ['R422D', 2729, 'HFC'], ['R427A', 2138, 'HFC'], ['R437A', 1805, 'HFC'],
    ['R1234yf', 4, 'HFO'], ['R1234ze', 7, 'HFO'], ['R1233zd', 1, 'HFO'],
    ['R22', 1810, 'HCFC'],
    ['R290 (propane)', 3, 'naturel'], ['R600a (isobutane)', 3, 'naturel'], ['R744 (CO2)', 1, 'naturel'], ['R717 (ammoniac)', 0, 'naturel'],
  ];
  const info = f => LISTE.find(x => x[0] === f) || null;
  const prg = f => (info(f) || [f, 0])[1];
  const famille = f => (info(f) || [f, 0, 'HFC'])[2];
  const r2 = v => Math.round(v * 100) / 100;
  // Tonnes équivalent CO2 = charge (kg) × PRG / 1000
  const teqCO2 = (f, chargeKg) => r2((Number(chargeKg) || 0) * prg(f) / 1000);

  // Périodicité du contrôle d'étanchéité, en mois (0 = pas de contrôle périodique obligatoire)
  function periodicite(eq) {
    const charge = Number(eq.charge) || 0, det = !!eq.detectionPermanente;
    if (famille(eq.fluide) === 'naturel') return 0;
    if (famille(eq.fluide) === 'HCFC') { // seuils en kg
      if (charge < 2) return 0;
      return charge >= 300 ? (det ? 6 : 3) : charge >= 30 ? (det ? 12 : 6) : 12;
    }
    const t = teqCO2(eq.fluide, charge);
    if (t < (eq.hermetique ? 10 : 5)) return 0;
    return t >= 500 ? (det ? 6 : 3) : t >= 50 ? (det ? 12 : 6) : (det ? 24 : 12);
  }
  // Système de détection des fuites obligatoire à partir de 500 t éq. CO2 (300 kg pour les HCFC)
  const detectionObligatoire = eq => (famille(eq.fluide) === 'HCFC' ? (Number(eq.charge) || 0) >= 300 : teqCO2(eq.fluide, eq.charge) >= 500);

  const NATURES = [['assemblage', 'Assemblage de l\'équipement'], ['miseEnService', 'Mise en service'], ['modification', 'Modification de l\'équipement'], ['maintenance', 'Maintenance'],
    ['controlePeriodique', 'Contrôle d\'étanchéité périodique'], ['controleNonPeriodique', 'Contrôle d\'étanchéité non périodique'], ['demantelement', 'Démantèlement'], ['autre', 'Autre']];
  const libelleNature = k => (NATURES.find(n => n[0] === k) || [k, k])[1];
  // Natures qui valent contrôle d'étanchéité
  const CONTROLE = ['controlePeriodique', 'controleNonPeriodique', 'miseEnService', 'maintenance'];

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plusMois = (s, n) => { const d = new Date(`${s}T12:00:00`), j = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };

  // Prochain contrôle : dernier contrôle + périodicité ; fuite réparée : contrôle de suivi sous un mois
  function prochainControle(eq, fiches) {
    if (eq.archive || eq.demantele) return null;
    const p = periodicite(eq);
    const siennes = fiches.filter(f => f.equipementId === eq.id && f.statut !== 'Brouillon').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const derniere = siennes.find(f => CONTROLE.includes(f.nature));
    if (siennes[0] && siennes[0].nature === 'demantelement') return null;
    const suivi = siennes.find(f => (f.fuites || []).some(x => x.reparee));
    const dates = [];
    if (p) dates.push(derniere ? plusMois(derniere.date, p) : (eq.miseEnService ? plusMois(eq.miseEnService, p) : iso(new Date())));
    if (suivi && (!derniere || derniere.date <= suivi.date)) dates.push(plusMois(suivi.date, 1));
    if (!dates.length) return null;
    return { date: dates.sort()[0], suiviFuite: dates.length > 1 && dates.sort()[0] === plusMois(suivi.date, 1), dernier: derniere ? derniere.date : '', periodicite: p };
  }

  // Masse de fluide dans une bouteille : masse au départ + récupérations - charges
  function masseBouteille(b, fiches) {
    let m = Number(b.masseInitiale) || 0;
    fiches.filter(f => f.statut !== 'Brouillon').forEach(f => {
      if (f.bouteilleCharge === b.id) m -= (Number(f.chargeVierge) || 0) + (Number(f.chargeRecycle) || 0) + (Number(f.chargeRegenere) || 0);
      if (f.bouteilleRecup === b.id) m += (Number(f.recupTraitement) || 0) + (Number(f.recupReutilisation) || 0);
    });
    return r2(m);
  }

  // Contrôle d'une fiche avant envoi (null si correcte)
  function erreur(f, eq) {
    if (!f.equipementId || !eq) return 'Choisissez l\'équipement';
    if (!f.date) return 'Indiquez la date de l\'intervention';
    if (!NATURES.some(n => n[0] === f.nature)) return 'Choisissez la nature de l\'intervention';
    const q = ['chargeVierge', 'chargeRecycle', 'chargeRegenere', 'recupTraitement', 'recupReutilisation'];
    if (q.some(k => f[k] !== undefined && f[k] !== '' && !(Number(f[k]) >= 0))) return 'Quantités : nombres positifs en kg';
    const charge = q.slice(0, 3).reduce((t, k) => t + (Number(f[k]) || 0), 0), recup = q.slice(3).reduce((t, k) => t + (Number(f[k]) || 0), 0);
    if (charge > 0 && famille(eq.fluide) === 'HCFC') return 'Recharge interdite en HCFC (R22…) : seule la récupération est possible';
    if (charge > 0 && !f.bouteilleCharge) return 'Indiquez la bouteille utilisée pour la charge';
    if (recup > 0 && !f.bouteilleRecup) return 'Indiquez la bouteille de récupération';
    if ((f.fuites || []).some(x => !String(x.localisation || '').trim())) return 'Indiquez la localisation de chaque fuite';
    if (CONTROLE.includes(f.nature) && f.nature !== 'maintenance' && !f.detecteur) return 'Indiquez le détecteur de fuites utilisé';
    return null;
  }

  // Bilan d'une année par fluide (déclaration à l'organisme agréé, suivi interne)
  function bilan(fiches, equipements, annee) {
    const out = new Map();
    fiches.filter(f => f.statut !== 'Brouillon' && String(f.date || '').startsWith(String(annee))).forEach(f => {
      const eq = equipements.find(e => e.id === f.equipementId);
      const fl = (eq && eq.fluide) || '?';
      const x = out.get(fl) || { fluide: fl, interventions: 0, fuites: 0, chargeVierge: 0, chargeRecycle: 0, chargeRegenere: 0, recupTraitement: 0, recupReutilisation: 0 };
      x.interventions++; x.fuites += (f.fuites || []).length;
      ['chargeVierge', 'chargeRecycle', 'chargeRegenere', 'recupTraitement', 'recupReutilisation'].forEach(k => { x[k] = r2(x[k] + (Number(f[k]) || 0)); });
      out.set(fl, x);
    });
    return [...out.values()].map(x => ({ ...x, charge: r2(x.chargeVierge + x.chargeRecycle + x.chargeRegenere), recupere: r2(x.recupTraitement + x.recupReutilisation),
      teqCharge: teqCO2(x.fluide, x.chargeVierge + x.chargeRecycle + x.chargeRegenere) })).sort((a, b) => a.fluide.localeCompare(b.fluide));
  }

  // Plaque signalétique (texte lu sur la photo) : fluide, charge, marque, modèle, n° de série
  const MARQUES = ['Daikin', 'Mitsubishi Electric', 'Mitsubishi Heavy Industries', 'Mitsubishi', 'Toshiba', 'Panasonic', 'LG', 'Samsung', 'Fujitsu', 'Atlantic', 'Hitachi', 'Carrier', 'Trane', 'Lennox',
    'Airwell', 'CIAT', 'Clivet', 'Aermec', 'Systemair', 'Climaveneta', 'Gree', 'Midea', 'Haier', 'Hisense', 'Viessmann', 'De Dietrich', 'Bosch', 'Vaillant', 'Saunier Duval', 'Thermor', 'York', 'Johnson Controls',
    'Zanotti', 'Tecumseh', 'Bitzer', 'Copeland', 'Sanyo', 'Riello', 'Swegon', 'Blue Star', 'Profroid', 'Hiref', 'Mitsubishi'];
  function lirePlaque(lignes) {
    const t = (lignes || []).map(l => String(l || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const out = { fluide: '', charge: '', marque: '', modele: '', numeroSerie: '' };
    const code = f => f.split(' ')[0].toUpperCase().replace('-', '');
    const kg = l => { const m = /(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(l); return m ? Number(m[1].replace(',', '.')) : null; };
    let ligneFluide = -1;
    t.forEach((l, i) => {
      if (!out.fluide) {
        const m = /\bR\s?-?\s?(\d{2,4}[A-Z]{0,2}(?:yf|ze|zd)?)\b/i.exec(l);
        if (m) { const c = `R${m[1]}`.toUpperCase(), f = LISTE.find(x => code(x[0]) === c); if (f) { out.fluide = f[0]; ligneFluide = i; } }
      }
      if (!out.modele) { const m = /(?:mod[eè]le|model(?:\s*name)?|type|mod\.)\s*(?:n[°o])?\s*[:.]?\s*([A-Z0-9][\w\-/.]{2,})/i.exec(l); if (m && !/^(R\d|kg)/i.test(m[1])) out.modele = m[1]; }
      if (!out.numeroSerie) { const m = /(?:s\/n|serial(?:\s*(?:no\.?|number|n[°o]))?|n[°o]\s*(?:de\s*)?s[ée]rie|num[ée]ro\s*de\s*s[ée]rie|ser\.?\s*no\.?|fabr\.?\s*n[°o])\s*[:.]?\s*([A-Z0-9][\w\-/]{3,})/i.exec(l); if (m) out.numeroSerie = m[1]; }
      if (!out.marque) { const lo = l.toLowerCase(); const mq = MARQUES.find(b => new RegExp(`\\b${b.toLowerCase().replace(/ /g, '\\s')}\\b`).test(lo)); if (mq) out.marque = mq; }
    });
    // Charge : kg sur la ligne du fluide ou juste après, sinon ligne « charge / quantité / amount »
    const autour = ligneFluide >= 0 ? [t[ligneFluide], t[ligneFluide + 1] || ''] : [];
    const c = autour.map(kg).find(x => x !== null) ?? t.filter(l => /charge|quantit|amount|f[uü]llmenge|refrig/i.test(l)).map(kg).find(x => x !== null);
    if (c !== null && c !== undefined && c > 0 && c < 5000) out.charge = c;
    return out;
  }

  return { LISTE, info, prg, famille, teqCO2, periodicite, detectionObligatoire, NATURES, libelleNature, CONTROLE, prochainControle, masseBouteille, erreur, bilan, plusMois, lirePlaque };
})();
if (typeof module !== 'undefined') module.exports = Fluides;
