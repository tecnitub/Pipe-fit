// Dessins vectoriels de la boutique : pictogrammes des familles de produits et vue isométrique des spools.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Tube vu en relief : trait sombre (contour), trait clair (corps), reflet
  const tube = (d, w = 10) => `<path d="${d}" fill="none" stroke="var(--acier-fonce)" stroke-width="${w + 3}" stroke-linecap="butt" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--acier)" stroke-width="${w}" stroke-linecap="butt" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--reflet)" stroke-width="${Math.max(1.5, w / 4)}" stroke-linecap="butt" stroke-linejoin="round" transform="translate(-1.5 -2)"/>`;
  const bride = (x, y, h = 30, w = 7) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="1.5" fill="var(--acier)" stroke="var(--acier-fonce)" stroke-width="1.5"/>`;

  const PICTOS = {
    tube: () => tube('M10 50 L90 30', 14) + '<ellipse cx="90" cy="30" rx="3.5" ry="8.5" transform="rotate(-14 90 30)" fill="var(--fond-picto)" stroke="var(--acier-fonce)" stroke-width="1.5"/>',
    coude: () => tube('M15 70 L40 70 Q65 70 65 45 L65 15', 14),
    te: () => tube('M10 55 L90 55', 14) + tube('M50 55 L50 15', 14),
    reduction: () => `<path d="M10 40 L45 40 L60 47 L90 47 L90 63 L60 63 L45 70 L10 70 Z" fill="var(--acier)" stroke="var(--acier-fonce)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M12 46 L44 46" stroke="var(--reflet)" stroke-width="3"/>`,
    bride: () => tube('M10 50 L62 50', 14) + bride(66, 50, 46, 9) + '<circle cx="66" cy="34" r="2.2" fill="var(--acier-fonce)"/><circle cx="66" cy="66" r="2.2" fill="var(--acier-fonce)"/>' + tube('M70 50 L90 50', 14),
    hygienique: () => tube('M8 50 L44 50', 14) + bride(47, 50, 26, 6) + bride(53, 50, 26, 6) + '<path d="M44 34 Q50 26 56 34 M44 66 Q50 74 56 66" fill="none" stroke="var(--acier-fonce)" stroke-width="3"/>' + tube('M56 50 L92 50', 14),
    support: () => '<path d="M50 8 L50 30" stroke="var(--acier-fonce)" stroke-width="4"/>' + tube('M8 55 L92 55', 16) +
      '<circle cx="50" cy="55" r="17" fill="none" stroke="var(--accent)" stroke-width="5"/><rect x="44" y="30" width="12" height="9" fill="var(--acier-fonce)"/>',
    spool: () => tube('M8 70 L35 70 Q45 70 45 60 L45 35 Q45 25 55 25 L80 25', 11) + bride(83, 25, 30, 6) + bride(8, 70, 30, 6) +
      '<circle cx="35" cy="70" r="2.6" fill="var(--accent)"/><circle cx="45" cy="60" r="2.6" fill="var(--accent)"/><circle cx="45" cy="35" r="2.6" fill="var(--accent)"/><circle cx="55" cy="25" r="2.6" fill="var(--accent)"/>',
  };
  const picto = (id, cls = 'picto') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${(PICTOS[id] || PICTOS.tube)()}</svg>`;

  // Vue isométrique d'un spool : points 3D des changements de direction, coudes arrondis, cotes entre axes, soudures et extrémités
  const COS30 = Math.cos(Math.PI / 6), SIN30 = 0.5;
  const DIRS = { E: [1, 0, 0], O: [-1, 0, 0], N: [0, 1, 0], S: [0, -1, 0], H: [0, 0, 1], B: [0, 0, -1] };
  const projeter = ([x, y, z]) => [(x - y) * COS30, (x + y) * SIN30 - z];

  function isometrique(spool, { largeur = 640, hauteur = 420, cotes = true, legende = true } = {}) {
    const tr = (spool.troncons || []).filter(t => DIRS[t.dir] && +t.l > 0);
    if (!tr.length) return `<svg viewBox="0 0 ${largeur} ${hauteur}" class="iso"><text x="50%" y="50%" text-anchor="middle" class="iso-vide">Ajoutez un premier tronçon</text></svg>`;
    // Points 3D (mm)
    const pts = [[0, 0, 0]];
    tr.forEach(t => { const p = pts[pts.length - 1], d = DIRS[t.dir]; pts.push([p[0] + d[0] * t.l, p[1] + d[1] * t.l, p[2] + d[2] * t.l]); });
    const p2 = pts.map(projeter);
    const xs = p2.map(p => p[0]), ys = p2.map(p => p[1]);
    const marge = 70, w = Math.max(1, Math.max(...xs) - Math.min(...xs)), h = Math.max(1, Math.max(...ys) - Math.min(...ys));
    const ech = Math.min((largeur - 2 * marge) / w, (hauteur - 2 * marge) / h, 0.6);
    const ox = (largeur - w * ech) / 2 - Math.min(...xs) * ech, oy = (hauteur - h * ech) / 2 - Math.min(...ys) * ech;
    const S = p2.map(([x, y]) => [x * ech + ox, y * ech + oy]);
    // Épaisseur du trait proportionnelle au diamètre, bornée pour rester lisible
    const de = +spool.de || 60, ep = Math.max(6, Math.min(22, de * ech * 1.1 + 5));
    const r = Math.min(1.5 * de * ech, 40);
    // Tracé avec coudes arrondis : on raccourcit chaque segment de r aux changements de direction
    let d = `M${S[0][0].toFixed(1)} ${S[0][1].toFixed(1)}`;
    const soudures = [];
    for (let i = 1; i < S.length; i++) {
      const coude = i < S.length - 1 && tr[i].dir !== tr[i - 1].dir;
      if (!coude) { d += ` L${S[i][0].toFixed(1)} ${S[i][1].toFixed(1)}`; if (i < S.length - 1) soudures.push(S[i]); continue; }
      const a = S[i - 1], b = S[i], c = S[i + 1];
      const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const rr = Math.min(r, la / 2.2, lc / 2.2);
      const p1 = [b[0] + (a[0] - b[0]) * rr / la, b[1] + (a[1] - b[1]) * rr / la], p3 = [b[0] + (c[0] - b[0]) * rr / lc, b[1] + (c[1] - b[1]) * rr / lc];
      d += ` L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} Q${b[0].toFixed(1)} ${b[1].toFixed(1)} ${p3[0].toFixed(1)} ${p3[1].toFixed(1)}`;
      soudures.push(p1, p3);
    }
    let svg = `<svg viewBox="0 0 ${largeur} ${hauteur}" class="iso" role="img" aria-label="Vue isométrique du spool">`;
    // Repère d'orientation (trièdre)
    if (legende) {
      const o = [44, hauteur - 40], fl = (v, l) => { const [x, y] = projeter(v.map(k => k * 26)); return `<line x1="${o[0]}" y1="${o[1]}" x2="${o[0] + x}" y2="${o[1] + y}" class="iso-axe"/><text x="${o[0] + x * 1.35}" y="${o[1] + y * 1.35 + 4}" class="iso-axe-txt" text-anchor="middle">${l}</text>`; };
      svg += `<g>${fl([1, 0, 0], 'E')}${fl([0, 1, 0], 'N')}${fl([0, 0, 1], 'H')}</g>`;
    }
    svg += tube(d, ep);
    // Soudures (points d'accent)
    soudures.forEach(([x, y]) => { svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(2.5, ep / 4).toFixed(1)}" class="iso-soudure"/>`; });
    // Extrémités
    const ext = spool.ext || {};
    [[0, 1, ext.a, 'A'], [S.length - 1, S.length - 2, ext.b, 'B']].forEach(([i, j, type, lettre]) => {
      const [x, y] = S[i], [vx, vy] = [S[i][0] - S[j][0], S[i][1] - S[j][1]], l = Math.hypot(vx, vy) || 1;
      const ang = Math.atan2(vy, vx) * 180 / Math.PI;
      if (type && type !== 'chanfrein') {
        const hb = ep * (type === 'bride' || type === 'collerette' ? 2.4 : 1.7);
        svg += `<rect x="${(-ep * 0.35).toFixed(1)}" y="${(-hb / 2).toFixed(1)}" width="${(ep * 0.7).toFixed(1)}" height="${hb.toFixed(1)}" rx="2" class="iso-bride" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})"/>`;
      }
      const lx = x + vx / l * (ep + 16), ly = y + vy / l * (ep + 16);
      svg += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="11" class="iso-pastille"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" class="iso-pastille-txt">${lettre}</text>`;
    });
    // Cotes entre axes au milieu de chaque tronçon, décalées perpendiculairement
    if (cotes) tr.forEach((t, i) => {
      const a = S[i], b = S[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, vx = b[0] - a[0], vy = b[1] - a[1], l = Math.hypot(vx, vy) || 1;
      let nx = -vy / l, ny = vx / l; if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      const off = ep / 2 + 16;
      svg += `<text x="${(mx + nx * off).toFixed(1)}" y="${(my + ny * off + 4).toFixed(1)}" text-anchor="middle" class="iso-cote">${esc(t.l)}</text>`;
    });
    return svg + '</svg>';
  }

  window.Dessins = { picto, isometrique, PICTOS, NS };
})();
