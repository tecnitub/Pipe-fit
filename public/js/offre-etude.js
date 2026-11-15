// Devis fournisseur lu dans l'application Études ↔ offre de la consultation du chantier dans le CRM :
// - Études → CRM : le devis lu pour le matériel retenu crée ou complète l'offre du fournisseur dans la consultation du
//   chantier (retrouvée par le lien { etudeId, cle } de ses lignes, créée sinon), lignes rapprochées, PDF et source ;
//   pas de doublon (même fournisseur + même n° de devis : offre complétée) ;
// - CRM → Études : les offres saisies ou lues dans le CRM remontent leurs prix dans l'étude (comparatif des devis, prix du
//   matériel retenu quand il n'en a pas, ou quand l'offre est retenue dans le CRM).
// Module commun serveur Pipe-Fit / application Études / démonstrations / tests (fonctions pures).
const OffreEtude = (() => {
  const txt = (v, k = 200) => String(v == null ? '' : v).trim().slice(0, k);
  const num = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const r = (v, d = 2) => Math.round(Number(v) * 10 ** d) / 10 ** d;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const FORMES = /\b(sas|sasu|sarl|sa|eurl|snc|ets|etablissements|groupe|societe|ste)\b/g;
  const nomFournisseur = s => norm(s).replace(FORMES, ' ').replace(/\s+/g, ' ').trim();
  const memeNumero = (a, b) => !!a && !!b && norm(a).replace(/\s/g, '') === norm(b).replace(/\s/g, '');

  // Fournisseur du CRM d'après le nom lu sur le devis (exact, puis l'un contenu dans l'autre)
  function trouverFournisseur(entreprises, nom) {
    const n = nomFournisseur(nom);
    if (!n) return null;
    const fs = (entreprises || []).filter(e => e && e.nom && e.categorie !== 'Client');
    return fs.find(e => nomFournisseur(e.nom) === n)
      || fs.find(e => { const m = nomFournisseur(e.nom); return m.length >= 4 && n.length >= 4 && (m.includes(n) || n.includes(m)); }) || null;
  }
  const lienLigne = l => (l && l.materiel && l.materiel.etudeId ? `${l.materiel.etudeId}|${l.materiel.cle || ''}` : '');
  // Consultation en cours du chantier qui porte le matériel retenu de l'étude : la plus couvrante, puis la plus récente
  function trouverConsultation(consultations, { affaireId, etudeId, cles = [] } = {}) {
    const voulu = new Set((cles || []).map(c => `${etudeId}|${c}`));
    const cands = (consultations || []).filter(c => c && c.affaireId === affaireId && c.statut === 'En cours' && !c.retenu)
      .map(c => ({ c, n: (c.lignes || []).filter(l => voulu.has(lienLigne(l))).length, etude: (c.lignes || []).some(l => l.materiel && l.materiel.etudeId === etudeId) || !!(c.origine && c.origine.etudeId === etudeId) }))
      .filter(x => x.n || x.etude).sort((a, b) => b.n - a.n || String(b.c.date || '').localeCompare(String(a.c.date || '')));
    return cands.length ? cands[0].c : null;
  }
  // Nouvelle consultation pour le matériel retenu de l'étude (sans n° : donné par le CRM)
  const nouvelleConsultation = ({ affaireId, etudeId, objet, jour }) => ({ ref: '', objet: txt(objet || 'Matériel retenu de l\'étude', 200), affaireId, date: jour, dateLimite: jour, dateLivraison: '', statut: 'En cours',
    lignes: [], fournisseurs: [], origine: { app: 'etudes', etudeId } });
  // Lignes de la consultation pour le matériel retenu : celles qui manquent sont ajoutées (consultation en cours) ;
  // renvoie { index: { cle: n° de ligne }, ajoutees }
  function completerLignes(c, etudeId, materiel) {
    c.lignes = c.lignes || [];
    const index = {};
    let ajoutees = 0;
    c.lignes.forEach((l, i) => { if (l.materiel && l.materiel.etudeId === etudeId && l.materiel.cle && index[l.materiel.cle] === undefined) index[l.materiel.cle] = i; });
    (materiel || []).slice(0, 400).forEach(m => {
      if (!m || !m.cle || index[m.cle] !== undefined) return;
      c.lignes.push({ articleId: '', designation: txt([m.designation, [m.fabricant, m.reference].filter(Boolean).join(' ')].filter(Boolean).join(' — '), 200), unite: txt(m.unite || 'u', 10), qte: num(m.qte) > 0 ? num(m.qte) : 1,
        materiel: { etudeId, cle: txt(m.cle, 200), fabricant: txt(m.fabricant, 80), reference: txt(m.reference, 80) } });
      index[m.cle] = c.lignes.length - 1; ajoutees++;
    });
    return { index, ajoutees };
  }
  // Offre du fournisseur dans la consultation : prix nets et références par ligne (index : cle → n° de ligne), frais,
  // délai, validité, PDF, source. Même fournisseur + même n° de devis : offre complétée (pas de doublon) ; autre n° :
  // remplacée (n° précédent gardé). extra : { etudeId, devisId, pieceId, pieceNom, par, jour, source }
  function appliquerOffre(c, entrepriseId, devis, index, extra = {}) {
    c.fournisseurs = c.fournisseurs || [];
    let f = c.fournisseurs.find(x => x.entrepriseId === entrepriseId);
    if (!f) { f = { entrepriseId, statut: 'À consulter' }; c.fournisseurs.push(f); }
    const o = f.offre || {}, chiffree = Object.keys(o.prix || {}).length > 0;
    const etat = !chiffree ? 'creee' : memeNumero(o.reference, devis.numero) || (!o.reference && !devis.numero) ? 'completee' : 'remplacee';
    const garde = etat === 'completee' || !chiffree;
    const prix = garde ? { ...(o.prix || {}) } : {}, refs = garde ? { ...(o.refs || {}) } : {};
    let lignes = 0;
    (devis.lignes || []).forEach(l => {
      const i = index[l.cle];
      if (i === undefined || !(num(l.pu) > 0)) return;
      prix[i] = r(num(l.pu), 4); if (l.reference) refs[i] = txt(l.reference, 60); lignes++;
    });
    const frais = devis.totalFrais !== undefined && devis.totalFrais !== null ? num(devis.totalFrais) : (devis.frais || []).reduce((t, x) => t + num(x.montant), 0);
    f.offre = { ...(garde ? o : {}), prix, refs, remise: garde ? o.remise || '' : '', port: frais ? r(frais) : garde ? o.port || '' : '', delai: txt(devis.delai || (garde ? o.delai : '') || '', 10), validite: txt(devis.validite || (garde ? o.validite : '') || '', 10),
      reference: txt((etat === 'completee' && o.reference) || devis.numero || (garde ? o.reference : '') || '', 60), dateDevis: txt(devis.date || '', 10), date: extra.jour || '', aLire: false,
      ...(extra.pieceId ? { pieceId: extra.pieceId, pieceNom: txt(extra.pieceNom || 'Devis.pdf', 150) } : {}), source: txt(extra.source || '', 200),
      origine: { app: 'etudes', etudeId: txt(extra.etudeId, 64), devisId: txt(extra.devisId, 64), par: txt(extra.par, 80), le: extra.jour || '' },
      ...(etat === 'remplacee' ? { remplace: { reference: o.reference || '', date: o.dateDevis || o.date || '' } } : {}) };
    f.statut = 'Offre reçue';
    return { etat, lignes };
  }

  /* ---------- CRM → Études ---------- */
  // Offres reçues des consultations du chantier pour le matériel retenu de l'étude (prix nets de la remise globale)
  function offresEtude(consultations, etudeId, nomDe = () => '') {
    const out = [];
    (consultations || []).forEach(c => {
      const ls = (c.lignes || []).map((l, i) => ({ l, i })).filter(x => x.l.materiel && x.l.materiel.etudeId === etudeId && x.l.materiel.cle);
      if (!ls.length) return;
      (c.fournisseurs || []).filter(f => f.statut === 'Offre reçue' && f.offre && f.offre.prix).forEach(f => {
        const o = f.offre, rem = num(o.remise);
        const lignes = ls.filter(x => o.prix[x.i] !== undefined && o.prix[x.i] !== '' && num(o.prix[x.i]) > 0).map(x => ({ cle: x.l.materiel.cle, designation: txt(x.l.designation, 200), qte: num(x.l.qte), unite: txt(x.l.unite, 10),
          pu: r(num(o.prix[x.i]) * (1 - rem / 100), 4), puBrut: num(o.prix[x.i]), remise: rem, reference: txt((o.refs || {})[x.i] || '', 60) }));
        if (!lignes.length) return;
        const fournisseur = txt(nomDe(f.entrepriseId) || (o.lecture || {}).fournisseur || '', 120);
        out.push({ id: `crm-${c.id}-${f.entrepriseId}`.slice(0, 64), consultationId: c.id, ref: txt(c.ref, 30), entrepriseId: f.entrepriseId, fournisseur, numero: txt(o.reference, 60), date: txt(o.dateDevis || o.date, 10),
          validite: txt(o.validite, 10), delai: txt(o.delai, 10), port: num(o.port), source: txt(o.source || ['Offre', fournisseur, o.reference ? `n° ${o.reference}` : '', c.ref ? `(consultation ${c.ref})` : ''].filter(Boolean).join(' '), 200),
          retenue: !!(c.retenu && c.retenu.entrepriseId === f.entrepriseId), origine: o.origine && o.origine.app === 'etudes' ? { etudeId: o.origine.etudeId || '', devisId: o.origine.devisId || '' } : null, lignes });
      });
    });
    return out;
  }
  // Dans l'étude : offre résumée dans et.devisFournisseurs (comparatif) et prix repris sur le matériel retenu quand il
  // n'en a pas, qu'il venait déjà de cette offre, ou que l'offre est retenue dans le CRM. Une offre née d'un devis de cette
  // étude, ou du même fournisseur et n° qu'un devis lu dans l'étude, n'est pas reprise (déjà là).
  // ctx : { lignes (matériel retenu : [{ cle, ... }]), saisir(ligne, prix), today } ; renvoie { devis, prix } (nombre de changements)
  function versEtude(et, offres, { lignes = [], saisir, today = '' } = {}) {
    let devis = 0, prix = 0;
    et.devisFournisseurs = et.devisFournisseurs || [];
    (offres || []).forEach(o => {
      if (o.origine && o.origine.etudeId === et.id && et.devisFournisseurs.some(d => d.id === o.origine.devisId)) return;
      if (et.devisFournisseurs.some(d => d.origine !== 'crm' && memeNumero(d.numero, o.numero) && nomFournisseur(d.fournisseur) === nomFournisseur(o.fournisseur))) return;
      const ls = (o.lignes || []).filter(l => lignes.some(m => m.cle === l.cle));
      if (!ls.length) return;
      const res = { id: o.id, origine: 'crm', consultationId: o.consultationId, ref: o.ref, fournisseur: o.fournisseur, numero: o.numero, date: o.date, validite: o.validite, delai: o.delai, totalFrais: o.port || 0,
        frais: o.port ? [{ libelle: 'Port', montant: o.port }] : [], lignes: ls.map(l => ({ reference: l.reference, designation: l.designation, qte: l.qte, unite: l.unite, pu: l.pu, puBrut: l.puBrut, remise: l.remise, total: r(l.pu * l.qte) })),
        parLigne: Object.fromEntries(ls.map((l, i) => [i, l.cle])), source: o.source, retenue: o.retenue };
      const i = et.devisFournisseurs.findIndex(d => d.id === o.id), avant = i >= 0 ? et.devisFournisseurs[i] : null;
      const sig = x => JSON.stringify([x.numero, x.date, x.validite, x.totalFrais, x.retenue, x.lignes.map(l => [l.reference, l.pu, l.qte])]);
      if (!avant || sig(avant) !== sig(res)) {
        if (i >= 0) et.devisFournisseurs.splice(i, 1);
        et.devisFournisseurs.push({ ...res, lu: today });
        if (et.devisFournisseurs.length > 20) et.devisFournisseurs.splice(0, et.devisFournisseurs.length - 20);
        devis++;
      }
      ls.forEach(l => {
        const m = lignes.find(x => x.cle === l.cle), ex = ((et.materiel || {})[l.cle] || {}).prix;
        if (ex && ex.devisId !== o.id && !o.retenue) return;
        if (ex && ex.devisId === o.id && ex.pu === l.pu && ex.reference === l.reference) return;
        if (ex && o.retenue && ex.devisId !== o.id && ex.retenueCrm) return;
        saisir(m, { pu: l.pu, puBrut: l.puBrut, remise: l.remise, unite: l.unite, qteDevis: l.qte, reference: l.reference, ligne: l.designation, fournisseur: o.fournisseur, numero: o.numero, date: o.date,
          validite: o.validite, fichier: '', devisId: o.id, source: o.source, ...(o.retenue ? { retenueCrm: true } : {}) });
        prix++;
      });
    });
    return { devis, prix };
  }

  return { trouverFournisseur, trouverConsultation, nouvelleConsultation, completerLignes, appliquerOffre, offresEtude, versEtude, nomFournisseur, memeNumero };
})();
if (typeof module !== 'undefined') module.exports = OffreEtude;
