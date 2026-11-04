// Pompes contrôlées sur la courbe du fabricant : courbe débit / hauteur (saisie « Q:H ; … » ou lue sur la fiche technique),
// point de fonctionnement sur la courbe du réseau (H = Hd × (Q / Qd)²), écart au débit demandé, vitesse de réglage d'une
// pompe à vitesse variable (lois de similitude), puissance absorbée si la courbe P1 est donnée. Module pur.
const Pompes = (() => {
  const n = x => Number(String(x).replace(',', '.'));
  // « Q:H ; Q:H … » (m³/h : mCE), éventuellement « Q:H:P1 » (W)
  function lireCourbe(txt) {
    return String(txt || '').split(/[;|\n]+/).map(p => p.trim().split(/\s*[:=/]\s*|\s+/).map(n)).filter(p => p.length >= 2 && p.slice(0, 2).every(Number.isFinite) && p[0] >= 0 && p[1] >= 0)
      .map(p => ({ Q: p[0], H: p[1], P: Number.isFinite(p[2]) ? p[2] : null })).sort((a, b) => a.Q - b.Q);
  }
  const ecrire = c => c.map(p => `${String(p.Q).replace('.', ',')}:${String(p.H).replace('.', ',')}${p.P !== null && p.P !== undefined ? `:${String(p.P).replace('.', ',')}` : ''}`).join(' ; ');
  const interp = (c, Q, k = 'H') => {
    if (!c.length || Q < c[0].Q - 1e-9 || Q > c[c.length - 1].Q + 1e-9) return null;
    for (let i = 1; i < c.length; i++) if (Q <= c[i].Q + 1e-9) { const a = c[i - 1], b = c[i]; if (a[k] === null || b[k] === null) return null; return b.Q === a.Q ? b[k] : a[k] + (b[k] - a[k]) * (Q - a.Q) / (b.Q - a.Q); }
    return c[0][k];
  };
  // Point de fonctionnement : intersection de la courbe de la pompe et de la courbe du réseau passant par (Qd, Hd)
  function point(courbe, Qd, Hd) {
    const c = Array.isArray(courbe) ? courbe : lireCourbe(courbe);
    if (c.length < 2 || !(Qd > 0) || !(Hd > 0)) return null;
    const f = Q => interp(c, Q) - Hd * (Q / Qd) ** 2, Qmax = c[c.length - 1].Q;
    let a = 0, b = null;
    for (let i = 1; i <= 400; i++) { const Q = Qmax * i / 400; if (f(Q) <= 0) { b = Q; a = Qmax * (i - 1) / 400; break; } }
    const hp = interp(c, Qd), r = { courbe: c, Qd, Hd, Hpompe: hp };
    if (b === null) Object.assign(r, { Q: Qmax, H: interp(c, Qmax), horsCourbe: true });
    else { for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; } r.Q = (a + b) / 2; r.H = interp(c, r.Q); }
    r.ecart = (r.Q - Qd) / Qd * 100;
    r.ok = hp !== null && hp >= Hd * 0.98;
    // Vitesse variable : s tel que s² · H(Qd / s) = Hd (lois de similitude)
    const g = s => { const h = interp(c, Qd / s); return h === null ? null : s * s * h - Hd; };
    if (r.ok) { let lo = 0.3, hi = 1; if (g(lo) !== null && g(lo) > 0) r.vitesse = 30; else { for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2, v = g(m); if (v === null || v < 0) lo = m; else hi = m; } r.vitesse = Math.round(hi * 1000) / 10; } }
    const P = interp(c, r.Q, 'P'); r.P1 = P;
    return r;
  }
  // Courbe sur la fiche technique : ligne des débits (Q, m³/h) suivie d'une ligne des hauteurs (H, m) de même longueur
  function lireFiche(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String), nombres = l => (l.match(/\d+(?:[.,]\d+)?/g) || []).map(n);
    const nrm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let i = 0; i < L.length; i++) {
      const x = nrm(L[i]); if (!/\bq\b|debit/.test(x) || !/m3\/h|m³\/h|m3h/.test(x.replace('³', '3'))) continue;
      const q = nombres(L[i].replace(/m[³3]\/h/gi, ''));
      for (let j = i + 1; j <= i + 3 && j < L.length; j++) {
        const y = nrm(L[j]); if (!/\bh\b|hauteur|hmt/.test(y)) continue;
        const h = nombres(L[j].replace(/mce|\bm\b/gi, ''));
        if (q.length >= 3 && h.length === q.length && q.every((v, k) => !k || v > q[k - 1])) {
          let p = null; const z = L[j + 1] && /\bp1\b|puissance/.test(nrm(L[j + 1])) ? nombres(L[j + 1].replace(/\bp1\b|kw|w/gi, '')) : null;
          if (z && z.length === q.length) p = z.map(v => (/kw/i.test(L[j + 1]) ? v * 1000 : v));
          return ecrire(q.map((v, k) => ({ Q: v, H: h[k], P: p ? p[k] : null })));
        }
      }
    }
    return '';
  }
  return { lireCourbe, ecrire, point, lireFiche, interp };
})();
if (typeof module !== 'undefined') module.exports = Pompes;
