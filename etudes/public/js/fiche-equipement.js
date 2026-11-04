// Fiche technique d'un équipement autre qu'une CTA (pompe, vase d'expansion, ballon d'ECS, générateur) : caractéristiques
// lues dans le PDF, champs du calcul remplis, et contrôles ajoutés aux résultats du calcul (point de fonctionnement de la
// pompe, volume et pression du vase, volume du ballon, puissance du générateur). Module pur (navigateur, node, tests).
const FicheEquip = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h').replace(/(\d)\s*m\s*\/\s*h\b/g, '$1 m3/h').replace(/\s+/g, ' ').trim();
  const nb = s => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
  const N = '(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)';
  const apres = (x, cle, unite, fenetre = 60) => { const m = new RegExp(`(?:${cle})[^0-9]{0,${fenetre}}?${N}\\s*(?:${unite})(?![a-z])`).exec(x); return m ? nb(m[1]) : undefined; };
  const TYPES = { reseau: 'pompe', arbo: 'pompe', vase: 'vase', ecs: 'ecs', pid: 'generateur' };

  function lire(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), X = L.map(norm), tout = X.join('\n'), v = {}, src = {};
    const pose = (k, val, i, min, max) => { if (v[k] === undefined && Number.isFinite(val) && val >= min && val <= max) { v[k] = Math.round(val * 1000) / 1000; src[k] = L[i].trim().slice(0, 140); } };
    X.forEach((x, i) => {
      // Pompe : point de fonctionnement (Q et H sur la même ligne), débit et hauteur maximaux, puissance absorbée P1
      const pt = new RegExp(`${N}\\s*m3/h[^0-9]{1,25}${N}\\s*(?:m\\s*ce|mce|m)(?![a-z0-9])`).exec(x);
      if (pt && /point|fonctionnement|duty|nominal|selection|service/.test(x)) { pose('Q', nb(pt[1]), i, 0.05, 5000); pose('H', nb(pt[2]), i, 0.3, 300); }
      if (/max/.test(x)) { pose('Qmax', apres(x, 'debit max\\w*|q ?max', 'm3/h'), i, 0.1, 10000); pose('Hmax', apres(x, 'hmt max\\w*|hauteur max\\w*|h ?max|hauteur manometrique max\\w*', 'm\\s*ce|mce|m'), i, 0.3, 400); }
      if (/debit (?:nominal|de service|au point)/.test(x)) pose('Q', apres(x, 'debit (?:nominal|de service|au point)', 'm3/h'), i, 0.05, 5000);
      if (/(?:hmt|hauteur manometrique|hauteur) (?:nominale|de service|au point)/.test(x)) pose('H', apres(x, '(?:hmt|hauteur manometrique|hauteur) (?:nominale|de service|au point)', 'm\\s*ce|mce|m'), i, 0.3, 300);
      if (/\bp1\b|puissance absorbee|puissance electrique/.test(x)) { const w = apres(x, '\\bp1\\b|puissance absorbee|puissance electrique', 'w'), kw = apres(x, '\\bp1\\b|puissance absorbee|puissance electrique', 'kw'); pose('P1', Number.isFinite(kw) ? kw * 1000 : w, i, 5, 500000); }
      if (/rendement|efficacite|\beta\b/.test(x) && /pompe|hydraulique|global|moteur|\beta\b/.test(x)) pose('rendement', apres(x, 'rendement|efficacite|\\beta\\b', '%'), i, 10, 95);
      // Vase, ballon : volume, pression de gonflage (prégonflage usine), pression maximale de service
      if (/volume|capacite|contenance|litres?\b|\d\s*l\b/.test(x)) { const l = apres(x, 'volume(?: nominal| utile| total)?|capacite|contenance', 'litres?|l\\b') ?? (/(\d{2,5})\s*(?:litres?|l)\b(?!\s*\/)/.exec(x) ? nb(/(\d{2,5})\s*(?:litres?|l)\b(?!\s*\/)/.exec(x)[1]) : undefined); pose('V', l, i, 2, 100000); }
      if (/gonflage|precharge|pre-?pression|pression initiale/.test(x)) pose('p0', apres(x, 'gonflage|precharge|pre-?pression|pression initiale', 'bar'), i, 0.2, 10);
      if (/pression (?:maxi|max|maximale)|pression de service max|\bpn ?\d|pms/.test(x)) { const pn = /\bpn ?(\d{1,2})\b/.exec(x); pose('pmax', apres(x, 'pression (?:maxi|max|maximale)(?: de service| admissible)?|pression de service max\\w*|pms', 'bar') ?? (pn ? nb(pn[1]) : undefined), i, 1, 100); }
      // Générateur, échangeur : puissance nominale (chaud, froid)
      if (/puissance|output|capacity/.test(x) && !/absorbee|electrique|acoustique|sonore|\bp1\b/.test(x)) {
        const kw = apres(x, 'puissance(?: calorifique| thermique| utile| nominale| de chauffage| chaud)?|output|capacity', 'kw');
        if (/froid|frigorifique|refroidissement|cooling/.test(x)) pose('Pfr', kw, i, 0.5, 20000); else pose('P', kw, i, 0.5, 20000);
      }
      if (/scop|cop|rendement (?:utile|saisonnier|pci|pcs)|etas/.test(x) && !/pompe/.test(x)) pose('rendGen', apres(x, 'rendement (?:utile|saisonnier|pci|pcs)|etas', '%'), i, 30, 115);
    });
    // Débit et hauteur sans « point de fonctionnement » : lignes « débit … m3/h », « HMT … m »
    if (v.Q === undefined && v.Qmax === undefined) X.forEach((x, i) => { if (/debit/.test(x) && !/air/.test(x)) pose('Q', apres(x, 'debit', 'm3/h'), i, 0.05, 5000); });
    if (v.H === undefined && v.Hmax === undefined) X.forEach((x, i) => { if (/hmt|hauteur manometrique/.test(x)) pose('H', apres(x, 'hmt|hauteur manometrique', 'm\\s*ce|mce|m'), i, 0.3, 300); });
    let fabricant = '', reference = '';
    try {
      const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
      const a = FT.analyser({ texte: L.join('\n') }); fabricant = a.fabricant || ''; reference = (a.references || [])[0] || '';
      if (!fabricant) { const m = /^\s*([A-Z][A-Z0-9&.-]{2,30})(?:\s|$)/.exec(L[0] || ''); if (m && !/^(FICHE|DOCUMENT|PAGE|POMPE|VASE)$/.test(m[1])) fabricant = m[1]; }
    } catch (e) { /* sans bibliothèque */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length, tout };
  }

  const LIBELLES = { Q: ['Débit au point de fonctionnement', 'm³/h'], H: ['Hauteur au point de fonctionnement', 'mCE'], Qmax: ['Débit maximal', 'm³/h'], Hmax: ['Hauteur maximale', 'mCE'],
    P1: ['Puissance absorbée P1', 'W'], rendement: ['Rendement de la pompe', '%'], V: ['Volume', 'L'], p0: ['Pression de gonflage (usine)', 'bar'], pmax: ['Pression maximale de service', 'bar'],
    P: ['Puissance', 'kW'], Pfr: ['Puissance froid', 'kW'], rendGen: ['Rendement du générateur', '%'] };
  // Champs du calcul remplis par la fiche
  function champs(type, v) {
    const out = [], a = (k, cle, val) => { if (val !== undefined && Number.isFinite(val)) out.push({ k, cle, val: Math.round(val * 100) / 100, libelle: LIBELLES[cle][0], unite: LIBELLES[cle][1] }); };
    const t = TYPES[type];
    if (t === 'pompe') {
      // Rendement : donné par la fiche, sinon ρ·g·Q·H / P1 au point de fonctionnement
      const eta = v.rendement !== undefined ? v.rendement : v.Q && v.H && v.P1 ? Math.min(90, 1000 * 9.81 * v.Q / 3600 * v.H / v.P1 * 100) : undefined;
      if (eta !== undefined) out.push({ k: 'rendement', cle: 'rendement', val: Math.round(eta), libelle: v.rendement !== undefined ? 'Rendement de la pompe' : 'Rendement de la pompe (ρ·g·Q·H / P1)', unite: '%' });
    }
    if (t === 'ecs') a('P', 'P', v.P);
    if (t === 'generateur') { a('Pgen', 'P', v.P); a('PgenF', 'Pfr', v.Pfr); if (v.P1 !== undefined) out.push({ k: 'PelecGen', cle: 'P1', val: Math.round(v.P1 / 10) / 100, libelle: 'Puissance électrique absorbée', unite: 'kW' }); }
    return out;
  }
  // Fiche gardée avec le calcul (contrôles)
  const fiche = (r, nom) => ({ nom: String(nom || '').slice(0, 120), fabricant: r.fabricant, reference: r.reference, ...r.valeurs });
  const fx = (x, d = 1) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { maximumFractionDigits: d }) : '—');
  // Contrôles ajoutés aux résultats du calcul ; v = valeurs du calcul, e = entrées
  function controles(type, f, v, e = {}) {
    if (!f || !v) return [];
    const out = [], al = (niveau, texte) => out.push({ niveau, texte }), nom = [f.fabricant, f.reference].filter(Boolean).join(' ') || 'fiche technique', t = TYPES[type];
    if (t === 'pompe') {
      const Q = type === 'arbo' ? v.Qp : v.Qpompe, H = v.HMT;
      if (Number.isFinite(f.Q) && Number.isFinite(f.H)) {
        const ok = f.Q >= Q * 0.95 && f.H >= H * 0.95;
        al(ok ? 'ok' : 'erreur', `Pompe ${nom} : point de fonctionnement ${fx(f.Q, 2)} m³/h à ${fx(f.H, 2)} mCE pour ${fx(Q, 2)} m³/h à ${fx(H, 2)} mCE calculés${ok ? '' : ' : insuffisant'}.`);
        if (ok && (f.Q > Q * 1.3 || f.H > H * 1.3)) al('attention', `Pompe surdimensionnée de plus de 30 % : régler la vitesse (consigne) ou choisir un modèle plus petit.`);
      } else if (Number.isFinite(f.Qmax) || Number.isFinite(f.Hmax)) {
        const ok = (!Number.isFinite(f.Qmax) || f.Qmax >= Q) && (!Number.isFinite(f.Hmax) || f.Hmax >= H);
        al(ok ? 'ok' : 'erreur', `Pompe ${nom} : plage jusqu'à ${fx(f.Qmax, 1)} m³/h et ${fx(f.Hmax, 1)} mCE pour ${fx(Q, 2)} m³/h à ${fx(H, 2)} mCE calculés${ok ? ' (point à vérifier sur la courbe)' : ' : hors plage'}.`);
      }
      if (Number.isFinite(f.P1) && Number.isFinite(v.Pabs) && v.Pabs > 0) al(Math.abs(f.P1 - v.Pabs) / v.Pabs <= 0.3 ? 'ok' : 'attention', `Puissance absorbée : ${fx(f.P1, 0)} W sur la fiche, ${fx(v.Pabs, 0)} W estimés.`);
    }
    if (t === 'vase') {
      if (Number.isFinite(f.V) && Number.isFinite(v.Vn)) al(f.V >= v.Vn ? 'ok' : 'erreur', `Vase ${nom} : ${fx(f.V, 0)} L pour ${fx(v.Vn, 0)} L de volume nominal calculé${f.V >= v.Vn ? '' : ' : trop petit'}.`);
      if (Number.isFinite(f.pmax) && Number.isFinite(v.pe)) al(f.pmax >= v.pe ? 'ok' : 'erreur', `Pression maximale du vase ${fx(f.pmax, 1)} bar pour ${fx(v.pe, 2)} bar de pression finale${f.pmax >= v.pe ? '' : ' : insuffisante'}.`);
      if (Number.isFinite(f.p0) && Number.isFinite(v.p0) && Math.abs(f.p0 - v.p0) > 0.1) al('attention', `Gonflage usine ${fx(f.p0, 1)} bar : régler à ${fx(v.p0, 2)} bar à la mise en service (vase isolé et vidangé).`);
    }
    if (t === 'ecs' && Number.isFinite(f.V) && Number.isFinite(v.Vb)) al(f.V >= v.Vb ? 'ok' : 'erreur', `Ballon ${nom} : ${fx(f.V, 0)} L pour ${fx(v.Vb, 0)} L de stockage nécessaire${f.V >= v.Vb ? '' : ' : insuffisant'}.`);
    if (t === 'generateur' && Number.isFinite(f.P)) {
      const n = Math.max(1, Number(e.nGen) || 1), tot = f.P * n;
      al(tot >= (v.Pdem || 0) ? 'ok' : 'erreur', `Générateur ${nom} : ${fx(f.P, 0)} kW${n > 1 ? ` × ${n} = ${fx(tot, 0)} kW` : ''} pour ${fx(v.Pdem, 0)} kW de besoin${tot >= (v.Pdem || 0) ? '' : ' : insuffisant'}.`);
    }
    return out;
  }
  const gere = type => !!TYPES[type];
  return { lire, champs, fiche, controles, gere, LIBELLES, TYPES };
})();
if (typeof module !== 'undefined') module.exports = FicheEquip;
