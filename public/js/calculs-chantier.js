// Calculs de chantier dans l'appli des compagnons (onglet « Calculs ») : débit ↔ puissance, perte de charge et diamètre,
// vase d'expansion, dilatation. Même moteur et mêmes données que l'application Études (js/etudes/), disponibles sans réseau.
const CalculsChantier = (() => {
  const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const num = (v, def = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : def; };
  const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const OUTILS = [['debit', '💧', 'Débit et puissance', 'Débit d\'un circuit d\'après sa puissance, ou l\'inverse'],
    ['pdc', '📏', 'Perte de charge et diamètre', 'Vitesse et perte de charge d\'un tube, diamètre conseillé'],
    ['vase', '🫙', 'Vase d\'expansion', 'Volume du vase, pression de gonflage et de remplissage'],
    ['dilatation', '🔥', 'Dilatation', 'Allongement d\'une ligne et longueur du bras flexible']];
  // Saisies conservées pendant la session (on passe d'un calcul à l'autre sans tout ressaisir)
  const S = {
    debit: { sens: 'puissance', P: 50, Q: 2, dT: 20, fluide: 'eau', T: 60 },
    pdc: { Q: 2, serie: 'acier-10255', tube: '', L: 30, zeta: 5, fluide: 'eau', T: 60 },
    vase: { V: 500, Tmin: 10, Tmax: 80, Hst: 10, Psv: 3, fluide: 'eau' },
    dilatation: { serie: 'acier-10255', tube: '', L: 30, Tpose: 10, Tmax: 90 },
  };
  const disponible = () => typeof Calculs !== 'undefined' && typeof Donnees !== 'undefined';
  const fluides = () => [['eau', 'Eau'], ...Object.entries(Donnees.GLYCOLS).map(([k, g]) => [k, g.libelle])];
  const series = () => Object.entries(Donnees.SERIES).map(([k, s]) => [k, s.libelle]);
  const opts = (liste, v) => liste.map(([k, l]) => `<option value="${e(k)}" ${String(k) === String(v) ? 'selected' : ''}>${e(l)}</option>`).join('');
  const champ = (id, label, v, unite, attrs = '') => `<div class="field"><label for="cc-${id}">${e(label)}${unite ? ` (${e(unite)})` : ''}</label><input id="cc-${id}" data-cc="${id}" type="number" inputmode="decimal" step="any" value="${e(v)}" ${attrs}></div>`;
  const liste = (id, label, choix, v) => `<div class="field"><label for="cc-${id}">${e(label)}</label><select id="cc-${id}" data-cc="${id}" class="big-select">${opts(choix, v)}</select></div>`;
  const carte = (lib, val, sous = '') => `<div class="card"><div class="label">${e(lib)}</div><div class="value">${val}</div>${sous ? `<div class="sub">${sous}</div>` : ''}</div>`;
  const message = (niveau, t) => `<p class="small" style="margin:0;padding:8px 10px;border-radius:6px;background:${niveau === 'ok' ? '#dcfce7' : niveau === 'erreur' ? '#fee2e2' : '#fef3c7'}">${e(t)}</p>`;

  /* ---------- Calculs ---------- */
  const fluide = s => Calculs.liquide(s.fluide, num(s.T, 20));
  function debit(s) {
    const f = fluide(s), dT = num(s.dT);
    if (!(dT > 0)) return { erreur: 'Écart de température à saisir (départ − retour).' };
    if (s.sens === 'puissance') { const Q = num(s.P) * 1000 / (f.rho * f.cp * dT) * 3600; return { Q, P: num(s.P), f }; }
    const P = num(s.Q) / 3600 * f.rho * f.cp * dT / 1000; return { Q: num(s.Q), P, f };
  }
  function pdc(s) {
    const f = fluide(s), tubes = Calculs.tubes(s.serie), ser = Donnees.SERIES[s.serie], qv = num(s.Q) / 3600;
    const ec = t => Calculs.ecoulement(qv, t.di / 1000, f.rho, f.mu, ser.rugosite);
    const conseille = tubes.find(t => { const r = ec(t); return r.v <= 1.5 && r.R <= 150; }) || tubes[tubes.length - 1];
    const t = tubes.find(x => x.cle === s.tube) || conseille, r = ec(t), dp = r.R * num(s.L) + num(s.zeta) * r.pd;
    return { t, conseille, v: r.v, R: r.R, dp, mce: dp / (f.rho * Calculs.G), f };
  }
  function vase(s) {
    if (!(num(s.V) > 0)) return { erreur: 'Volume d\'eau de l\'installation à saisir.' };
    if (num(s.Tmax) <= num(s.Tmin)) return { erreur: 'La température maximale doit dépasser la température de remplissage.' };
    return Calculs.vaseExpansion({ Vinst: num(s.V), Tmin: num(s.Tmin), Tmax: num(s.Tmax), Hst: num(s.Hst), Psv: num(s.Psv, 3), fluide: s.fluide });
  }
  function dilatation(s) {
    const ser = Donnees.SERIES[s.serie], m = Donnees.MATERIAUX[ser.materiau], t = Calculs.tubes(s.serie).find(x => x.cle === s.tube) || Calculs.tubes(s.serie)[3] || Calculs.tubes(s.serie)[0];
    const dL = m.alpha * num(s.L) * 1000 * Math.abs(num(s.Tmax) - num(s.Tpose)), metal = !m.C;
    const Lb = metal ? Math.sqrt(3 * m.E * t.de * dL / m.sigma) : m.C * Math.sqrt(t.de * dL);
    return { dL, Lb, t, m, metal };
  }

  /* ---------- Écrans ---------- */
  function formulaire(id) {
    const s = S[id];
    const fl = [liste('fluide', 'Fluide', fluides(), s.fluide), ...(id === 'vase' ? [] : [champ('T', 'Température moyenne', s.T, '°C')])].join('');
    const tubesDe = sv => [['', id === 'pdc' ? 'Diamètre conseillé' : 'Choisir le tube'], ...Calculs.tubes(sv).map(t => [t.cle, t.nom])];
    if (id === 'debit') return `${liste('sens', 'Je connais', [['puissance', 'La puissance → débit'], ['debit', 'Le débit → puissance']], s.sens)}
      <div class="grid2">${s.sens === 'puissance' ? champ('P', 'Puissance', s.P, 'kW') : champ('Q', 'Débit', s.Q, 'm³/h')}${champ('dT', 'Écart départ − retour', s.dT, 'K')}</div><div class="grid2">${fl}</div>`;
    if (id === 'pdc') return `<div class="grid2">${champ('Q', 'Débit', s.Q, 'm³/h')}${champ('L', 'Longueur (aller + retour)', s.L, 'm')}</div>
      ${liste('serie', 'Tube', series(), s.serie)}${liste('tube', 'Diamètre', tubesDe(s.serie), s.tube)}
      <div class="grid2">${champ('zeta', 'Somme des ζ (coudes, tés, vannes)', s.zeta, '')}${champ('T', 'Température', s.T, '°C')}</div>${liste('fluide', 'Fluide', fluides(), s.fluide)}`;
    if (id === 'vase') return `<div class="grid2">${champ('V', 'Volume d\'eau de l\'installation', s.V, 'L')}${champ('Hst', 'Hauteur entre le vase et le point haut', s.Hst, 'm')}</div>
      <p class="small muted" style="margin:0">Repères : ≈ 10 L/kW radiateurs acier, 6 L/kW radiateurs alu, 15 à 20 L/kW plancher chauffant, plus le volume des tubes et ballons.</p>
      <div class="grid2">${champ('Tmin', 'Température de remplissage', s.Tmin, '°C')}${champ('Tmax', 'Température maximale', s.Tmax, '°C')}</div>
      <div class="grid2">${champ('Psv', 'Tarage de la soupape', s.Psv, 'bar')}${liste('fluide', 'Fluide', fluides(), s.fluide)}</div>`;
    return `${liste('serie', 'Tube', series(), s.serie)}${liste('tube', 'Diamètre', tubesDe(s.serie), s.tube || (Calculs.tubes(s.serie)[3] || {}).cle)}
      <div class="grid2">${champ('L', 'Longueur entre points fixes', s.L, 'm')}${champ('Tpose', 'Température à la pose', s.Tpose, '°C')}</div>${champ('Tmax', 'Température de service', s.Tmax, '°C')}`;
  }
  function resultats(id) {
    const s = S[id];
    try {
      if (id === 'debit') { const r = debit(s); if (r.erreur) return message('erreur', r.erreur);
        return `<div class="grid2">${carte('Débit', `${nf(r.Q, 2)} m³/h`, `${nf(r.Q * 1000 / 60, 1)} L/min · ${nf(r.Q / 3.6, 3)} L/s`)}${carte('Puissance', `${nf(r.P, 1)} kW`, `${e(r.f.libelle)} à ${nf(num(s.T), 0)} °C`)}</div>`; }
      if (id === 'pdc') { const r = pdc(s), trop = r.v > 1.5 || r.R > 150;
        return `<div class="grid2">${carte('Vitesse', `${nf(r.v, 2)} m/s`, e(r.t.nom))}${carte('Perte de charge linéique', `${nf(r.R, 0)} Pa/m`, `${nf(r.R / 10, 1)} mmCE/m`)}</div>
          ${carte('Perte de charge du tronçon', `${nf(r.dp / 1000, 2)} kPa`, `${nf(r.mce, 2)} mCE · ${nf(r.dp / 1e5, 3)} bar`)}
          ${message(trop ? 'attention' : 'ok', trop ? `Tube chargé (repère : v ≤ 1,5 m/s et R ≤ 150 Pa/m). Diamètre conseillé : ${r.conseille.nom}.` : `Diamètre correct. Diamètre conseillé : ${r.conseille.nom}.`)}`; }
      if (id === 'vase') { const r = vase(s); if (r.erreur) return message('erreur', r.erreur);
        return `<div class="grid2">${carte('Vase à installer', r.choisi ? `${nf(r.choisi, 0)} L` : '—', `volume utile calculé ${nf(r.Vn, 0)} L`)}${carte('Gonflage du vase (à vide)', `${nf(r.p0, 2)} bar`, 'pression d\'azote avant remplissage')}</div>
          ${carte('Pression de remplissage à froid', Number.isFinite(r.pa) ? `${nf(r.pa, 2)} bar` : '—', `dilatation ${nf(r.Ve, 1)} L + réserve ${nf(r.Vwr, 1)} L`)}
          ${r.choisi ? message('ok', `Pression finale ${nf(r.pe, 2)} bar sous le tarage de la soupape (${nf(num(s.Psv), 1)} bar).`) : message('erreur', 'Pas de vase du commerce assez grand : plusieurs vases en parallèle ou soupape plus haute (voir le bureau d\'études).')}`; }
      const r = dilatation(s);
      return `<div class="grid2">${carte('Allongement', `${nf(r.dL, 1)} mm`, `${e(r.m.libelle)}, ${e(r.t.nom)}`)}${carte('Bras flexible (L ou Z)', `${nf(r.Lb / 1000, 2)} m`, r.metal ? `lyre en U ≈ ${nf(r.Lb / 2500, 2)} × ${nf(r.Lb / 5000, 2)} m` : 'règles de pose du fabricant')}</div>
        ${message(r.dL > 50 ? 'attention' : 'ok', r.dL > 50 ? 'Dilatation importante : lyres ou compensateurs guidés à voir avec le bureau d\'études.' : 'Laisser le bras libre (colliers coulissants, pas de point fixe sur le bras).')}`;
    } catch (err) { return message('erreur', err.message); }
  }
  function ecran(u, sous) {
    const tete = `<div class="pointage"><h1>Calculs de chantier</h1>${typeof pointageTabs === 'function' ? pointageTabs('calculs', u.id) : ''}`;
    if (!disponible()) return `${tete}<p class="muted">Calculs indisponibles : recharger l'appli avec du réseau.</p></div>`;
    const o = OUTILS.find(x => x[0] === sous);
    if (!o) return `${tete}<p class="muted small" style="margin:0">Ordres de grandeur pour le chantier, avec le moteur de calcul du bureau d'études. Les notes de calcul du dossier font foi.</p>
      ${OUTILS.map(([k, ico, t, d]) => `<a class="card" href="#/pointage/calculs/${k}" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit"><span style="font-size:28px">${ico}</span><span><strong>${e(t)}</strong><br><span class="small muted">${e(d)}</span></span></a>`).join('')}</div>`;
    return `${tete}<p style="margin:0"><a href="#/pointage/calculs">← Tous les calculs</a></p><h2>${o[1]} ${e(o[2])}</h2>
      <div class="card" id="cc-form">${formulaire(sous)}</div><div id="cc-res" style="display:grid;gap:10px">${resultats(sous)}</div></div>`;
  }
  function brancher(root, sous) {
    const s = S[sous];
    if (!s) return;
    const form = root.querySelector('#cc-form');
    form.addEventListener('input', ev => { const k = ev.target.dataset.cc; if (!k || ev.target.tagName === 'SELECT') return; s[k] = ev.target.value; root.querySelector('#cc-res').innerHTML = resultats(sous); });
    form.addEventListener('change', ev => {
      const k = ev.target.dataset.cc; if (!k || ev.target.tagName !== 'SELECT') return;
      s[k] = ev.target.value;
      if (k === 'serie') s.tube = '';
      if (['serie', 'sens'].includes(k)) { form.innerHTML = formulaire(sous); }
      root.querySelector('#cc-res').innerHTML = resultats(sous);
    });
  }
  return { ecran, brancher, debit, pdc, vase, dilatation, S, OUTILS };
})();
if (typeof module !== 'undefined') module.exports = CalculsChantier;
