// Mise à jour des anciennes études après le passage des valeurs réglementaires dans les Réglages.
// Les champs des calculs annexes qui portaient un défaut en dur (débit de parking par véhicule 600 m³/h, seuils CO / NO₂,
// air neuf par baigneur, coefficient de Koestel, seuils de chaufferie et ICPE) sont désormais vides par défaut (« vide :
// Réglages ») ; les notes enregistrées avant gardent la valeur explicite et ne suivent donc pas une surcharge des Réglages.
// detecter() liste ces champs (étude, note, champ, ancienne → nouvelle valeur) : seulement ceux dont la valeur est
// exactement l'ancien défaut (une valeur réellement saisie, différente, n'est jamais proposée) ; appliquer() les vide
// (le calcul suit alors les Réglages) ou y écrit la valeur des Réglages. Module pur (navigateur, node, tests).
const MajValeurs = (() => {
  // [type de note, champ, clé des valeurs réglementaires, défaut historique du champ (avant les Réglages)]
  const CHAMPS = [
    ['parking', 'qPlace', 'parking.qPlace', 600], ['parking', 'coPV', 'parking.coPV', 20], ['parking', 'coGV', 'parking.coGV', 50], ['parking', 'coAl', 'parking.coAl', 100],
    ['parking', 'noPV', 'parking.noPV', 0.5], ['parking', 'noGV', 'parking.noGV', 1], ['parking', 'noAl', 'parking.noAl', 1],
    ['piscine', 'qBaigneur', 'piscine.qBaigneur', 22], ['confort', 'cKoestel', 'jet.cKoestel', 0.42],
    ['chaufferie', 'sChauff', 'chaufferie.seuil', 70], ['chaufferie', 'sIcpeDC', 'icpe.dc', 1000], ['chaufferie', 'sIcpeE', 'icpe.e', 20000], ['chaufferie', 'sIcpeA', 'icpe.a', 50000],
  ].map(([type, champ, cle, ancien]) => ({ type, champ, cle, ancien }));
  const VR_ = () => (typeof ValeursRegl !== 'undefined' ? ValeursRegl : (() => { try { return require('./valeurs-regl'); } catch (e) { return null; } })());
  // Nombre saisi (nombre, ou texte « 600 », « 0,5 ») ; vide ou texte libre : NaN
  const lire = x => (typeof x === 'number' ? x : typeof x === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(x) ? Number(x.replace(',', '.')) : NaN);
  const egal = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

  // Champs à mettre à jour dans les études. tous : aussi ceux dont la valeur des Réglages est égale à l'ancien défaut
  // (les vider ne change pas le résultat, le champ suivra seulement les prochaines modifications des Réglages).
  // Les modèles d'étude sont inclus (une étude créée depuis un modèle en reprendrait l'ancienne valeur).
  function detecter(etudes, { tous = false, valeur } = {}) {
    const VR = VR_(), v = valeur || (cle => (VR ? VR.v(cle) : undefined));
    const out = [];
    (etudes || []).forEach(et => (et && Array.isArray(et.notes) ? et.notes : []).forEach(n => {
      if (!n || !n.entrees) return;
      CHAMPS.filter(c => c.type === n.type).forEach(c => {
        const x = lire(n.entrees[c.champ]);
        if (!egal(x, c.ancien)) return; // vide, ou valeur réellement saisie : on n'y touche pas
        const nouvelle = v(c.cle), differe = Number.isFinite(nouvelle) && !egal(nouvelle, c.ancien);
        if (!differe && !tous) return;
        const d = VR && VR.DEFS[c.cle];
        out.push({ etudeId: et.id, etude: et.objet || et.titre || et.id, modele: !!et.modele, noteId: n.id, note: n.titre || n.type, type: n.type, champ: c.champ, cle: c.cle,
          libelle: d ? d.libelle : c.champ, unite: d ? d.unite : '', ancienne: n.entrees[c.champ], nouvelle, differe });
      });
    }));
    return out;
  }
  // Applique les lignes retenues : mode « vider » (le champ suit les Réglages) ou « valeur » (valeur des Réglages écrite).
  // Une ligne n'est appliquée que si le champ vaut toujours l'ancien défaut (une saisie entre-temps est respectée).
  // Retourne { n, etudes } : nombre de champs changés et études modifiées (à enregistrer).
  function appliquer(etudes, lignes, mode = 'vider') {
    const modifiees = new Set();
    let n = 0;
    (lignes || []).forEach(l => {
      const et = (etudes || []).find(e => e && e.id === l.etudeId), note = et && (et.notes || []).find(x => x && x.id === l.noteId);
      const c = CHAMPS.find(x => x.type === (note && note.type) && x.champ === l.champ);
      if (!c || !note.entrees || !egal(lire(note.entrees[c.champ]), c.ancien)) return;
      if (mode === 'valeur') { if (!Number.isFinite(l.nouvelle) || egal(l.nouvelle, c.ancien)) return; note.entrees[c.champ] = l.nouvelle; } else note.entrees[c.champ] = '';
      n++; modifiees.add(et);
    });
    return { n, etudes: [...modifiees] };
  }
  return { CHAMPS, detecter, appliquer };
})();
if (typeof module !== 'undefined') module.exports = MajValeurs;
