// Matériel retenu d'une étude : pour chaque équipement dimensionné (CTA, caisson, bouches, pompes, vannes, vases…),
// le fabricant et la référence exacte choisis, soumis à la validation du client / de la maîtrise d'œuvre, puis transmis
// au chantier (fiche du chantier au bureau, appli des compagnons). Module commun application Études / CRM / serveur / tests.
const MaterielRetenu = (() => {
  const STATUTS = ['À choisir', 'À soumettre', 'Soumis au client', 'Validé', 'Validé avec réserves', 'Refusé'];
  const VALIDES = ['Validé', 'Validé avec réserves'];
  const txt = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
  const estValide = l => VALIDES.includes(l.statut);
  // Statut effectif : sans référence, le matériel reste « à choisir » ; avec, « à soumettre » tant qu'il n'est pas soumis
  const statutDe = s => { const ref = txt(s && s.reference); if (!ref) return 'À choisir'; const st = s && s.statut; return STATUTS.includes(st) && st !== 'À choisir' ? st : 'À soumettre'; };
  const libelleRef = l => [txt(l.fabricant), txt(l.reference)].filter(Boolean).join(' ');

  // Lignes de la liste : équipements du métré (unités) avec leurs saisies, matériel ajouté à la main, saisies dont
  // l'équipement n'est plus dans l'étude (dimension changée : à reprendre ou supprimer)
  // postes : [{ cle, chapitre, designation, qte, sources }] ; saisies : { [cle]: { fabricant, reference, statut, dateSoumission, dateValidation, obs, fiche, designation, qte, libre } }
  function lignes(postes, saisies) {
    const s = saisies || {}, vus = new Set(), out = [];
    (postes || []).forEach(p => {
      if (!p.cle || vus.has(p.cle)) return;
      vus.add(p.cle);
      const x = s[p.cle] || {};
      out.push({ cle: p.cle, chapitre: p.chapitre || '', designation: p.designationBase || p.designation, qte: p.qte, sources: p.sources || [], ...champs(x), statut: statutDe(x) });
    });
    Object.entries(s).forEach(([cle, x]) => {
      if (vus.has(cle) || !x) return;
      if (x.libre) out.push({ cle, chapitre: x.chapitre || 'Autres équipements', designation: txt(x.designation) || 'Matériel', qte: Number(x.qte) || 1, sources: [], libre: true, ...champs(x), statut: statutDe(x) });
      else if (txt(x.reference) || txt(x.fabricant)) out.push({ cle, chapitre: x.chapitre || '', designation: txt(x.designation) || cle, qte: Number(x.qte) || 0, sources: [], orphelin: true, ...champs(x), statut: statutDe(x) });
    });
    return out;
  }
  // Prix d'achat lu dans un devis fournisseur : { pu, puBrut, remise, fournisseur, numero, date, validite, source }
  const prixDe = p => (p && Number(p.pu) > 0 ? { pu: Number(p.pu), puBrut: Number(p.puBrut) || Number(p.pu), remise: Number(p.remise) || 0, fournisseur: txt(p.fournisseur, 80), numero: txt(p.numero, 40), date: txt(p.date, 10), validite: txt(p.validite, 10), source: txt(p.source, 160), devisId: txt(p.devisId, 40), reference: txt(p.reference, 60) } : null);
  const champs = x => ({ prix: prixDe(x.prix), fabricant: txt(x.fabricant, 80), reference: txt(x.reference, 120), dateSoumission: txt(x.dateSoumission, 10), dateValidation: txt(x.dateValidation, 10), obs: txt(x.obs, 500), fiche: txt(x.fiche, 500), pElec: Number.isFinite(Number(x.pElec)) && x.pElec !== '' ? Number(x.pElec) : null });

  // Saisie d'un champ (modifie saisies) : le statut suit (référence effacée → « à choisir » ; validé → date du jour)
  function saisir(saisies, ligne, champ, valeur, aujourdhui) {
    const x = saisies[ligne.cle] || (saisies[ligne.cle] = {});
    x[champ] = valeur;
    // Désignation et quantité gardées pour retrouver une saisie dont l'équipement a changé de dimension
    if (!ligne.libre) { x.designation = ligne.designation; x.qte = ligne.qte; x.chapitre = ligne.chapitre; }
    if (champ === 'statut') {
      if (valeur === 'Soumis au client' && !x.dateSoumission) x.dateSoumission = aujourdhui || '';
      if (VALIDES.includes(valeur) || valeur === 'Refusé') x.dateValidation = x.dateValidation || aujourdhui || '';
      else x.dateValidation = '';
    }
    // Nouvelle référence après un refus ou une validation : à soumettre de nouveau
    if (champ === 'reference' || champ === 'fabricant') { if (x.statut && x.statut !== 'À soumettre') { x.statut = 'À soumettre'; x.dateValidation = ''; x.dateSoumission = ''; } }
    return x;
  }

  function bilan(ls) {
    const n = st => ls.filter(l => l.statut === st).length;
    return { total: ls.length, aChoisir: n('À choisir'), aSoumettre: n('À soumettre'), soumis: n('Soumis au client'), valides: ls.filter(estValide).length, refuses: n('Refusé'), orphelins: ls.filter(l => l.orphelin).length };
  }

  // Résumé envoyé au CRM avec l'étude (pas de prix) : lignes avec une référence
  const pourCrm = ls => ls.filter(l => l.reference && !l.orphelin).slice(0, 300)
    .map(l => ({ cle: l.cle, chapitre: l.chapitre, designation: txt(l.designation), qte: l.qte, fabricant: l.fabricant, reference: l.reference, statut: l.statut, dateSoumission: l.dateSoumission, dateValidation: l.dateValidation, obs: l.obs, fiche: /^https?:\/\//.test(l.fiche) ? l.fiche : '' }));

  /* ---------- Suivi sur le chantier (Pipe-Fit) ---------- */
  // Par ligne (étude + clé) : soumission au client, pose et mise en service par les compagnons, photos de la plaque
  const ACTIONS = { soumis: 'Soumis au client', pose: 'Posé', mes: 'Mis en service', annulerPose: 'Pose annulée', annulerMes: 'Mise en service annulée', photo: 'Photo de la plaque', substitution: 'Substitution à faire valider' };
  const ACTIONS_COMPAGNON = ['pose', 'mes', 'annulerPose', 'annulerMes', 'photo'];
  function appliquerSuivi(data, action, par, date, extra = {}) {
    const d = { ...(data || {}) }, qui = txt(par, 80), quand = txt(date, 10);
    if (!ACTIONS[action]) throw Object.assign(new Error('Action inconnue'), { status: 400 });
    if (action === 'soumis') Object.assign(d, { soumisLe: quand, soumisPar: qui, relances: d.soumisLe ? [...(d.relances || []), quand].slice(-10) : d.relances || [] });
    if (action === 'pose') Object.assign(d, { poseLe: quand, posePar: qui });
    if (action === 'mes') Object.assign(d, { mesLe: quand, mesPar: qui, poseLe: d.poseLe || quand, posePar: d.posePar || qui });
    if (action === 'annulerPose') { delete d.poseLe; delete d.posePar; delete d.mesLe; delete d.mesPar; }
    if (action === 'annulerMes') { delete d.mesLe; delete d.mesPar; }
    if (action === 'photo') {
      // Photo de la plaque et/ou n° de série (PV de mise en service signé : n° vérifié, photo déjà connue non doublée)
      const id = String(extra.fichierId || '');
      if (!/^[\w-]{1,64}$/.test(id) && !(id === '' && txt(extra.serie, 60))) throw Object.assign(new Error('Photo manquante'), { status: 400 });
      if (id && !(d.photos || []).some(p => p.fichierId === id)) d.photos = [...(d.photos || []), { fichierId: id, le: quand, par: qui, nom: txt(extra.nom, 120) }].slice(-6);
      // N° de série lu sur la plaque (photo), ou relevé sur le PV
      if (txt(extra.serie, 60)) Object.assign(d, { serie: txt(extra.serie, 60), serieLue: extra.serieLue !== false });
      // Fabricant et modèle lus sur la plaque : comparés au modèle retenu (PlaqueRegistre.comparer), substitution signalée
      if (txt(extra.marqueLue, 80) || txt(extra.modeleLu, 120)) d.plaque = { marque: txt(extra.marqueLue, 80), modele: txt(extra.modeleLu, 120), le: quand, par: qui };
    }
    // Matériel commandé (ou livré) différent de la référence validée : à refaire valider par le client
    if (action === 'substitution') {
      if (!txt(extra.reference, 200)) throw Object.assign(new Error('Référence de substitution manquante'), { status: 400 });
      d.substitution = { reference: txt(extra.reference, 200), designation: txt(extra.designation, 200), commande: txt(extra.commande, 40), le: quand, par: qui };
    }
    return d;
  }
  // Soumis depuis plus de « jours » sans avis du client : à relancer
  const aRelancer = (l, aujourdhui, jours = 15) => {
    const soumis = l.soumisLe || l.dateSoumission;
    if (l.statut !== 'Soumis au client' || !soumis || !aujourdhui) return false;
    return (Date.parse(aujourdhui) - Date.parse(soumis)) / 864e5 > jours;
  };

  // Pour le chantier (bureau et compagnons) : matériel de toutes les études liées, refusés écartés, validés d'abord ;
  // suivis : [{ etudeId, cle, soumisLe, poseLe, mesLe, photos… }]
  function pourChantier(liens, suivis) {
    const parCle = new Map((suivis || []).map(s => [`${s.etudeId}|${s.cle}`, s]));
    const out = [];
    (liens || []).filter(l => l.app === 'etudes').forEach(l => ((l.resume || {}).materiel || []).forEach(m => {
      if (!m || !m.reference || m.statut === 'Refusé') return;
      const s = parCle.get(`${l.id}|${m.cle}`) || {};
      out.push({ etude: txt((l.resume || {}).objet, 120), etudeId: l.id, affaireId: txt(l.affaireId, 64), cle: txt(m.cle, 200), chapitre: txt(m.chapitre, 60), designation: txt(m.designation), qte: Number(m.qte) || 0, fabricant: txt(m.fabricant, 80), reference: txt(m.reference, 120),
        statut: STATUTS.includes(m.statut) ? m.statut : 'À soumettre', valide: VALIDES.includes(m.statut), dateValidation: txt(m.dateValidation, 10), obs: txt(m.obs, 500), fiche: /^https?:\/\//.test(m.fiche || '') ? txt(m.fiche, 500) : '',
        soumisLe: txt(s.soumisLe || m.dateSoumission, 10), relances: s.relances || [], poseLe: txt(s.poseLe, 10), posePar: txt(s.posePar, 80), mesLe: txt(s.mesLe, 10), mesPar: txt(s.mesPar, 80), photos: s.photos || [], serie: txt(s.serie, 60), serieLue: !!s.serieLue, plaque: s.plaque || null, substitutionDemandee: s.substitution || null });
    }));
    return out.sort((a, b) => Number(b.valide) - Number(a.valide) || a.chapitre.localeCompare(b.chapitre, 'fr') || a.designation.localeCompare(b.designation, 'fr'));
  }

  const csv = ls => ['Chapitre;Désignation;Quantité;Fabricant;Référence;Statut;Soumis le;Validé le;Observations du client',
    ...ls.map(l => [l.chapitre, l.designation, String(l.qte ?? '').replace('.', ','), l.fabricant, l.reference, l.statut, l.dateSoumission, l.dateValidation, l.obs].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');

  // Suivi du chantier reporté dans l'étude : une ligne « à soumettre » envoyée au client depuis Pipe-Fit passe « soumis »
  function reprendreSuivi(saisies, ls, suivis, aujourdhui) {
    let n = 0;
    (suivis || []).forEach(s => {
      const l = ls.find(x => x.cle === s.cle);
      if (l && s.soumisLe && l.statut === 'À soumettre') { saisir(saisies, l, 'statut', 'Soumis au client', aujourdhui); saisies[l.cle].dateSoumission = s.soumisLe; n++; }
      // Substitution signalée sur le chantier (commande ou livraison différente) : nouvelle référence, à soumettre de nouveau
      const sub = s.substitution;
      if (l && sub && sub.reference && (saisies[l.cle] || {}).substitutionLe !== `${sub.le}|${sub.reference}`) {
        const ancienne = l.reference;
        saisir(saisies, l, 'reference', sub.reference, aujourdhui);
        const x = saisies[l.cle];
        Object.assign(x, { statut: 'À soumettre', dateSoumission: '', dateValidation: '', substitutionLe: `${sub.le}|${sub.reference}`, pElec: null,
          obs: `Substitution${sub.commande ? ` (commande ${sub.commande})` : ''} : ${ancienne || '—'} remplacé par ${sub.reference}. ${x.obs || ''}`.trim().slice(0, 500) });
        n++;
      }
    });
    return n;
  }
  // Type de PV de mise en service (module Essais) d'après la clé du matériel
  const typeMes = cle => { const [k, a] = String(cle || '').split('|'); return k === 'aero' ? (/^cta/.test(a || '') ? 'cta' : 'vmc') : k === 'cta' ? 'cta' : k === 'gen' ? (/^(pac|gf)/.test(a || '') ? 'pac' : 'chaudiere') : k === 'pompe' ? 'pompes' : 'autre'; };
  // Débits théoriques des études d'un chantier, pour les relevés d'équilibrage : [{ etude, installation, type, unite, lignes }]
  const NUM = v => (Number.isFinite(Number(v)) ? Number(v) : '');
  const debitsChantier = liens => (liens || []).filter(l => l.app === 'etudes').flatMap(l => ((l.resume || {}).debits || []).slice(0, 30).map(d => ({
    etude: txt((l.resume || {}).objet, 120), installation: txt(d.installation, 120), type: d.type === 'Hydraulique' ? 'Hydraulique' : 'Aéraulique', unite: ['m³/h', 'l/s', 'l/h'].includes(d.unite) ? d.unite : 'm³/h',
    lignes: (d.lignes || []).slice(0, 500).map(x => ({ repere: txt(x.repere, 40), local: txt(x.local, 120), type: txt(x.type, 40), theorique: NUM(x.theorique), reglage: txt(x.reglage, 80) })),
    renumerotations: ((l.resume || {}).renumerotations || []).slice(-20).map(r => ({ date: txt(r.date, 10), map: Object.fromEntries(Object.entries(r.map || {}).slice(0, 500).map(([a, b]) => [txt(a, 40), txt(b, 40)])) })) })));
  /* ---------- Garanties et entretien des équipements en service ---------- */
  // Opérations d'entretien courantes par type d'équipement [opération, précision, périodicité en mois] — base d'un contrat,
  // à adapter aux notices des fabricants
  const ENTRETIEN = {
    cta: [['Filtres', 'remplacement ou nettoyage selon encrassement', 6], ['Ventilateurs, courroies, batteries, bac à condensats, registres', 'contrôle et nettoyage', 12]],
    vmc: [['Caisson et bouches', 'nettoyage, contrôle des débits et des dépressions', 12]],
    chaudiere: [['Entretien annuel obligatoire', 'décret 2009-649 (chaudières de 4 à 400 kW), attestation remise au client', 12], ['Ramonage des conduits', '', 12]],
    pac: [['Entretien et contrôle d\'étanchéité', 'périodicité selon la charge en tonnes équivalent CO2 (règlement F-gas)', 12], ['Échangeurs et bac à condensats', 'nettoyage', 12]],
    pompes: [['Pompes', 'contrôle du fonctionnement, des garnitures et des intensités', 12]],
    autre: [['Contrôle de fonctionnement', '', 12]],
  };
  const plusMois = (iso, n) => { if (!iso) return ''; const d = new Date(`${iso.slice(0, 10)}T12:00:00`), j = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.toISOString().slice(0, 10); };
  // Garantie constructeur à partir de la mise en service (durée en mois, 24 par défaut) ; état à la date du jour
  function garanties(ms, aujourdhui, mois = 24) {
    return (ms || []).filter(m => m.mesLe).map(m => {
      const fin = plusMois(m.mesLe, mois), j = Math.round((Date.parse(fin) - Date.parse(aujourdhui)) / 864e5);
      return { etudeId: m.etudeId, cle: m.cle, designation: m.designation, fabricant: m.fabricant, reference: m.reference, serie: m.serie || '', mesLe: m.mesLe, fin, jours: j, etat: j < 0 ? 'terminée' : j <= 60 ? 'se termine bientôt' : 'en cours' };
    });
  }
  // Base du contrat d'entretien (CSV) : équipements en service, opérations et prochaines échéances
  function csvEntretien(ms, chantier, mois = 24) {
    const lignes = [];
    garanties(ms, new Date().toISOString().slice(0, 10), mois).forEach(g => (ENTRETIEN[typeMes(g.cle)] || ENTRETIEN.autre).forEach(([op, prec, per]) => lignes.push(
      [chantier, g.designation, g.fabricant, g.reference, g.serie, g.mesLe, g.fin, op, prec, per, plusMois(g.mesLe, per)])));
    return ['Chantier;Équipement;Fabricant;Référence;N° de série;Mis en service le;Fin de garantie;Opération;Précision;Périodicité (mois);Première échéance',
      ...lignes.map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');
  }
  /* ---------- Du CCTP / DPGF à la commande : un identifiant par équipement ---------- */
  // Famille d'un équipement : d'après le genre de l'inventaire du CCTP, la clé du métré ou la désignation
  const FAMILLE_GENRE = { cta: 'cta', ventilateur: 'caisson', desenfumage: 'caisson', 'pac-air': 'pac', 'pac-eau': 'pac', 'pac-rev': 'pac', 'gf-air': 'pac', 'gf-eau': 'pac',
    'chaudiere-cond': 'generateur', 'chaudiere-gaz': 'generateur', 'chaudiere-fioul': 'generateur', 'chaudiere-bois': 'generateur', echangeur: 'echangeur', 'echangeur-aux': 'echangeur',
    pompe: 'pompe', vanne2v: 'vanne', vanne3v: 'vanne', vase: 'vase', tampon: 'ballon', ecs: 'ballon', 'bouche-soufflage': 'bouche', 'bouche-extraction': 'bouche',
    ventilo: 'terminal', aerotherme: 'terminal', radiateurs: 'terminal', radiant: 'terminal', plafond: 'terminal', split: 'terminal', plancher: 'plancher', regulation: 'regulation', sanitaire: 'sanitaire' };
  const sansAcc = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function familleEquipement(cle, designation = '') {
    const [k, a] = String(cle || '').split('|');
    if (k === 'cctp') return FAMILLE_GENRE[a] || 'autre';
    if (k === 'aero') return /^cta/.test(a || '') ? 'cta' : 'caisson';
    if (k === 'cta') return 'cta';
    if (k === 'gen') return /^(pac|gf)/.test(a || '') ? 'pac' : /^echangeur/.test(a || '') ? 'echangeur' : 'generateur';
    const directe = { pompe: 'pompe', vanne: 'vanne', vase: 'vase', ballon: 'ballon', tampon: 'ballon', bouche: 'bouche', echangeur: 'echangeur', appareil: 'sanitaire' }[k];
    if (directe) return directe;
    const t = sansAcc(designation);
    return /ventilo|cassette|radiateur|aerotherme|split|unite interieure|panneau rayonnant|poutre/.test(t) ? 'terminal' : /pompe a chaleur|groupe (froid|de production)|refroidisseur/.test(t) ? 'pac'
      : /centrale de traitement|\bcta\b/.test(t) ? 'cta' : /extracteur|ventilateur|caisson|tourelle|desenfumage/.test(t) ? 'caisson' : /plancher/.test(t) ? 'plancher'
        : /armoire|regulation|automate|gtb|gtc/.test(t) ? 'regulation' : /ballon|chauffe-?eau|preparateur/.test(t) ? 'ballon' : /chaudiere/.test(t) ? 'generateur' : 'autre';
  }
  // Chapitre du métré et heures de pose par unité d'un équipement du CCTP non calculé (à ajuster dans le métré)
  const CHAPITRE_FAMILLE = { cta: ['Aéraulique', 16], caisson: ['Aéraulique', 6], bouche: ['Aéraulique', 0.75], pac: ['Production', 16], generateur: ['Production', 16], echangeur: ['Production', 8],
    ballon: ['Production', 6], pompe: ['Équipements hydrauliques', 3], vanne: ['Équipements hydrauliques', 2], vase: ['Équipements hydrauliques', 3], terminal: ['Émetteurs', 3], plancher: ['Émetteurs', 8],
    regulation: ['Régulation et sécurités', 8], sanitaire: ['Appareils sanitaires', 1.5] };
  const slug = t => sansAcc(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  // Clé stable d'un équipement du CCTP / DPGF (ne dépend pas de l'ordre de lecture) : « cctp|<genre>|<repère ou désignation> »
  const cleInventaire = x => `cctp|${x.genre || 'autre'}|${slug(x.repere || x.designation) || 'equipement'}`;
  // Équipements de l'inventaire (CCTP / DPGF) qu'aucun poste du métré ne couvre (pas encore dimensionnés par un calcul) :
  // ajoutés au matériel retenu avec une clé stable, pour être choisis, consultés, commandés et suivis comme les autres
  function avecInventaire(postes, inventaire) {
    const ps = postes || [], couvertes = new Set(ps.map(p => familleEquipement(p.cle, p.designationBase || p.designation)));
    const vus = new Set(ps.map(p => p.cle)), ajout = [];
    (inventaire || []).filter(x => x && x.inclus !== false && !x.variante && x.categorie !== 'reseau' && FAMILLE_GENRE[x.genre] && !couvertes.has(FAMILLE_GENRE[x.genre])).forEach(x => {
      let cle = cleInventaire(x), k = 2;
      while (vus.has(cle)) cle = `${cleInventaire(x)}#${k++}`;
      vus.add(cle);
      const [chapitre, heures] = CHAPITRE_FAMILLE[FAMILLE_GENRE[x.genre]] || ['Équipements hydrauliques', 3];
      ajout.push({ cle, chapitre, designation: [x.repere, txt(x.designation, 160)].filter(Boolean).join(' — '), qte: Number(x.qte) || 1, unite: 'u', heures, mo: 'monteur', sources: ['CCTP / DPGF'], inventaire: true, prescrit: txt(x.prescrit, 200),
        recherche: { type: 'mots', mots: sansAcc(x.designation).split(/[^a-z0-9]+/).filter(m => m.length >= 4).slice(0, 2) } });
    });
    return [...ps, ...ajout];
  }
  // État d'achat d'une ligne du chantier (suiviCommandes) : consulté, offre reçue, commandé (livraison prévue), reçu
  function etatAchat(m) {
    const c = (m && m.commande) || null, k = (m && m.consultation) || null;
    if (c && m.livraison === 'livrée') return { etat: 'recu', libelle: 'Reçu', date: c.dateLivraison || '', commande: c.numero || '', prevue: c.datePrevue || '' };
    if (c && m.livraison === 'livrée en partie') return { etat: 'partiel', libelle: 'Reçu en partie', date: c.dateLivraison || '', commande: c.numero || '', prevue: c.datePrevue || '' };
    if (c) return { etat: 'commande', libelle: 'Commandé', date: c.date || '', commande: c.numero || '', prevue: c.datePrevue || '', fournisseur: c.fournisseur || '' };
    if (k && k.offres) return { etat: 'offre', libelle: `Consulté — ${k.offres} offre(s)`, date: k.date || '', consultation: k.ref || '', prevue: k.dateLivraison || '' };
    if (k) return { etat: 'consulte', libelle: 'Consulté', date: k.date || '', consultation: k.ref || '', prevue: k.dateLivraison || '' };
    return { etat: '', libelle: '', date: '', prevue: '' };
  }
  const ORDRE_ACHAT = ['', 'consulte', 'offre', 'commande', 'partiel', 'recu'];
  // Suivi renvoyé à l'étude (application Études) : lignes du suivi du chantier, complétées de l'état d'achat de chaque
  // équipement (consultation, commande, réception) ; ms : suiviCommandes du chantier
  function suiviAvecAchats(etudeId, suivis, ms) {
    const out = (suivis || []).map(s => ({ ...s })), parCle = new Map(out.map(s => [s.cle, s]));
    (ms || []).filter(m => m.etudeId === etudeId).forEach(m => {
      const a = etatAchat(m);
      if (!a.etat) return;
      const achat = { ...a, consultationRef: (m.consultation || {}).ref || '', fournisseurs: (m.consultation || {}).fournisseurs || [], substitution: !!m.substitution };
      if (parCle.has(m.cle)) parCle.get(m.cle).achat = achat; else { const s = { etudeId, cle: m.cle, achat }; out.push(s); parCle.set(m.cle, s); }
    });
    return out;
  }
  return { prixDe, familleEquipement, cleInventaire, avecInventaire, etatAchat, ORDRE_ACHAT, suiviAvecAchats, ENTRETIEN, garanties, csvEntretien, debitsChantier, typeMes, STATUTS, VALIDES, ACTIONS, ACTIONS_COMPAGNON, statutDe, estValide, libelleRef, lignes, saisir, bilan, pourCrm, pourChantier, csv, appliquerSuivi, aRelancer, reprendreSuivi };
})();
if (typeof module !== 'undefined') module.exports = MaterielRetenu;
