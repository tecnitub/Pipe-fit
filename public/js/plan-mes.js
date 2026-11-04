// Liste des mises en service d'un chantier, construite à partir des études reliées : réseaux à éprouver, équipements à
// mettre en service (matériel retenu et calculs, avec les valeurs attendues), installations à équilibrer (débits
// théoriques), contrôles réglementaires et tâches ajoutées à la main. L'état de chaque point vient des PV du chantier
// (épreuves, mises en service, relevés d'équilibrage) ; les PV s'ouvrent préremplis. Module commun navigateur / serveur / tests.
const PlanMes = (() => {
  const txt = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
  const norm = s => txt(s, 400).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const GROUPES = ['Épreuves des réseaux', 'Équipements', 'Équilibrages', 'Contrôles et réception'];
  const ETATS = { aFaire: 'À faire', enCours: 'Brouillon en cours', fait: 'Fait', reserves: 'Avec réserves', ko: 'Non conforme', sansObjet: 'Sans objet' };
  // Matériel retenu à mettre en service (clé du métré) et type de PV
  const PREFIXES = { gen: null, pompe: 'pompes', cta: 'cta', aero: null, vase: 'vase', echangeur: 'autre' };
  function typeMateriel(cle) {
    const [k, a] = String(cle || '').split('|');
    if (!(k in PREFIXES)) return '';
    if (k === 'gen') return /^(pac|gf)/.test(a || '') ? 'pac' : 'chaudiere';
    if (k === 'aero') return /^cta/.test(a || '') ? 'cta' : 'vmc';
    return PREFIXES[k];
  }
  const FINALES = [['Remplissage, rinçage, purge et traitement de l\'eau des réseaux', 'Analyse d\'eau et produit de traitement à noter (NF EN 12828, DTU 65.11).'],
    ['Régulation et GTB : essais fonctionnels de bout en bout', 'Points remontés, consignes, programmations horaires, alarmes, secours.'],
    ['Formation de l\'exploitant, remise des notices et des codes', 'Feuille d\'émargement de la formation ; notices dans le DOE.']];

  // Point reçu de l'application Études (résumé de l'étude), nettoyé
  const NATURES = ['mes', 'epreuve', 'controle'];
  const num = v => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const propre = p => (p && NATURES.includes(p.nature) ? {
    nature: p.nature, noteId: txt(p.noteId, 64), source: txt(p.source), titre: txt(p.titre, 200), type: txt(p.type, 20), cle: txt(p.cle, 200), detail: txt(p.detail, 600),
    reseau: txt(p.reseau, 200), natureReseau: txt(p.natureReseau, 60), fluideEssai: txt(p.fluideEssai, 20), PS: num(p.PS), PT: num(p.PT), categorie: num(p.categorie),
    repere: txt(p.repere, 40), local: txt(p.local, 80), zone: txt(p.zone, 60), marque: txt(p.marque, 60), modele: txt(p.modele, 80),
    controles: (Array.isArray(p.controles) ? p.controles : []).slice(0, 400).map(c => txt(c, 120)).filter(Boolean),
    attendus: (Array.isArray(p.attendus) ? p.attendus : []).slice(0, 12).map(a => ({ libelle: txt(a && a.libelle, 80), valeur: num(a && a.valeur), unite: txt(a && a.unite, 12) })).filter(a => a.libelle && a.valeur !== null),
  } : null);
  // Points des études du chantier (serveur) : [{ etudeId, etude, ...point }]
  const pointsChantier = liens => (liens || []).filter(l => l.app === 'etudes').flatMap(l => ((l.resume || {}).mes || []).slice(0, 200)
    .map(propre).filter(Boolean).map(p => ({ ...p, etudeId: txt(l.id, 64), etude: txt((l.resume || {}).objet, 120) })));

  const resultatMes = r => (r.statut !== 'Signé' ? 'enCours' : r.resultat === 'Mis en service' ? 'fait' : r.resultat === 'Mis en service avec réserves' ? 'reserves' : 'ko');
  const resultatConf = r => (r.statut !== 'Signé' ? 'enCours' : r.resultat === 'Conforme' ? 'fait' : 'ko');
  const ORDRE_ETAT = { fait: 0, reserves: 1, ko: 2, enCours: 3 };
  // PV le plus avancé parmi ceux qui correspondent
  const meilleur = (recs, etatDe) => recs.map(r => ({ r, e: etatDe(r) })).sort((a, b) => ORDRE_ETAT[a.e] - ORDRE_ETAT[b.e] || String(b.r.date || '').localeCompare(String(a.r.date || '')))[0] || null;
  const q = o => Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const attendusQ = a => ((a || []).length ? JSON.stringify(a.slice(0, 12).map(x => [x.libelle, x.valeur, x.unite])) : '');

  // affaireId ; materiel : lignes de /api/liens/materiel ; points : /api/liens/plan-mes ; debits : /api/liens/debits ;
  // pv : { mises, epreuves, equilibrages } du chantier ; suivi : affaire.planMes = { etats: { [cle]: { fait, sansObjet, le, par } }, manuelles: [{ id, libelle, groupe }] }
  function plan({ affaireId = '', materiel = [], points = [], debits = [], pv = {}, suivi = {} } = {}) {
    const etats = (suivi && suivi.etats) || {}, taches = [], mises = pv.mises || [], epreuves = pv.epreuves || [], eqs = pv.equilibrages || [];
    const pointsMes = points.filter(p => p.nature === 'mes'), utilises = new Set();

    // 1. Épreuves : réseaux des calculs (un par nom de réseau)
    const vus = new Set();
    points.filter(p => p.nature === 'epreuve').forEach(p => {
      const k = norm(p.reseau || p.titre);
      if (!k || vus.has(k)) { const t = taches.find(x => x.nature === 'epreuve' && norm(x.reseau) === k); if (t && !t.PT && p.PT) Object.assign(t, { PS: p.PS, PT: p.PT }); return; }
      vus.add(k);
      const cle = `ep|${p.etudeId}|${p.noteId}`;
      taches.push({ cle, groupe: GROUPES[0], nature: 'epreuve', libelle: `Épreuve : ${txt(p.reseau || p.titre)}`, reseau: txt(p.reseau || p.titre), PS: p.PS, PT: p.PT, source: p.etude,
        detail: [p.natureReseau, p.PT ? `épreuve à ${String(p.PT).replace('.', ',')} bar${p.PS ? ` (PS ${String(p.PS).replace('.', ',')} bar)` : ''}` : 'pression d\'épreuve selon le CCTP', p.categorie > 0 ? `DESP cat. ${['', 'I', 'II', 'III', 'IV'][p.categorie]}` : ''].filter(Boolean).join(' · '),
        lien: `#/epreuve/new?${q({ chantier: affaireId, reseau: txt(p.reseau || p.titre), nature: p.natureReseau, ps: p.PS, pt: p.PT, fluide: p.fluideEssai, plan: cle })}`,
        trouver: r => r.planCle === cle || norm(r.reseau) === k, recs: epreuves, etatDe: resultatConf });
    });

    // 2. Équipements : matériel retenu (refusés écartés) avec les valeurs attendues des calculs, puis calculs sans matériel
    materiel.forEach(m => {
      const type = typeMateriel(m.cle);
      if (!type) return;
      const pts = pointsMes.filter(p => p.etudeId === m.etudeId && p.cle && p.cle === m.cle);
      pts.forEach(p => utilises.add(p));
      const attendus = pts.flatMap(p => p.attendus || []).filter((a, i, t) => t.findIndex(x => x.libelle === a.libelle) === i);
      const mat = `${m.etudeId}|${m.cle}`, cle = `mat|${mat}`, ref = [m.fabricant, m.reference].filter(Boolean).join(' ');
      taches.push({ cle, groupe: GROUPES[1], nature: 'mes', type, libelle: txt(m.designation), detail: [ref, m.qte > 1 ? `× ${m.qte}` : '', !m.valide ? 'non validé par le client' : !m.poseLe ? 'pas encore posé' : '', /^(pac|split)$/.test(type) ? 'fiche d\'intervention fluides (Cerfa) à établir' : ''].filter(Boolean).join(' · '),
        attendus, source: m.etude, sansPv: !!m.mesLe,
        lien: `#/mes/new?${q({ chantier: affaireId, type, equipement: txt(m.designation), marque: m.fabricant, modele: m.reference, materiel: mat, plan: cle, att: attendusQ(attendus) })}`,
        trouver: r => r.planCle === cle || r.materiel === mat, recs: mises, etatDe: resultatMes });
    });
    pointsMes.filter(p => !utilises.has(p)).forEach(p => {
      // Plusieurs calculs pour le même équipement (schéma aéraulique relié à une CTA) : valeurs regroupées
      const deja = p.cle && taches.find(t => t.nature === 'mes' && t.pointCle === `${p.etudeId}|${p.cle}`);
      if (deja) { (p.attendus || []).forEach(a => { if (!deja.attendus.some(x => x.libelle === a.libelle)) deja.attendus.push(a); }); deja.lien = deja.lien.replace(/([?&]att=)[^&]*/, `$1${encodeURIComponent(attendusQ(deja.attendus))}`); return; }
      const cle = `pt|${p.etudeId}|${p.noteId}${p.repere ? `|${norm(p.repere)}` : ''}`;
      taches.push({ cle, pointCle: p.cle ? `${p.etudeId}|${p.cle}` : '', groupe: GROUPES[1], nature: 'mes', type: p.type || 'autre', libelle: txt(p.titre), repere: p.repere || '', local: p.local || '', zone: p.zone || '', marque: p.marque || '', modele: p.modele || '', detail: (p.controles || []).length ? `${p.controles.length} point(s) à tester, liste reprise de l'étude` : 'd\'après le calcul (pas de matériel retenu)', attendus: [...(p.attendus || [])], ...((p.controles || []).length ? { controles: p.controles } : {}), source: p.etude,
        lien: `#/mes/new?${q({ chantier: affaireId, type: p.type || 'autre', equipement: txt(p.titre), repere: p.repere, localisation: p.local, zone: p.zone, marque: p.marque, modele: p.modele, plan: cle, att: attendusQ(p.attendus) })}`,
        trouver: r => r.planCle === cle, recs: mises, etatDe: resultatMes });
    });

    // 3. Équilibrages : installations dont l'étude donne les débits théoriques
    debits.forEach(d => {
      const k = norm(d.installation), cle = `eq|${k}`;
      if (!k || taches.some(t => t.cle === cle)) return;
      taches.push({ cle, groupe: GROUPES[2], nature: 'equilibrage', libelle: `Équilibrage ${d.type === 'Hydraulique' ? 'hydraulique' : 'aéraulique'} : ${txt(d.installation)}`,
        detail: `${(d.lignes || []).length} ${d.type === 'Hydraulique' ? 'organe(s)' : 'bouche(s)'}, débits théoriques repris de l'étude`, source: d.etude,
        lien: `#/equilibrage/new?${q({ chantier: affaireId, installation: txt(d.installation), type: d.type, unite: d.unite, plan: cle, etude: 1 })}`,
        trouver: r => r.planCle === cle || norm(r.installation) === k, recs: eqs, etatDe: resultatConf });
    });

    // 4. Contrôles réglementaires (calculs), contrôles de fin de chantier, tâches ajoutées
    points.filter(p => p.nature === 'controle').forEach(p => taches.push({ cle: `ct|${p.etudeId}|${p.noteId}|${norm(p.titre).slice(0, 40)}`, groupe: GROUPES[3], nature: 'controle', libelle: txt(p.titre), detail: txt(p.detail, 600), source: p.etude }));
    if (taches.length) FINALES.forEach(([libelle, detail], i) => taches.push({ cle: `fin|${i}`, groupe: GROUPES[3], nature: 'controle', libelle, detail }));
    ((suivi && suivi.manuelles) || []).forEach(m => taches.push({ cle: `man|${m.id}`, groupe: GROUPES.includes(m.groupe) ? m.groupe : GROUPES[3], nature: 'controle', libelle: txt(m.libelle), detail: txt(m.detail, 300), manuelle: true }));

    // États
    taches.forEach(t => {
      const s = etats[t.cle] || {};
      const pvs = t.trouver ? t.recs.filter(r => r.affaireId === affaireId || !affaireId).filter(t.trouver) : [], m = t.etatDe ? meilleur(pvs, t.etatDe) : null;
      t.etat = m ? m.e : s.fait || t.sansPv ? 'fait' : 'aFaire';
      if (m) t.pv = { id: m.r.id, numero: m.r.numero || '', date: m.r.date || '', resultat: m.r.resultat || '', statut: m.r.statut };
      else if (t.sansPv) t.note = 'mis en service sans PV';
      else if (s.fait) t.note = `fait${s.le ? ` le ${String(s.le).split('-').reverse().join('/')}` : ''}${s.par ? ` par ${s.par}` : ''}`;
      if (s.sansObjet && t.etat !== 'fait') { t.etat = 'sansObjet'; t.note = `sans objet${s.par ? ` (${s.par})` : ''}`; }
      delete t.trouver; delete t.recs; delete t.etatDe;
    });
    return taches.sort((a, b) => GROUPES.indexOf(a.groupe) - GROUPES.indexOf(b.groupe));
  }

  function bilan(taches) {
    const n = e => taches.filter(t => t.etat === e).length, utiles = taches.filter(t => t.etat !== 'sansObjet').length;
    return { total: taches.length, utiles, faits: n('fait') + n('reserves'), aFaire: n('aFaire'), enCours: n('enCours'), reserves: n('reserves'), ko: n('ko'), sansObjet: n('sansObjet'),
      pourcent: utiles ? Math.round((n('fait') + n('reserves')) / utiles * 100) : 0 };
  }
  // Marquage d'un point sans PV (fait / sans objet) ; renvoie le nouveau suivi
  function marquer(suivi, cle, champ, valeur, par, le) {
    const s = { etats: { ...((suivi || {}).etats || {}) }, manuelles: [...((suivi || {}).manuelles || [])] };
    const e = { ...(s.etats[cle] || {}) };
    if (valeur) Object.assign(e, { [champ]: true, par: txt(par, 80), le: txt(le, 10) }); else delete e[champ];
    if (!e.fait && !e.sansObjet) delete s.etats[cle]; else s.etats[cle] = e;
    return s;
  }
  // Valeurs attendues passées dans l'adresse du PV : [[libellé, valeur, unité]]
  function lireAttendus(s) {
    try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.slice(0, 12).filter(x => Array.isArray(x) && x[0] && Number.isFinite(Number(x[1]))).map(([libelle, valeur, unite]) => ({ libelle: txt(libelle, 80), valeur: Number(valeur), unite: txt(unite, 12) })) : []; } catch (e) { return []; }
  }
  // Mesures du PV complétées par les valeurs attendues (mesure du même nom, sinon ajoutée)
  function avecAttendus(mesures, attendus) {
    const out = (mesures || []).map(m => ({ ...m }));
    (attendus || []).forEach(a => {
      const m = out.find(x => norm(x.libelle) === norm(a.libelle) && (x.unite || '') === (a.unite || ''));
      if (m) m.attendu = a.valeur; else out.push({ libelle: a.libelle, unite: a.unite, valeur: '', attendu: a.valeur });
    });
    return out;
  }
  // Écart d'une mesure à la valeur attendue (%)
  const ecart = m => { const v = Number(String(m.valeur ?? '').replace(',', '.')), a = Number(m.attendu); return m.valeur === '' || m.valeur == null || !Number.isFinite(v) || !a ? null : Math.round((v - a) / a * 1000) / 10; };
  return { GROUPES, ETATS, FINALES, typeMateriel, propre, pointsChantier, plan, bilan, marquer, lireAttendus, avecAttendus, ecart, norm };
})();
if (typeof module !== 'undefined') module.exports = PlanMes;
