// Photo de la plaque signalétique → registre des équipements : le modèle lu sur la plaque (fabricant, référence, n° de
// série) est comparé au modèle retenu (matériel retenu de l'étude, registre) : confirmation s'il est le même, alerte de
// substitution s'il diffère. Le n° de série, la date de pose et de mise en service complètent le registre de l'étude
// (et.equipements[].installes) et la fiche équipement du DOE. Module commun CRM / Études / DOE / tests (pur).
const PlaqueRegistre = (() => {
  const txt = (v, k = 120) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k);
  // Comparaison sans accents, casse, espaces ni ponctuation (« Wilo-Stratos 40/1-8 » = « WILO STRATOS 40 1 8 »)
  const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  // Même désignation : égales, ou l'une contient l'autre (au moins 4 caractères : « MAGNA3 40-120 F » / « Magna3 40-120 F 220 »)
  function meme(a, b) {
    const x = cle(a), y = cle(b);
    if (!x || !y) return null;
    if (x === y) return true;
    const [c, l] = x.length <= y.length ? [x, y] : [y, x];
    return c.length >= 4 && l.includes(c);
  }
  // Référence lue qui commence par la marque (« Grundfos Magna3 40-120 ») : marque retirée avant la comparaison
  const sansMarque = (ref, marque) => { const m = cle(marque), r = String(ref || ''); if (!m) return r; const i = cle(r).indexOf(m); return i === 0 ? r.replace(new RegExp(`^\\s*${String(marque).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '') : r; };

  // retenu : { fabricant, reference } ; lu : { marque, modele } → { etat, fabricant, reference, texte }
  // etat : 'conforme' (même modèle), 'partiel' (une seule donnée lue, concordante), 'substitution' (différent), 'nonLu'
  function comparer(retenu, lu) {
    const r = retenu || {}, l = lu || {}, marque = txt(l.marque || l.fabricant, 80), modele = txt(l.modele || l.reference, 120);
    const f = marque && r.fabricant ? meme(r.fabricant, marque) : null;
    const ref = modele && r.reference ? meme(sansMarque(r.reference, r.fabricant), sansMarque(modele, marque || r.fabricant)) : null;
    const etat = f === false || ref === false ? 'substitution' : f === null && ref === null ? 'nonLu' : f && ref ? 'conforme' : 'partiel';
    const lib = [marque, modele].filter(Boolean).join(' '), ret = [r.fabricant, r.reference].filter(Boolean).join(' ');
    const texte = etat === 'substitution' ? `Plaque : « ${lib} » au lieu du modèle retenu « ${ret} » (${[f === false && 'fabricant', ref === false && 'référence'].filter(Boolean).join(' et ')} différent${f === false && ref === false ? 's' : ''}) : substitution à faire valider`
      : etat === 'conforme' ? `Plaque conforme au modèle retenu (${ret})` : etat === 'partiel' ? `Plaque : ${f ? 'fabricant' : 'référence'} conforme, ${f ? 'référence' : 'fabricant'} non lu${f ? 'e' : ''} — à vérifier` : 'Plaque non lue : comparer à la main';
    return { etat, fabricant: f, reference: ref, lu: lib, retenu: ret, texte };
  }

  // Extra de l'action « photo » du suivi (Pipe-Fit) à partir de la lecture de la plaque (Fluides.lirePlaque)
  const extraPhoto = p => Object.fromEntries([['serie', txt(p && p.numeroSerie, 60)], ['marqueLue', txt(p && p.marque, 80)], ['modeleLu', txt(p && p.modele, 120)]].filter(([, v]) => v));

  /* ---------- Registre de l'étude ---------- */
  // Le registre (et.equipements) décrit chaque modèle une fois ; les unités posées sur le chantier y sont ajoutées
  // (installes : [{ cle, designation, serie, poseLe, mesLe, plaque, etat }]) d'après le suivi du matériel retenu.
  // lignes : matériel retenu de l'étude (MaterielRetenu.lignes) ; suivis : suivi Pipe-Fit [{ cle, serie, poseLe, mesLe, plaque }]
  // Renvoie { maj, alertes, confirmations, sansModele } ; une plaque différente n'est jamais reportée comme le modèle du registre.
  function versRegistre(et, lignes, suivis) {
    const eqs = (et && et.equipements) || [], out = { maj: 0, alertes: [], confirmations: [], sansModele: [] };
    (suivis || []).forEach(s => {
      const l = (lignes || []).find(x => x.cle === s.cle);
      if (!l || !(s.serie || s.poseLe || s.mesLe || s.plaque)) return;
      const c = s.plaque ? comparer(l, s.plaque) : null;
      if (c && c.etat === 'substitution') out.alertes.push({ cle: l.cle, designation: l.designation, ...c });
      else if (c && c.etat === 'conforme') out.confirmations.push({ cle: l.cle, designation: l.designation, ...c });
      const x = eqs.find(e => e && meme(e.fabricant, l.fabricant) !== false && meme(e.reference, l.reference) === true);
      if (!x) { out.sansModele.push({ cle: l.cle, designation: l.designation }); return; }
      const u = { cle: txt(l.cle, 200), designation: txt(l.designation), serie: txt(s.serie, 60), poseLe: txt(s.poseLe, 10), mesLe: txt(s.mesLe, 10),
        ...(s.plaque ? { plaque: [txt(s.plaque.marque, 80), txt(s.plaque.modele, 120)].filter(Boolean).join(' '), etat: c.etat } : {}) };
      const ex = (x.installes || []).find(y => y.cle === u.cle), avant = JSON.stringify(ex || null);
      if (ex) Object.keys(u).forEach(k => { if (u[k]) ex[k] = u[k]; }); else x.installes = [...(x.installes || []), u].slice(-200);
      if (JSON.stringify((x.installes || []).find(y => y.cle === u.cle)) !== avant) out.maj++;
    });
    return out;
  }
  // Fiche équipement du DOE : plaque lue et comparaison (suivi du chantier) → champs complétés
  function ficheDoe(e, m) {
    if (!m) return 0;
    let n = 0;
    const mettre = (k, v) => { if (v && e[k] !== v) { e[k] = v; n++; } };
    if (!e.serie) mettre('serie', txt(m.serie, 60));
    mettre('pose', txt(m.poseLe, 10)); mettre('miseEnService', txt(m.mesLe, 10));
    if (m.plaque) { const c = comparer(m, m.plaque); mettre('plaqueLue', c.lu); mettre('plaqueEtat', c.etat); }
    return n;
  }
  return { cle, meme, comparer, extraPhoto, versRegistre, ficheDoe };
})();
if (typeof module !== 'undefined') module.exports = PlaqueRegistre;
