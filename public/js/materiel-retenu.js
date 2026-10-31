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
  const champs = x => ({ fabricant: txt(x.fabricant, 80), reference: txt(x.reference, 120), dateSoumission: txt(x.dateSoumission, 10), dateValidation: txt(x.dateValidation, 10), obs: txt(x.obs, 500), fiche: txt(x.fiche, 500) });

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
    .map(l => ({ cle: l.cle, chapitre: l.chapitre, designation: txt(l.designation), qte: l.qte, fabricant: l.fabricant, reference: l.reference, statut: l.statut, dateValidation: l.dateValidation, obs: l.obs, fiche: /^https?:\/\//.test(l.fiche) ? l.fiche : '' }));

  // Pour le chantier (bureau et compagnons) : matériel de toutes les études liées, refusés écartés, validés d'abord
  function pourChantier(liens) {
    const out = [];
    (liens || []).filter(l => l.app === 'etudes').forEach(l => ((l.resume || {}).materiel || []).forEach(m => {
      if (!m || !m.reference || m.statut === 'Refusé') return;
      out.push({ etude: txt((l.resume || {}).objet, 120), etudeId: l.id, chapitre: txt(m.chapitre, 60), designation: txt(m.designation), qte: Number(m.qte) || 0, fabricant: txt(m.fabricant, 80), reference: txt(m.reference, 120),
        statut: STATUTS.includes(m.statut) ? m.statut : 'À soumettre', valide: VALIDES.includes(m.statut), dateValidation: txt(m.dateValidation, 10), obs: txt(m.obs, 500), fiche: /^https?:\/\//.test(m.fiche || '') ? txt(m.fiche, 500) : '' });
    }));
    return out.sort((a, b) => Number(b.valide) - Number(a.valide) || a.chapitre.localeCompare(b.chapitre, 'fr') || a.designation.localeCompare(b.designation, 'fr'));
  }

  const csv = ls => ['Chapitre;Désignation;Quantité;Fabricant;Référence;Statut;Soumis le;Validé le;Observations du client',
    ...ls.map(l => [l.chapitre, l.designation, String(l.qte ?? '').replace('.', ','), l.fabricant, l.reference, l.statut, l.dateSoumission, l.dateValidation, l.obs].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');

  return { STATUTS, VALIDES, statutDe, estValide, libelleRef, lignes, saisir, bilan, pourCrm, pourChantier, csv };
})();
if (typeof module !== 'undefined') module.exports = MaterielRetenu;
