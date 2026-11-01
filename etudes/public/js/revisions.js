// Émissions d'un calcul d'étude (note de calcul, schéma, alimentation électrique…) : chaque émission fige un indice
// (A, B, C…), sa date, son objet, son statut (pour avis, bon pour exécution…), les visas (rédigé, vérifié, approuvé) et
// une copie des données et des résultats ; les modifications d'un indice à l'autre sont relevées donnée par donnée
// (valeurs, lignes ajoutées, retirées ou modifiées, résultats) pour le suivi des modifications et le PDF à cartouche.
// Module commun navigateur / tests.
const Revisions = (() => {
  const STATUTS = ['Pour avis', 'Pour validation', 'Bon pour exécution', 'Pour information', 'Annule et remplace'];
  const suivant = i => (/^[A-Y]$/.test(i) ? String.fromCharCode(i.charCodeAt(0) + 1) : /^\d+$/.test(i) ? String(+i + 1) : `${i}'`);
  const derniere = n => ((n && n.emissions) || []).slice(-1)[0] || null;
  const prochainIndice = n => (derniere(n) ? suivant(derniere(n).indice) : 'A');
  // Copie figée (sans fonctions ni références partagées)
  const figer = x => JSON.parse(JSON.stringify(x ?? null));
  const vide = v => v === '' || v === undefined || v === null;
  const nf = v => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : String(v));
  // Valeur lisible d'une donnée : libellé de la liste de choix, unité
  const lisible = (c, v) => {
    if (vide(v)) return '—';
    if (c.options) { const o = c.options.find(([k]) => String(k) === String(v)); if (o) return String(o[1]); }
    if (typeof v === 'boolean') return v ? 'oui' : 'non';
    return `${nf(v)}${c.u ? ` ${c.u}` : ''}`;
  };
  const egal = (a, b) => (vide(a) && vide(b)) || String(a ?? '') === String(b ?? '');

  // schema : [{ k, l, u, options, rubrique } | { k, l, t: 'lignes', colonnes: [{ k, l, u, options }], rubrique }]
  // → [{ rubrique, libelle, avant, apres, nature: 'modifiée' | 'ajoutée' | 'retirée' }]
  function comparer(schema, avant, apres) {
    const a = avant || {}, b = apres || {}, out = [];
    (schema || []).forEach(c => {
      if (c.t !== 'lignes') {
        if (!egal(a[c.k], b[c.k])) out.push({ rubrique: c.rubrique || '', libelle: c.l, avant: lisible(c, a[c.k]), apres: lisible(c, b[c.k]), nature: 'modifiée', cle: c.k });
        return;
      }
      // Lignes d'une liste : reconnues par leur première colonne (repère), sinon par leur rang
      const cols = c.colonnes || [], k0 = (cols[0] || {}).k, id = (l, i) => (k0 && !vide(l[k0]) ? `r:${String(l[k0])}` : `i:${i}`);
      const la = (a[c.k] || []).map((l, i) => [id(l, i), l]), lb = (b[c.k] || []).map((l, i) => [id(l, i), l]);
      const ma = new Map(la), mb = new Map(lb), nom = (l, i) => (k0 && !vide(l[k0]) ? `« ${l[k0]} »` : `n° ${i + 1}`);
      lb.forEach(([k, l], i) => {
        if (!ma.has(k)) return out.push({ rubrique: c.rubrique || '', libelle: `${c.l} : ligne ${nom(l, i)}`, avant: '—', apres: cols.slice(1, 4).map(col => lisible(col, l[col.k])).filter(x => x !== '—').join(' · ') || 'ajoutée', nature: 'ajoutée', cle: `${c.k}.${k}` });
        const p = ma.get(k);
        cols.forEach(col => { if (!egal(p[col.k], l[col.k])) out.push({ rubrique: c.rubrique || '', libelle: `${c.l} : ligne ${nom(l, i)}, ${col.l}`, avant: lisible(col, p[col.k]), apres: lisible(col, l[col.k]), nature: 'modifiée', cle: `${c.k}.${k}.${col.k}` }); });
      });
      la.forEach(([k, l], i) => { if (!mb.has(k)) out.push({ rubrique: c.rubrique || '', libelle: `${c.l} : ligne ${nom(l, i)}`, avant: cols.slice(1, 4).map(col => lisible(col, l[col.k])).filter(x => x !== '—').join(' · ') || 'présente', apres: '—', nature: 'retirée', cle: `${c.k}.${k}` }); });
    });
    return out;
  }
  // Résultats principaux ([libellé, valeur]) : ce qui a changé
  function comparerResultats(avant, apres) {
    const a = new Map((avant || []).map(([k, v]) => [k, String(v)])), out = [];
    (apres || []).forEach(([k, v]) => { if (a.has(k) && a.get(k) !== String(v)) out.push({ libelle: k, avant: a.get(k), apres: String(v) }); else if (!a.has(k)) out.push({ libelle: k, avant: '—', apres: String(v) }); });
    a.forEach((v, k) => { if (!(apres || []).some(([x]) => x === k)) out.push({ libelle: k, avant: v, apres: '—' }); });
    return out;
  }
  // Objet de la modification proposé : les premières données changées
  function resume(modifs, resultats = [], max = 3) {
    if (!modifs.length && !resultats.length) return '';
    const t = modifs.slice(0, max).map(m => (m.nature === 'modifiée' ? `${m.libelle} : ${m.avant} → ${m.apres}` : `${m.libelle} ${m.nature}`));
    const reste = modifs.length - t.length;
    return `${t.join(' ; ')}${reste > 0 ? ` ; et ${reste} autre(s) modification(s)` : ''}${!modifs.length && resultats.length ? 'Mise à jour des résultats' : ''}`;
  }
  // Modifié depuis la dernière émission (données ou titre) ?
  const modifieDepuis = (n, entrees) => { const d = derniere(n); return !!d && (JSON.stringify(figer(entrees)) !== JSON.stringify(d.entrees) || (n.commentaire || '') !== (d.commentaire || '')); };
  // N° du document : « CH-2026-001-NDC-N03 » (code du chantier, sinon de l'étude)
  const numero = (code, rang) => `${String(code || 'ETU').replace(/\s+/g, '')}-NDC-N${String(rang).padStart(2, '0')}`;
  // Émission : indice, date, objet, statut, visas, copies des données et des résultats, modifications relevées
  function emission(n, { indice, date, objet, statut, redige, verifie, approuve }, entrees, resultats, schema) {
    const d = derniere(n), modifs = d ? comparer(schema, d.entrees, entrees) : [], res = d ? comparerResultats(d.resultats, resultats) : [];
    return { indice: indice || prochainIndice(n), date, objet: objet || (d ? resume(modifs, res) : 'Première émission'), statut: STATUTS.includes(statut) ? statut : STATUTS[0],
      redige: redige || '', verifie: verifie || '', approuve: approuve || '', entrees: figer(entrees), resultats: figer(resultats), commentaire: n.commentaire || '', titre: n.titre || '', modifs, modifsResultats: res, depuis: d ? d.indice : '' };
  }
  return { STATUTS, suivant, derniere, prochainIndice, comparer, comparerResultats, resume, modifieDepuis, numero, emission, figer };
})();
if (typeof module !== 'undefined') module.exports = Revisions;
