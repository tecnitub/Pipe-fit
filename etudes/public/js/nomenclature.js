// Nomenclature d'une installation (schéma de principe hydraulique) et liste d'achat : générateurs, pompes, vannes de
// régulation, robinetterie et accessoires (avec fabricant, référence et fiche technique), bouteille ou échangeur,
// collecteurs, ballon tampon, tubes par circuit, terminaux raccordés. La liste d'achat regroupe les articles identiques.
// Module pur (navigateur, node, tests).
const Nomenclature = ((N, Sc) => {
  const { nf, num } = N;
  // Lignes : { rep, circuit, famille, designation, dn, qte, unite, fabricant, reference, fiche, dp }
  function lignes(et, pid, calc) {
    const r = calc(pid), v = r.valeurs || {}, e = (calc.entrees ? calc.entrees(pid) : pid.entrees) || {}, out = [];
    let d; try { d = Sc.dimensionner(e); } catch (err) { d = null; }
    const fg = e.fiche || {}, add = o => out.push({ circuit: '', dn: '', unite: 'u', fabricant: '', reference: '', fiche: '', dp: '', ...o });
    if (d) {
      const pac = /^(pac|gf)/.test(e.generateur || '');
      if (!/^echangeur/.test(e.generateur || '')) add({ rep: d.n > 1 ? `${pac ? 'PAC' : 'G'}1 à ${d.n}` : `${pac ? 'PAC' : 'G'}1`, circuit: 'Production', famille: 'Production', designation: `${d.gen[0]} ${nf(d.Pg, 0)} kW`, qte: d.n, fabricant: fg.fabricant || '', reference: fg.reference || '', fiche: fg.nom || (fg.fabricant || fg.reference ? '✓' : '') });
      if (d.pompesInd && (d.bouteille || d.echangeur || d.n > 1)) add({ rep: 'PP', circuit: 'Production', famille: 'Pompes', designation: `Pompe primaire ${nf(d.Qg, 2)} m³/h, avec clapet anti-retour`, qte: d.n });
      if (d.bouteille && d.tb) add({ rep: 'BD', circuit: 'Production', famille: 'Équipements', designation: `Bouteille de découplage ${d.tb.nom}`, qte: 1 });
      if (d.echangeur) add({ rep: 'EP', circuit: 'Production', famille: 'Équipements', designation: `Échangeur à plaques ${nf(d.Pdem, 0)} kW (≈ ${nf(d.Aech, 1)} m²)`, qte: 1 });
      if (d.tampon && d.tampon.V > 0) add({ rep: 'BT', circuit: 'Production', famille: 'Équipements', designation: `Ballon tampon ${nf(d.tampon.V, 0)} L`, qte: 1 });
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
  // Feuilles du classeur : nomenclature par circuit, liste d'achat
  function feuilles(et, pid, calc) {
    const l = lignes(et, pid, calc), a = achats(l);
    return [
      { name: 'Nomenclature', entetes: ['Repère', 'Circuit', 'Famille', 'Désignation', 'DN', 'Qté', 'Unité', 'Fabricant', 'Référence', 'Fiche technique', 'ΔP (kPa)'],
        lignes: l.map(x => [x.rep, x.circuit, x.famille, x.designation, x.dn ? `DN ${x.dn}` : '', x.qte, x.unite, x.fabricant, x.reference, x.fiche, x.dp === '' ? '' : Math.round(x.dp * 100) / 100]) },
      { name: 'Liste d\'achat', entetes: ['Famille', 'Désignation', 'DN', 'Fabricant', 'Référence', 'Qté', 'Unité', 'Repères', 'Fournisseur', 'Prix unitaire HT', 'Total HT'],
        lignes: a.map(x => [x.famille, x.designation, x.dn ? `DN ${x.dn}` : '', x.fabricant, x.reference, Math.round(x.qte * 10) / 10, x.unite, x.reps.join(', ').slice(0, 200), '', '', '']) }];
  }
  return { lignes, achats, feuilles };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Nomenclature;
