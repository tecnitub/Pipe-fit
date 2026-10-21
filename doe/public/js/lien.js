// Lien avec Pipe-Fit : lecture des données du chantier (client, maîtrise d'œuvre, site, dates, documents, matériel,
// PV de réception, réserves) et pré-remplissage du DOE. Les champs déjà saisis ne sont jamais écrasés.
const PF = {
  data: null,
  async charger(frais) { this.data = await api('GET', `/api/pf/donnees${frais ? '?frais=1' : ''}`); return this.data; },
  all(col) { return (this.data && this.data[col]) || []; },
  get(col, id) { return this.all(col).find(x => x.id === id); },
};
const entrepriseDe = id => PF.get('entreprises', id) || {};
const adresseDe = s => (s ? [s.adresse, [s.cp, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '');
const siteDe = a => (entrepriseDe(a.clientId).adresses || []).find(s => s.id === a.siteId);
const siegeDe = e => (e.adresses || []).find(s => s.facturation) || (e.adresses || [])[0];
const nomContact = c => (c ? [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ') : '');
const ajouterAns = (iso, n) => { if (!iso) return ''; const d = new Date(`${iso}T12:00:00`); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };
const estHD = a => a.type === 'horsDevis';

// Chantiers de Pipe-Fit pouvant recevoir un DOE (hors interventions en régie)
function chantiersPF() {
  return PF.all('affaires').filter(a => !estHD(a)).map(a => ({ a, reception: receptionDe(a) }))
    .sort((x, y) => (y.reception ? 1 : 0) - (x.reception ? 1 : 0) || String(y.a.code || '').localeCompare(String(x.a.code || '')));
}
function receptionDe(a) {
  const pv = PF.all('receptions').filter(p => p.affaireId === a.id && p.type === 'reception' && p.statut === 'Signé').sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];
  return pv ? pv.date : a.dateReception || '';
}
const intervenantDe = (eid, contactId) => {
  const e = entrepriseDe(eid), c = PF.get('contacts', contactId), s = siegeDe(e);
  return e.nom ? { raison: e.nom, adresse: adresseDe(s), interlocuteur: [nomContact(c), c && c.fonction].filter(Boolean).join(', '), tel: c ? c.mobile || c.tel || '' : e.tel || '', mail: c ? c.email || '' : e.email || '' } : null;
};
// Sous-section de plan devinée d'après le nom du fichier
const sousPlanDe = nom => (/ventil|cta|vmc|a[ée]raul|d[ée]senfum|gaine/i.test(nom) ? '2.2' : /plomb|sanit|\bef\b|\becs\b|eau froide|\beu\b|\bep\b/i.test(nom) ? '2.3'
  : /gtb|gtc|r[ée]gul|synoptique|automate/i.test(nom) ? '2.4' : /iso|process|nep|vapeur|tuyauterie|collecteur|p&?id|rack/i.test(nom) ? '2.5' : '2.1');

// Pré-remplissage (ne remplit que ce qui est vide) ; renvoie le nombre d'éléments repris
function prefillDepuisPF(doe) {
  const a = PF.get('affaires', doe.affaireId);
  if (!a) return 0;
  let n = 0;
  const si = (obj, k, v) => { if (v && !obj[k]) { obj[k] = v; n++; } };
  const site = siteDe(a), dv = PF.all('devis').find(d => d.affaireId === a.id && d.statut === 'Accepté');
  si(doe, 'operation', a.nom); si(doe, 'adresse', site ? `${site.libelle ? site.libelle + ' — ' : ''}${adresseDe(site)}` : '');
  doe.intervenants = doe.intervenants || {};
  [['mo', a.clientId, a.contactId], ['moe', a.moeId, a.moeContactId]].forEach(([k, eid, cid]) => { const v = eid && intervenantDe(eid, cid); if (v && !(doe.intervenants[k] && doe.intervenants[k].raison)) { doe.intervenants[k] = v; n++; } });
  const temps = PF.all('temps').filter(t => t.affaireId === a.id && t.date).map(t => t.date).sort();
  si(doe.dates, 'debut', temps[0] || a.dateCreation); si(doe.dates, 'reception', receptionDe(a));
  if (['Terminé', 'Facturé', 'Clos'].includes(a.statut) || receptionDe(a)) si(doe.dates, 'fin', temps[temps.length - 1]);
  si(doe.dates, 'gpa', ajouterAns(doe.dates.reception, 1));
  // Documents du chantier : plans -> section 2, fiches techniques -> annexe B, notices -> 7.2
  const deja = new Set([...doe.plans, ...doe.fiches, ...doe.notices].map(x => x.pfDocId).filter(Boolean));
  (a.documents || []).filter(d => !deja.has(d.id)).forEach(d => {
    const f = { src: 'pf', id: d.fichierId, nom: d.nom, mime: d.mime };
    if (d.categorie === 'Plan') { doe.plans.push({ id: uidD(), pfDocId: d.id, section: sousPlanDe(d.nom), numero: '', designation: d.nom.replace(/\.[a-z0-9]+$/i, ''), echelle: '', indice: d.indice || '', fichier: f }); n++; }
    else if (d.categorie === 'Fiche technique') { doe.fiches.push({ id: uidD(), pfDocId: d.id, famille: familleProposee({ famillePF: '', designation: d.nom }), designation: d.nom.replace(/\.[a-z0-9]+$/i, ''), fichier: f }); n++; }
    else if (d.categorie === 'Notice') { doe.notices.push({ id: uidD(), pfDocId: d.id, libelle: d.nom.replace(/\.[a-z0-9]+$/i, ''), fichier: f }); n++; }
  });
  doe.pf = { ...(doe.pf || {}), devisId: dv ? dv.id : '', code: a.code, maj: new Date().toISOString() };
  return n;
}

// Fournitures du chantier (devis accepté + commandes) proposées pour la section 3
function fournituresPF(affaireId) {
  const out = new Map();
  const ajoute = (articleId, designation, unite, qte, fournisseurId, origine) => {
    const art = articleId ? PF.get('articles', articleId) : null, k = articleId || designation;
    const x = out.get(k) || { cle: k, articleId, designation: art ? art.designation : designation, ref: art ? art.ref : '', famillePF: art ? art.famille || '' : '', unite, qte: 0, fournisseur: '', origines: new Set() };
    x.qte += Number(qte) || 0; x.origines.add(origine);
    if (fournisseurId && !x.fournisseur) x.fournisseur = entrepriseDe(fournisseurId).nom || '';
    out.set(k, x);
  };
  const dv = PF.all('devis').find(d => d.affaireId === affaireId && d.statut === 'Accepté');
  (dv ? dv.lignes || [] : []).forEach(l => (l.composants || []).filter(c => c.type !== 'mo').forEach(c => ajoute(c.articleId, c.designation, c.unite, (Number(c.qte) || 0) * (Number(l.qte) || 0), (PF.get('articles', c.articleId) || {}).fournisseurId, 'devis')));
  PF.all('commandes').filter(c => c.affaireId === affaireId && c.statut !== 'Annulée').forEach(c => (c.lignes || []).forEach(l => ajoute(l.articleId, l.designation, l.unite, 0, c.fournisseurId, `commande ${c.numero || ''}`)));
  return [...out.values()].map(x => ({ ...x, origines: [...x.origines], familleDOE: familleProposee(x) }));
}
// Famille DOE devinée d'après la famille Pipe-Fit et la désignation ('' si rien ne correspond : prestation, consommable…)
const familleProposee = x => (/tube|tuyau|raccord|coude|bride|t[ée]\b|r[ée]duction|calorifuge|support/i.test(`${x.famillePF} ${x.designation}`) ? '3.8'
  : /vanne|robinet|clapet|pompe|filtre|purgeur|compteur|soupape|manom|thermom/i.test(`${x.famillePF} ${x.designation}`) ? '3.7'
    : /cta|centrale/i.test(x.designation) ? '3.4' : /vmc|extracteur/i.test(x.designation) ? '3.5' : /pac|pompe . chaleur|tfp|groupe froid/i.test(x.designation) ? '3.1' : /radiateur|ventilo|plancher chauffant|cassette/i.test(x.designation) ? '3.2'
              : /split|d[ée]tente directe/i.test(x.designation) ? '3.3' : /d[ée]senfum/i.test(x.designation) ? '3.6' : /lavabo|wc\b|douche|ballon|chauffe-eau|evier|évier/i.test(x.designation) ? '3.9' : '');

// PV de réception et réserves du chantier (annexe R)
function receptionPF(affaireId) {
  return { pv: PF.all('receptions').filter(p => p.affaireId === affaireId).sort((x, y) => (x.date || '').localeCompare(y.date || '')), reserves: PF.all('reserves').filter(r => r.affaireId === affaireId).sort((x, y) => (x.numero || 0) - (y.numero || 0)) };
}

// PV d'essais signés dans Pipe-Fit (épreuves, mises en service, équilibrages, fiches d'intervention fluides du chantier)
function essaisPF(affaireId) {
  const signes = col => PF.all(col).filter(r => r.affaireId === affaireId && r.statut === 'Signé').sort((x, y) => `${x.date}${x.numero || ''}`.localeCompare(`${y.date}${y.numero || ''}`));
  return { epreuves: signes('epreuves'), mes: signes('misesEnService'), equilibrages: signes('equilibrages'),
    cerfa: PF.all('fichesFluides').filter(f => f.affaireId === affaireId && ['Signée', 'Envoyée'].includes(f.statut)).sort((x, y) => (x.date || '').localeCompare(y.date || '')) };
}
// Pièces des listes de contrôle (sections 5 et 6) couvertes par un PV de Pipe-Fit : cochées et jointes automatiquement
const aeraulique = q => q.type !== 'Hydraulique', frigo = m => ['pac', 'split'].includes(m.type), process = x => /process|vapeur/i.test(x.nature || '');
const REGLES_PF = [
  ['5.1', /mise en service TFP/i, e => e.mes.some(frigo)], ['5.1', /CERFA/, e => e.cerfa.length > 0],
  ['5.1', /paramètres de fonctionnement/i, e => e.mes.some(m => frigo(m) && (m.mesures || []).some(v => !vide(v.valeur)))],
  ['5.2', /remplissage et mise en pression/i, e => e.epreuves.length > 0], ['5.2', /équilibrage des radiateurs|équilibrage VC/i, e => e.equilibrages.some(q => !aeraulique(q))],
  ['5.3', /équilibrage aéraulique par CTA/i, e => e.equilibrages.some(q => aeraulique(q) && !/vmc/i.test(q.installation))], ['5.3', /équilibrage VMC/i, e => e.equilibrages.some(q => aeraulique(q) && /vmc/i.test(q.installation))],
  ['5.3', /désenfumage/i, e => e.mes.some(m => m.type === 'desenfumage')],
  ['6.1', /pression des réseaux hydrauliques/i, e => e.epreuves.some(x => !process(x))], ['6.1', /circuits frigorigènes/i, e => e.cerfa.length > 0],
  ['6.2', /équilibrage aéraulique/i, e => e.equilibrages.some(aeraulique)], ['6.3', /épreuve hydraulique des tuyauteries/i, e => e.epreuves.some(process)],
];
const couvertParPF = (doe, k, libelle) => { const e = essaisPF(doe.affaireId); return REGLES_PF.some(([c, re, t]) => c === k && re.test(libelle) && t(e)); };
// Pièces générées depuis Pipe-Fit : annexe F (mise en service), annexe G (essais et mesures)
function piecesPF(doe) {
  if (doe.sansEssaisPF) return { F: [], G: [] };
  const e = essaisPF(doe.affaireId), p = (genere, r, libelle) => ({ libelle: `${r.numero || ''} — ${libelle}`, present: true, genere, ref: r });
  const cerfa = f => p('cerfa', f, `Fiche d'intervention fluides (Cerfa 15497) — ${(PF.get('equipementsFrigo', f.equipementId) || {}).designation || ''}`);
  return { F: [...e.mes.map(m => p('mes', m, `PV de mise en service — ${m.equipement}`)), ...e.cerfa.filter(f => f.nature === 'miseEnService').map(cerfa),
      ...e.equilibrages.filter(q => !aeraulique(q)).map(q => p('equilibrage', q, `Relevé d'équilibrage hydraulique — ${q.installation}`))],
    G: [...e.epreuves.map(x => p('epreuve', x, `PV d'épreuve hydraulique — ${x.reseau}`)), ...e.equilibrages.filter(aeraulique).map(q => p('equilibrage', q, `Relevé d'équilibrage aéraulique — ${q.installation}`)),
      ...e.cerfa.filter(f => f.nature !== 'miseEnService').map(cerfa)] };
}
