// Comptages de la GTC → bilan réel : import des relevés de compteurs (CSV / Excel : date, compteur ou repère, index ou
// consommation), rapprochement avec les compteurs prévus par l'étude (points de comptage des armoires de régulation,
// compteur d'appoint du traitement d'eau), comparaison au calcul « Énergie annuelle » (prévu / réel par usage, écart),
// détection de dérive (consommation d'une période au-dessus des précédentes) et de fuite d'eau (appoint anormal au
// compteur CPT-APP). Module pur (navigateur, node, tests).
const Comptages = (() => {
  const n = v => { if (v === '' || v === null || v === undefined) return null; const x = Number(String(v).replace(/\s| | /g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
  const r = (v, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
  const txt = (v, k = 120) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const JOUR = 864e5;
  const USAGES = { chauffage: 'Chauffage', froid: 'Refroidissement', ecs: 'Eau chaude sanitaire', gaz: 'Gaz (chauffage, ECS)', production: 'Électricité de la production', auxiliaires: 'Auxiliaires (pompes)',
    ventilation: 'Ventilation', eauEcs: 'Eau froide de l\'ECS', appoint: 'Eau d\'appoint du réseau', electricite: 'Électricité', autre: 'Autre' };
  // Usage d'un compteur d'après son repère (compteurs posés par la GTC de l'étude) ou sa désignation
  function usageDe(rep, designation = '') {
    const k = cle(rep), d = norm(designation);
    if (/^CPTAPP/.test(k) || /appoint/.test(d)) return 'appoint';
    if (/^CETCH/.test(k) || (/thermique/.test(d) && /chauff/.test(d))) return 'chauffage';
    if (/^CETFR/.test(k) || (/thermique/.test(d) && /(froid|refroid)/.test(d))) return 'froid';
    if (/^CETECS/.test(k) || (/thermique/.test(d) && /(ecs|sanitaire)/.test(d))) return 'ecs';
    if (/^CEECS/.test(k) || (/eau froide/.test(d) && /ecs/.test(d))) return 'eauEcs';
    if (/^CPTGAZ/.test(k) || /gaz/.test(d)) return 'gaz';
    if (/^CPTEPROD/.test(k) || /production/.test(d)) return 'production';
    if (/^CPTEAUX/.test(k) || /auxiliaire|pompe/.test(d)) return 'auxiliaires';
    if (/^CPTEVENT/.test(k) || /ventilation|cta/.test(d)) return 'ventilation';
    if (/^CPTE/.test(k) || /electri/.test(d)) return 'electricite';
    return 'autre';
  }
  const uniteDe = usage => (['appoint', 'eauEcs'].includes(usage) ? 'm³' : usage === 'gaz' ? 'm³' : 'kWh');

  /* ---------- Lecture des relevés ---------- */
  // Texte CSV (« ; », « , » ou tabulation, guillemets) → lignes
  function lireCsv(texte) {
    const t = String(texte || '').replace(/^﻿/, ''), l1 = t.split(/\r?\n/)[0] || '';
    const sep = ['\t', ';', ','].map(s => [s, l1.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
      if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(x => x.some(v => String(v).trim() !== ''));
  }
  // Date : jj/mm/aaaa (heure ignorée), aaaa-mm-jj, numéro de série Excel
  function date(v) {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const x = n(v);
    if (x !== null && x > 20000 && x < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(x) * JOUR).toISOString().slice(0, 10);
    const s = String(v || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s); if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }
  // Lignes d'un tableau → { releves: [{ date, compteur, index, conso, unite }], erreurs } ; en-têtes reconnus, sinon
  // colonnes date ; compteur ; valeur (index)
  function lire(rows) {
    const t = (rows || []).map(x => (x || []).map(c => (c === null || c === undefined ? '' : c))).filter(x => x.some(c => String(c).trim() !== ''));
    if (!t.length) return { releves: [], erreurs: ['Fichier vide'] };
    const h = t[0].map(c => norm(c)), col = re => h.findIndex(c => re.test(c));
    let iD = col(/date|jour|horodat/), iC = col(/compteur|repere|point|cpt|nom/), iI = col(/index|cumul/), iV = col(/consommation|conso|volume|energie|quantite|valeur/), iU = col(/unite/);
    const entete = iD >= 0 && iC >= 0 && (iI >= 0 || iV >= 0);
    if (!entete) { iD = 0; iC = 1; iI = 2; iV = -1; iU = 3 < t[0].length ? 3 : -1; }
    const out = [], erreurs = [];
    (entete ? t.slice(1) : t).forEach((x, k) => {
      const d = date(x[iD]), c = txt(x[iC], 60), i = iI >= 0 ? n(x[iI]) : null, v = iV >= 0 ? n(x[iV]) : null;
      if (!d || !c || (i === null && v === null)) { if (k || entete) erreurs.push(`Ligne ${k + (entete ? 2 : 1)} ignorée (date, compteur ou valeur manquant)`); return; }
      out.push({ date: d, compteur: c, ...(i !== null ? { index: i } : {}), ...(v !== null ? { conso: v } : {}), unite: iU >= 0 ? txt(x[iU], 10) : '' });
    });
    return { releves: out.sort((a, b) => a.compteur.localeCompare(b.compteur) || a.date.localeCompare(b.date)), erreurs: erreurs.slice(0, 20) };
  }

  /* ---------- Compteurs prévus par l'étude ---------- */
  // Points de comptage des armoires (calcul « Armoire CVC et régulation » : listePoints, source « comptage: »), compteur
  // d'appoint du traitement d'eau ; [{ rep, designation, usage, unite }]
  function prevus(et, L) {
    const out = new Map(), add = (rep, designation) => { const k = cle(rep); if (!k || out.has(k)) return; const u = usageDe(rep, designation); out.set(k, { rep: txt(rep, 40), designation: txt(designation, 160), usage: u, unite: uniteDe(u) }); };
    ((et && et.notes) || []).forEach(note => {
      if (note.type === 'elec') ((essai(() => L.calculer(et, note).valeurs) || {}).listePoints || []).forEach(p => {
        const rep = String(p[0] || '').replace(/\.\d+$/, ''), src = String(p[8] || '');
        if (/^comptage:/.test(src) || p[4] === 'TCP' || /^(CPT|CET|CE)-/.test(rep)) add(/^comptage:/.test(src) ? src.slice(9) : rep, String(p[6] || p[1] || '').replace(/^[^—]*— /, ''));
      });
      if (note.type === 'traitementEau') add('CPT-APP', 'Compteur d\'eau d\'appoint du réseau');
    });
    return [...out.values()];
  }
  // Données des calculs utiles au bilan : prévu « Énergie annuelle », volume du réseau et seuil d'appoint (traitement d'eau)
  function contexte(et, L) {
    const AE = essai(() => (typeof AnnexesEnergie !== 'undefined' ? AnnexesEnergie : require('./annexes-energie')));
    const notes = (et && et.notes) || [], ne = notes.find(x => x.type === 'energieAnnuelle'), nt = notes.find(x => x.type === 'traitementEau');
    const ve = ne ? essai(() => L.calculer(et, ne).valeurs) : null, vt = nt ? essai(() => L.calculer(et, nt).valeurs) : null, et2 = nt ? essai(() => L.resoudre(et, nt).entrees) || nt.entrees || {} : {};
    return { energie: ve && AE ? AE.prevuParUsage(ve) : null, noteEnergie: ne ? ne.titre || 'Énergie annuelle' : '', volumeReseau: vt && vt.V > 0 ? vt.V : null, appointPct: n(et2.appoint) ?? 5 };
  }
  // Relevés face aux compteurs prévus
  function rapprocher(releves, prev) {
    const par = new Map((prev || []).map(p => [cle(p.rep), p])), noms = [...new Set((releves || []).map(x => x.compteur))];
    const lies = [], inconnus = [];
    noms.forEach(c => { const p = par.get(cle(c)) || [...par.values()].find(x => cle(c).includes(cle(x.rep)) && cle(x.rep).length >= 5); (p ? lies : inconnus).push(p ? { compteur: c, ...p, releves: releves.filter(x => x.compteur === c).length } : { compteur: c, usage: usageDe(c), releves: releves.filter(x => x.compteur === c).length }); });
    const absents = (prev || []).filter(p => !lies.some(l => cle(l.rep) === cle(p.rep)));
    return { lies, inconnus, absents };
  }
  // Consommations par période d'un compteur : différences d'index (remise à zéro ou changement de compteur signalé), ou
  // consommations relevées ; [{ du, au, jours, conso }]
  function periodes(liste) {
    const l = (liste || []).slice().sort((a, b) => a.date.localeCompare(b.date)), out = [], anomalies = [];
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], jours = Math.round((Date.parse(b.date) - Date.parse(a.date)) / JOUR);
      if (!(jours > 0)) continue;
      let c = null;
      if (a.index !== undefined && b.index !== undefined) { c = b.index - a.index; if (c < 0) { anomalies.push(`${b.compteur} : index en baisse le ${b.date} (remise à zéro ou changement de compteur), période ignorée`); continue; } }
      else if (b.conso !== undefined) c = b.conso;
      if (c !== null) out.push({ du: a.date, au: b.date, jours, conso: c });
    }
    // Consommations relevées sans index : la première ligne compte aussi (période inconnue : 1 jour avant)
    if (l.length && l[0].index === undefined && l[0].conso !== undefined && !(l.length > 1 && l[1].index !== undefined)) out.unshift({ du: l[0].date, au: l[0].date, jours: l.length > 1 ? Math.max(1, Math.round((Date.parse(l[1].date) - Date.parse(l[0].date)) / JOUR)) : 30, conso: l[0].conso, estime: true });
    return { periodes: out, anomalies };
  }
  const versM3 = (v, unite) => (/^l$|litre/i.test(String(unite || '').trim()) ? v / 1000 : v);
  const versKwh = (v, unite, coefGaz) => (/m3|m³/i.test(String(unite || '')) ? v * coefGaz : /mwh/i.test(String(unite || '')) ? v * 1000 : v);

  // Bilan réel : prévu / réel par usage, dérives, fuites. opts : { tolerance (%), djuReel, coefGaz (kWh PCS/m³) }
  function bilan({ releves = [], prevus: prev = [], ctx = {}, tolerance = 15, djuReel = null, coefGaz = 11.2 } = {}) {
    const tol = n(tolerance) > 0 ? n(tolerance) : 15, rap = rapprocher(releves, prev), E = ctx.energie, alertes = [], parUsage = [], derives = [], fuites = [], anomalies = [];
    const compteurs = [...rap.lies, ...rap.inconnus];
    compteurs.forEach(c => {
      const ls = releves.filter(x => x.compteur === c.compteur), pr = periodes(ls), unite = (ls.find(x => x.unite) || {}).unite || c.unite || uniteDe(c.usage);
      anomalies.push(...pr.anomalies);
      const P = pr.periodes; if (!P.length) return;
      const jours = P.reduce((a, p) => a + p.jours, 0), total = P.reduce((a, p) => a + p.conso, 0);
      // Prévu sur la période (prorata des jours ; chauffage corrigé des DJU réels si donnés)
      let prevu = null, base = '';
      const an = jours / 365, dju = E && E.DJU > 0 && n(djuReel) > 0 ? n(djuReel) / E.DJU : an;
      if (E) {
        const gaz = E.energie === 'gaz', elec = E.energie === 'elec';
        if (c.usage === 'chauffage') { prevu = E.besoins.chauffage * dju; base = 'besoin de chauffage (énergie utile)'; }
        if (c.usage === 'froid') { prevu = E.besoins.froid * an; base = 'besoin de froid (énergie utile)'; }
        if (c.usage === 'ecs') { prevu = E.besoins.ecs * an; base = 'besoin d\'ECS (énergie utile)'; }
        if (c.usage === 'gaz' && gaz) { prevu = E.consommations.chauffage * dju + E.consommations.ecs * an; base = `consommation de gaz de « ${E.solution} »`; }
        if (c.usage === 'production') { prevu = (elec ? E.consommations.chauffage * dju + E.consommations.ecs * an : 0) + E.consommations.froid * an; base = `électricité de la production de « ${E.solution} »`; if (!(prevu > 0)) prevu = null; }
        if (c.usage === 'eauEcs' && E.Vj > 0) { prevu = E.Vj * jours / 1000; base = 'besoin d\'ECS (L/j)'; }
      }
      const reel = ['gaz', 'production', 'chauffage', 'froid', 'ecs'].includes(c.usage) ? versKwh(total, unite, coefGaz) : ['appoint', 'eauEcs'].includes(c.usage) ? versM3(total, unite) : total;
      const uniteBilan = ['gaz', 'production', 'chauffage', 'froid', 'ecs'].includes(c.usage) ? 'kWh' : ['appoint', 'eauEcs'].includes(c.usage) ? 'm³' : unite;
      const ecart = prevu > 0 ? r((reel - prevu) / prevu * 100, 1) : null;
      const ligne = { compteur: c.compteur, rep: c.rep || '', usage: c.usage, libelle: USAGES[c.usage] || c.usage, du: P[0].du, au: P[P.length - 1].au, jours, reel: r(reel, uniteBilan === 'm³' ? 2 : 0), prevu: prevu !== null ? r(prevu, uniteBilan === 'm³' ? 2 : 0) : null, unite: uniteBilan, ecart, base, prevuGtc: !!c.rep, hors: ecart !== null && Math.abs(ecart) > tol };
      parUsage.push(ligne);
      if (ligne.hors) alertes.push({ niveau: ecart > 0 ? 'attention' : 'info', type: 'ecart', compteur: c.compteur, texte: `${ligne.libelle} (${c.compteur}) : ${ecart > 0 ? '+' : ''}${String(ecart).replace('.', ',')} % par rapport au prévu (${base}) sur ${jours} jours.` });
      // Dérive : consommation journalière de la dernière période au-dessus de la moyenne des précédentes
      if (P.length >= 3 && c.usage !== 'appoint') {
        const jr = P.map(p => p.conso / p.jours), der = jr[jr.length - 1], moy = jr.slice(0, -1).reduce((a, b) => a + b, 0) / (jr.length - 1);
        if (moy > 0 && (der - moy) / moy * 100 > tol) { const d = { compteur: c.compteur, usage: c.usage, du: P[P.length - 1].du, au: P[P.length - 1].au, hausse: r((der - moy) / moy * 100, 0) }; derives.push(d);
          alertes.push({ niveau: 'attention', type: 'derive', compteur: c.compteur, texte: `Dérive ${ligne.libelle.toLowerCase()} (${c.compteur}) : +${d.hausse} % par jour du ${d.du} au ${d.au} par rapport aux périodes précédentes (réglages, horaires, encrassement ?).` }); }
      }
      // Fuite d'eau : appoint journalier > 1 % du volume du réseau, ou cumul annualisé > seuil du traitement d'eau
      if (c.usage === 'appoint') {
        const V = n(ctx.volumeReseau), Lj = P.map(p => ({ ...p, lj: versM3(p.conso, unite) * 1000 / p.jours }));
        const seuilJ = V > 0 ? V / 100 : null, annuel = versM3(total, unite) * 1000 * 365 / Math.max(1, jours), seuilA = V > 0 ? V * (n(ctx.appointPct) ?? 5) / 100 : null;
        Lj.filter(p => seuilJ !== null && p.lj > seuilJ).forEach(p => { fuites.push({ compteur: c.compteur, du: p.du, au: p.au, litresJour: r(p.lj, 0), seuil: r(seuilJ, 0) });
          alertes.push({ niveau: 'erreur', type: 'fuite', compteur: c.compteur, texte: `Fuite d'eau probable : appoint de ${r(p.lj, 0)} L/j du ${p.du} au ${p.au} au compteur ${c.compteur} (seuil ${r(seuilJ, 0)} L/j = 1 % du volume du réseau de ${r(V, 0)} L) : soupape, vase d'expansion, purgeurs, fuite.` }); });
        if (seuilA !== null && annuel > seuilA && !fuites.some(f => f.compteur === c.compteur)) { fuites.push({ compteur: c.compteur, annuel: r(annuel, 0), seuilAnnuel: r(seuilA, 0) });
          alertes.push({ niveau: 'attention', type: 'fuite', compteur: c.compteur, texte: `Appoint annualisé de ${r(annuel, 0)} L au compteur ${c.compteur}, au-dessus du seuil de ${r(seuilA, 0)} L (${n(ctx.appointPct) ?? 5} % du volume du réseau) : rechercher une fuite.` }); }
        if (V === null) alertes.push({ niveau: 'info', type: 'fuite', compteur: c.compteur, texte: `Volume du réseau inconnu (calcul « Traitement d'eau » absent) : appoint de ${r(annuel, 0)} L/an au compteur ${c.compteur}, seuil de fuite non contrôlé.` });
      }
    });
    rap.absents.forEach(p => alertes.push({ niveau: 'info', type: 'absent', compteur: p.rep, texte: `Compteur prévu par la GTC sans relevé : ${p.rep} (${p.designation || USAGES[p.usage]}).` }));
    rap.inconnus.forEach(c => alertes.push({ niveau: 'info', type: 'inconnu', compteur: c.compteur, texte: `Compteur ${c.compteur} relevé mais non prévu par l'étude (usage déduit : ${(USAGES[c.usage] || c.usage).toLowerCase()}).` }));
    return { tolerance: tol, rapprochement: rap, parUsage, derives, fuites, anomalies, alertes, solution: E ? E.solution : '' };
  }
  return { USAGES, usageDe, lireCsv, date, lire, prevus, contexte, rapprocher, periodes, bilan };
})();
if (typeof module !== 'undefined') module.exports = Comptages;
