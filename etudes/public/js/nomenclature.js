// Nomenclature d'une installation (schéma de principe hydraulique) et liste d'achat : générateurs, pompes, vannes de
// régulation, robinetterie et accessoires (avec fabricant, référence et fiche technique), bouteille ou échangeur,
// collecteurs, ballon tampon, tubes par circuit, terminaux raccordés. La liste d'achat regroupe les articles identiques.
// Module pur (navigateur, node, tests).
const Nomenclature = ((N, Sc) => {
  const { nf, num } = N;
  // Lignes : { rep, circuit, famille, designation, dn, qte, unite, fabricant, reference, fiche, dp }
  // Réseau arborescent : pompe, tubes par tronçon, vannes d'équilibrage (préréglage), robinetterie
  function lignesArbo(et, n, calc) {
    const v = calc(n).valeurs || {}, out = [], add = o => out.push({ circuit: '', dn: '', unite: 'u', fabricant: '', reference: '', fiche: '', dp: '', ...o });
    const T = typeof Schema !== 'undefined' ? Schema : Sc;
    if (v.pompeRetenue && v.pompeRetenue.ref) { const [fab, ...refs] = v.pompeRetenue.ref.split(/\s+/); add({ rep: 'P', circuit: 'Départ', famille: 'Pompes', designation: `Pompe ${nf(v.Qp, 2)} m³/h × ${nf(v.HMT, 2)} mCE (réglage ≈ ${nf(v.pompeRetenue.vitesse || 100, 0)} %)`, qte: 1, fabricant: fab, reference: refs.join(' ') }); }
    else if (v.pompe) add({ rep: 'P', circuit: 'Départ', famille: 'Pompes', designation: `Pompe ${N.libPompe(v.pompe).replace(/, vitesse.*/, '')} (${nf(v.Qp, 2)} m³/h × ${nf(v.HMT, 2)} mCE)`, qte: 1 });
    (v.vannes || []).forEach(x => { const [fab, ...refs] = String(x.ref || '').split(/\s+/);
      add({ rep: x.vanneRep || `VE-${x.rep}`, circuit: x.rep, famille: 'Robinetterie', designation: `Vanne d'équilibrage Kvs ${nf(x.Kvs, 1)}${x.tours ? ` — préréglage ≈ ${nf(x.tours, 1)} / ${nf(x.toursMax, 0)} tours` : ''}`, dn: x.dn, qte: 1, fabricant: x.ref ? fab : '', reference: refs.join(' '), dp: x.dp / 1000 }); });
    (v.robinetterie || []).filter(x => x.type !== 'equilibrage').forEach(x => { const [fab, ...refs] = String(x.ref || '').split(/\s+/);
      add({ rep: x.rep, circuit: x.troncon, famille: 'Robinetterie', designation: x.lib, dn: x.dn, qte: x.qte, fabricant: x.fiche ? x.fiche.fabricant || '' : x.ref ? fab : '', reference: x.fiche ? x.fiche.reference || '' : refs.join(' '), fiche: x.fiche ? x.fiche.nom || '✓' : '', dp: x.dpTot }); });
    (v.troncons || []).forEach(t => { const tb = (typeof Calculs !== 'undefined' ? Calculs : require('./calculs')).tube(t.serie, t.tube); if (tb && t.L > 0) add({ rep: t.rep, circuit: t.rep, famille: 'Tuyauterie', designation: `Tube ${tb.nom} (aller + retour)`, dn: tb.dn, qte: Math.round(t.L * 10) / 10, unite: 'ml' }); });
    void T;
    return out;
  }
  function lignes(et, pid, calc) {
    if (pid.type === 'arbo') return lignesArbo(et, pid, calc);
    const r = calc(pid), v = r.valeurs || {}, e = (calc.entrees ? calc.entrees(pid) : pid.entrees) || {}, out = [];
    let d; try { d = Sc.dimensionner(e); } catch (err) { d = null; }
    const fg = e.fiche || {}, add = o => out.push({ circuit: '', dn: '', unite: 'u', fabricant: '', reference: '', fiche: '', dp: '', ...o });
    if (d) {
      const pac = /^(pac|gf)/.test(e.generateur || '');
      if (!/^echangeur/.test(e.generateur || '')) add({ rep: d.n > 1 ? `${pac ? 'PAC' : 'G'}1 à ${d.n}` : `${pac ? 'PAC' : 'G'}1`, circuit: 'Production', famille: 'Production', designation: `${d.gen[0]} ${nf(d.Pg, 0)} kW`, qte: d.n, fabricant: fg.fabricant || '', reference: fg.reference || '', fiche: fg.nom || (fg.fabricant || fg.reference ? '✓' : '') });
      if (d.ppDeportees) add({ rep: 'PP', circuit: 'Production', famille: 'Pompes', designation: `Pompe primaire ${nf(d.Qg, 2)} m³/h, avec clapet anti-retour`, qte: d.n });
      if (d.bouteille && d.tb) add({ rep: 'BD', circuit: 'Production', famille: 'Équipements', designation: `Bouteille de découplage${d.decouplage === 'bouteille3' ? ' 3 piquages' : ''} ${d.tb.nom}`, qte: 1 });
      if (d.echangeur) add({ rep: 'EP', circuit: 'Production', famille: 'Équipements', designation: `Échangeur à plaques ${nf(d.Pdem, 0)} kW (≈ ${nf(d.Aech, 1)} m²)`, qte: 1 });
      if (d.tampon && d.tampon.V > 0) add({ rep: 'BT', circuit: 'Production', famille: 'Équipements', designation: `Ballon tampon ${nf(d.tampon.V, 0)} L${d.tampon.position === 'decouplage' ? ' de découplage (4 piquages)' : d.tampon.position === 'depart' ? ' (sur le départ)' : ' (sur le retour)'}`, qte: 1 });
      if (d.tc) add({ rep: 'COL', circuit: 'Production', famille: 'Équipements', designation: `Collecteurs départ et retour ${d.tc.nom}`, dn: d.tc.dn, qte: 2 });
      if (e.desemboueur !== 'non') add({ rep: 'DS', circuit: 'Production', famille: 'Robinetterie', designation: 'Pot à boue / désemboueur magnétique', dn: d.tc ? d.tc.dn : '', qte: 1 });
      if (e.vase !== 'non') add({ rep: 'VE', circuit: 'Production', famille: 'Équipements', designation: 'Vase d\'expansion, soupape de sécurité, disconnecteur de remplissage (voir note du vase)', qte: 1 });
    }
    (v.circuits || []).forEach((c, i) => {
      const k = `${c.rep}`;
      add({ rep: `PC${i + 1}`, circuit: k, famille: 'Pompes', designation: c.pompe ? `Pompe ${c.pompe.replace(/, vitesse.*/, '')}` : `Pompe ${nf(c.Q, 2)} m³/h × ${nf(c.hmt, 2)} mCE`, qte: 1 });
      if (c.reg !== 'direct') add({ rep: `V${i + 1}`, circuit: k, famille: 'Robinetterie', designation: c.vanne ? `${c.vanne} motorisée` : `Vanne de régulation ${c.reg === '3v' ? '3 voies' : '2 voies'} Kvs ${nf(c.kvs, 1)}`, qte: 1 });
      if (e.compteurs === 'oui') add({ rep: `CE${i + 1}`, circuit: k, famille: 'Robinetterie', designation: 'Compteur d\'énergie', dn: c.dn, qte: 1 });
      (c.rob || []).forEach(x => { const [fab, ...refs] = String(x.ref || '').split(/\s+/); add({ rep: x.rep, circuit: k, famille: 'Robinetterie', designation: x.lib, dn: x.dn, qte: x.qte,
        fabricant: x.fiche ? x.fiche.fabricant || '' : x.ref ? fab : '', reference: x.fiche ? x.fiche.reference || '' : refs.join(' '), fiche: x.fiche ? x.fiche.nom || '✓' : '', dp: x.dpTot }); });
      if (c.L > 0) add({ rep: `T${i + 1}`, circuit: k, famille: 'Tuyauterie', designation: `Tube ${c.tubeNom} (aller + retour)`, dn: c.dn, qte: Math.round(c.L * 10) / 10, unite: 'ml' });
    });
    // Terminaux raccordés aux circuits de ce schéma
    ((et && et.notes) || []).filter(n => n.type === 'terminaux').forEach(n => ((n.entrees || {}).appareils || []).forEach(a => {
      const [id, circ] = String(a.circuit || '').split('|'); if (id !== pid.id) return;
      const T = typeof Terminaux !== 'undefined' ? Terminaux : null, lib = T && T.TYPES[a.type] ? T.TYPES[a.type][0] : a.type, f = a.fiche || {};
      add({ rep: a.rep || '', circuit: circ, famille: 'Terminaux', designation: `${lib}${a.Pch ? ` ${nf(num(a.Pch), 1)} kW` : ''}${a.local ? ` — ${a.local}` : ''}`, qte: Math.max(1, num(a.n, 1)), fabricant: f.fabricant || '', reference: f.reference || a.ref || '', fiche: f.nom || (f.fabricant ? '✓' : '') });
    }));
    return out;
  }
  // Liste d'achat : articles identiques regroupés (désignation, DN, fabricant, référence), quantités additionnées
  function achats(l) {
    const m = new Map();
    l.forEach(x => {
      const des = x.designation.replace(/ — .*$/, ''), k = [x.famille, des, x.dn, x.fabricant, x.reference, x.unite].join('|');
      const o = m.get(k) || { famille: x.famille, designation: des, dn: x.dn, fabricant: x.fabricant, reference: x.reference, unite: x.unite, qte: 0, reps: [] };
      o.qte += Number(x.qte) || 0; if (x.rep) o.reps.push(x.rep); m.set(k, o);
    });
    const ORDRE = ['Production', 'Pompes', 'Équipements', 'Robinetterie', 'Terminaux', 'Tuyauterie'];
    return [...m.values()].sort((a, b) => ORDRE.indexOf(a.famille) - ORDRE.indexOf(b.famille) || a.designation.localeCompare(b.designation, 'fr') || (Number(a.dn) || 0) - (Number(b.dn) || 0));
  }
  // Article de la bibliothèque de Pipe-Fit correspondant à une ligne d'achat : référence exacte, sinon mots de la
  // désignation et DN ; prix d'achat = coût de revient de l'article (dernier prix fournisseur), sinon prix de vente
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'avec', 'pour', 'sur', 'aller', 'retour', 'si', 'autre', 'que', 'celle', 'circuit']);
  function article(x, articles) {
    if (!(articles || []).length) return null;
    const ref = norm(x.reference);
    if (ref) { const a = articles.find(y => norm(y.ref) === ref || (ref.length > 3 && norm(`${y.designation} ${y.ref}`).includes(ref))); if (a) return { a, score: 10 }; }
    const mots = norm(x.designation.replace(/\(.*?\)/g, '')).split(' ').filter(m => m.length > 2 && !MOTS_VIDES.has(m)), dn = x.dn ? String(x.dn) : '';
    let best = null;
    articles.forEach(y => {
      const t = ` ${norm(`${y.designation} ${y.ref || ''} ${y.famille || ''}`)} `, n = mots.filter(m => t.includes(` ${m}`)).length;
      if (dn && !new RegExp(`\\b(dn ?${dn}|${dn} ?mm)\\b`).test(t)) return;
      const sc = n / Math.max(2, mots.length);
      if (sc >= 0.5 && (!best || sc > best.score)) best = { a: y, score: sc };
    });
    return best;
  }
  function prixAchats(liste, articles) {
    return liste.map(x => { const m = article(x, articles), pu = m ? Number(m.a.coutRevient) || Number(m.a.prixVente) || 0 : 0;
      return { ...x, articleId: m ? m.a.id : '', articleRef: m ? m.a.ref || '' : '', articleDesignation: m ? m.a.designation : '', pu, total: pu * x.qte, certain: !!m && m.score >= 10 }; });
  }
  // Lignes d'une consultation fournisseurs de Pipe-Fit (article de la bibliothèque si trouvé, sinon ligne libre)
  const lignesConsultation = liste => liste.filter(x => x.qte > 0).map(x => ({ articleId: x.articleId || '', designation: `${x.designation}${x.dn ? ` DN ${x.dn}` : ''}${x.fabricant || x.reference ? ` — ${[x.fabricant, x.reference].filter(Boolean).join(' ')}` : ''}`.slice(0, 200),
    unite: x.unite || 'u', qte: Math.round(x.qte * 100) / 100 }));
  // Feuilles du classeur : nomenclature par circuit, liste d'achat (prix de la bibliothèque si fournie)
  function feuilles(et, pid, calc, articles) {
    const l = lignes(et, pid, calc), a = prixAchats(achats(l), articles);
    return [
      { name: 'Nomenclature', entetes: ['Repère', 'Circuit', 'Famille', 'Désignation', 'DN', 'Qté', 'Unité', 'Fabricant', 'Référence', 'Fiche technique', 'ΔP (kPa)'],
        lignes: l.map(x => [x.rep, x.circuit, x.famille, x.designation, x.dn ? `DN ${x.dn}` : '', x.qte, x.unite, x.fabricant, x.reference, x.fiche, x.dp === '' ? '' : Math.round(x.dp * 100) / 100]) },
      { name: 'Liste d\'achat', entetes: ['Famille', 'Désignation', 'DN', 'Fabricant', 'Référence', 'Qté', 'Unité', 'Repères', 'Article de la bibliothèque', 'Prix unitaire HT', 'Total HT'],
        lignes: [...a.map(x => [x.famille, x.designation, x.dn ? `DN ${x.dn}` : '', x.fabricant, x.reference, Math.round(x.qte * 10) / 10, x.unite, x.reps.join(', ').slice(0, 200),
          x.articleId ? `${x.articleRef ? `${x.articleRef} — ` : ''}${x.articleDesignation}`.slice(0, 120) : 'à chiffrer', x.pu ? { v: x.pu, s: 'eur' } : '', x.pu ? { v: Math.round(x.total * 100) / 100, s: 'eur' } : '']),
          ['', 'Total des articles chiffrés', '', '', '', '', '', '', `${a.filter(x => x.pu).length} / ${a.length} article(s)`, '', { v: Math.round(a.reduce((s, x) => s + x.total, 0) * 100) / 100, s: 'eur' }]] }];
  }
  return { lignes, achats, feuilles, article, prixAchats, lignesConsultation };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Nomenclature;
