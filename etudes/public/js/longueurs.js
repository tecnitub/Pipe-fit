// Longueurs des tronçons reprises des plans : nomenclature de canalisations ou de gaines exportée de Revit (CSV, texte
// tabulé ou Excel) ou dessin DXF (une couche par repère de tronçon). Les longueurs d'un même repère sont additionnées,
// les millimètres convertis en mètres ; seuls les tronçons de même repère sont mis à jour. Module pur.
const Longueurs = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const nombre = v => { const x = Number(String(v ?? '').replace(/\s| /g, '').replace(/[a-z]+$/i, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };

  // Lignes d'un texte CSV / tabulé (séparateur ; tabulation ou virgule, guillemets)
  function csv(texte) {
    const L = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const sep = ['\t', ';', ','].map(s => [s, (L[0] || '').split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    return L.map(l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); });
  }
  // Tableau (lignes de cellules, en-tête compris) : colonnes repère et longueur trouvées d'après l'en-tête
  function depuisTableau(rows) {
    const R = (rows || []).map(r => (r || []).map(c => String(c ?? '')));
    let h = -1, cRep = -1, cL = -1;
    for (let i = 0; i < Math.min(15, R.length) && h < 0; i++) {
      const t = R[i].map(norm), l = t.findIndex(x => /^(longueur|length|long\.?)\b/.test(x)), r = [/^(repere|mark|marque|troncon|identifiant|reference)\b/, /^(commentaires?|comments?|nom|name|description)\b/].map(re => t.findIndex(x => re.test(x))).find(x => x >= 0);
      if (l >= 0 && r !== undefined && r >= 0) { h = i; cL = l; cRep = r; }
    }
    if (h < 0) return { erreur: 'Colonnes « Repère » (ou Commentaires) et « Longueur » introuvables dans l\'en-tête.', parRep: new Map() };
    const entete = norm(R[h][cL]), vals = R.slice(h + 1).map(r => [String(r[cRep] || '').trim(), nombre(r[cL])]).filter(([k, v]) => k && Number.isFinite(v) && v > 0);
    const med = vals.map(x => x[1]).sort((a, b) => a - b)[Math.floor(vals.length / 2)] || 0;
    const div = /\bmm\b/.test(entete) ? 1000 : /\bcm\b/.test(entete) ? 100 : /\(m\)|\bm\b/.test(entete) ? 1 : med > 200 ? 1000 : 1;
    const parRep = new Map();
    vals.forEach(([k, v]) => parRep.set(k, (parRep.get(k) || 0) + v / div));
    return { parRep, lignes: vals.length, colonnes: [R[h][cRep], R[h][cL]], unite: div === 1000 ? 'mm' : div === 100 ? 'cm' : 'm' };
  }
  // DXF : longueur des LINE, LWPOLYLINE et POLYLINE par couche ($INSUNITS : 4 = mm, 5 = cm, 6 = m ; sinon déduit)
  function dxf(texte) {
    const L = String(texte || '').split(/\r?\n/).map(x => x.trim()), paires = [];
    for (let i = 0; i + 1 < L.length; i += 2) paires.push([L[i], L[i + 1]]);
    let unites = 0;
    const iu = paires.findIndex(([c, v]) => c === '9' && v === '$INSUNITS'); if (iu >= 0 && paires[iu + 1]) unites = Number(paires[iu + 1][1]);
    const parCouche = new Map(), add = (c, l) => { if (c && l > 0) parCouche.set(c, (parCouche.get(c) || 0) + l); };
    let ent = null, pts = [], couche = '', ferme = false, x = null;
    const fin = () => {
      if (ent === 'LINE' && pts.length === 2) add(couche, Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], (pts[1][2] || 0) - (pts[0][2] || 0)));
      if ((ent === 'LWPOLYLINE' || ent === 'POLYLINE') && pts.length > 1) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (ferme) l += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]); add(couche, l); }
    };
    paires.forEach(([c, v]) => {
      if (c === '0') {
        if (v === 'VERTEX' && ent === 'POLYLINE') return;
        if (v === 'SEQEND' && ent === 'POLYLINE') { fin(); ent = null; return; }
        if (ent !== 'POLYLINE') fin();
        if (['LINE', 'LWPOLYLINE', 'POLYLINE'].includes(v)) { ent = v; pts = []; couche = ''; ferme = false; } else if (ent !== 'POLYLINE') ent = null;
        return;
      }
      if (!ent) return;
      if (c === '8' && !couche) couche = v;
      else if (c === '70' && (ent === 'LWPOLYLINE' || ent === 'POLYLINE')) ferme = (Number(v) & 1) === 1;
      else if (c === '10') { x = Number(v); }
      else if (c === '20' && x !== null) { pts.push([x, Number(v), 0]); x = null; }
      else if (c === '11') { x = Number(v); }
      else if (c === '21' && x !== null) { pts.push([x, Number(v), 0]); x = null; }
    });
    fin();
    const vals = [...parCouche.values()].sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)] || 0;
    const div = unites === 4 ? 1000 : unites === 5 ? 100 : unites === 6 ? 1 : med > 500 ? 1000 : 1;
    return { parRep: new Map([...parCouche].map(([k, v]) => [k, v / div])), lignes: parCouche.size, colonnes: ['Couche', 'Longueur'], unite: div === 1000 ? 'mm' : div === 100 ? 'cm' : 'm' };
  }
  // Clé lue pour un tronçon : même repère, ou repère en fin de nom (« CVC-EC-A1.2 » pour « A1.2 »)
  const correspond = (cle, rep) => { const a = norm(cle), b = norm(rep); return a === b || (b.length >= 2 && (a.endsWith(`-${b}`) || a.endsWith(`_${b}`) || a.endsWith(` ${b}`))); };
  // Propositions pour les tronçons d'un calcul : [{ i, rep, avant, apres, cle }] ; diviser : aller + retour exportés
  function proposer(troncons, parRep, { diviser = false } = {}) {
    const out = [], utilisees = new Set();
    (troncons || []).forEach((t, i) => {
      const rep = String((t && t.rep) || '').trim(); if (!rep) return;
      const cle = [...parRep.keys()].find(k => norm(k) === norm(rep)) || [...parRep.keys()].find(k => correspond(k, rep));
      if (!cle) return;
      utilisees.add(cle);
      out.push({ i, rep, cle, avant: t.L, apres: Math.round(parRep.get(cle) / (diviser ? 2 : 1) * 10) / 10 });
    });
    return { lignes: out, nonUtilisees: [...parRep.keys()].filter(k => !utilisees.has(k)) };
  }
  return { csv, depuisTableau, dxf, proposer };
})();
if (typeof module !== 'undefined') module.exports = Longueurs;
