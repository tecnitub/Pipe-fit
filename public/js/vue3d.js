// Vue 3D d'une ligne de tuyauterie (sans bibliothèque) : maillage des pièces placées par Tuyauterie.placer, projection
// orthogonale (isométrique ISO 6412 par défaut), ombrage simple, rotation au doigt ou à la souris, zoom (molette, pincement),
// déplacement (deux doigts, clic droit ou Maj), sélection d'une pièce au toucher, cotes affichées, image pour la fiche.
const Vue3D = (() => {
  const COUL = { tube: [150, 160, 170], raccord: [118, 130, 142], bride: [96, 108, 120], vanne: [192, 57, 43], clapet: [41, 98, 160], filtre: [39, 120, 90], commande: [230, 126, 34], volant: [44, 62, 80], tournante: [74, 104, 150], equilibrage: [196, 40, 40], moteur: [62, 72, 80], dilatation: [176, 186, 196], sel: [243, 156, 18] };
  const BLEU = '#1e6fd9', COTE = '#14286e', NOTE = '#7a2e12';
  // Isométrique : observateur au sud-est, Nord vers la droite en haut, Est vers la droite en bas
  const ISO = { yaw: -Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) };
  const VUES = { iso: ISO, dessus: { yaw: -Math.PI / 2, pitch: Math.PI / 2 - 1e-4 }, face: { yaw: -Math.PI / 2, pitch: 0 }, cote: { yaw: 0, pitch: 0 } };
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // Deux vecteurs perpendiculaires à un axe
  function base(d) {
    const a = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = unit(cross(d, a));
    return [u, cross(d, u)];
  }
  const anneau = (c, d, r, seg) => { const [u, v] = base(d); return Array.from({ length: seg }, (_, k) => { const t = (k / seg) * Math.PI * 2; return add(add(c, u, r * Math.cos(t)), v, r * Math.sin(t)); }); };
  // Faces entre deux anneaux successifs
  function relier(out, A, B, c, id) { for (let k = 0; k < A.length; k++) { const k2 = (k + 1) % A.length; out.push({ p: [A[k], A[k2], B[k2], B[k]], c, id }); } }
  function disque(out, ring, c, id) { out.push({ p: ring, c, id }); }
  function cylindre(out, a, b, r1, r2, c, id, bouts = false, seg = 16) {
    const d = unit(add(b, a, -1)), A = anneau(a, d, r1, seg), B = anneau(b, d, r2 === undefined ? r1 : r2, seg);
    relier(out, A, B, c, id);
    if (bouts) { disque(out, A, c, id); disque(out, B, c, id); }
  }
  function boite(out, c0, ax, demi, c, id) {
    const [x, y, z] = ax, s = [-1, 1];
    const P = (i, j, k) => add(add(add(c0, x, s[i] * demi[0]), y, s[j] * demi[1]), z, s[k] * demi[2]);
    [[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]]
      .forEach(f => out.push({ p: f.map(q => P(...q)), c, id }));
  }
  // Bride posée sur le plan de joint p, tournée vers d : à collerette (plateau + collerette conique) ou tournante
  // (collet à souder dont la portée fait le joint, bride libre derrière la portée)
  function bride(out, p, d, de, D, h, id, type = 'collerette') {
    if (type === 'tournante') {
      const lip = Math.max(3, h * 0.08);
      cylindre(out, p, add(p, d, lip), de / 2 * 1.5, de / 2 * 1.5, COUL.raccord, id, true);
      cylindre(out, add(p, d, lip), add(p, d, lip + h * 0.4), D / 2, D / 2, COUL.tournante, id, true);
      cylindre(out, add(p, d, lip), add(p, d, h), de / 2 * 1.03, de / 2 * 1.03, COUL.raccord, id);
      return;
    }
    cylindre(out, p, add(p, d, h * 0.45), D / 2, D / 2, COUL.bride, id, true);
    cylindre(out, add(p, d, h * 0.45), add(p, d, h), D / 2 * 0.55, de / 2 * 1.08, COUL.bride, id);
  }

  // Maillage de toutes les pièces : faces { p: points, c: couleur, id: pièce }
  function maillage(placement) {
    const out = [];
    placement.pieces.forEach(pc => {
      const r = pc.de / 2, id = pc.id;
      switch (pc.t) {
        case 'tube': cylindre(out, pc.p0, pc.p1, r, r, COUL.tube, id); break;
        case 'coude': {
          const O = add(pc.p0, pc.u, pc.R), pas = Math.max(4, Math.round(pc.a / (Math.PI / 16)));
          let prec = null;
          for (let k = 0; k <= pas; k++) {
            const f = (k / pas) * pc.a, pos = add(O, add(pc.u.map(x => -x * Math.cos(f)), pc.dir, Math.sin(f)), pc.R);
            const tg = unit(add(pc.u.map(x => x * Math.sin(f)), pc.dir, Math.cos(f)));
            const ring = prec ? aligner(prec, anneau(pos, tg, r, 16)) : anneau(pos, tg, r, 16);
            if (prec) relier(out, prec, ring, COUL.raccord, id);
            prec = ring;
          }
          break;
        }
        case 'te':
          cylindre(out, pc.p0, pc.p1, r, r, COUL.raccord, id);
          if (pc.pb) cylindre(out, pc.centre, pc.pb, Tuyauterie.DE[pc.dnB] / 2, Tuyauterie.DE[pc.dnB] / 2, COUL.raccord, id);
          break;
        case 'reduc': cylindre(out, pc.p0, pc.p1, r, pc.de2 / 2, COUL.raccord, id); break;
        case 'fond': {
          const pas = 5;
          let prec = anneau(pc.p0, pc.dir, r, 16);
          for (let k = 1; k <= pas; k++) {
            const t = k / pas, ring = anneau(add(pc.p0, pc.dir, pc.L * Math.sin((t * Math.PI) / 2)), pc.dir, Math.max(0.5, r * Math.cos((t * Math.PI) / 2)), 16);
            relier(out, prec, ring, COUL.raccord, id); prec = ring;
          }
          break;
        }
        case 'brides': {
          const [D, h] = Tuyauterie.BRIDE[pc.dn], mid = add(pc.p0, pc.dir, pc.L / 2);
          const [t1, t2] = pc.flanges || [];
          bride(out, add(mid, pc.dir, -1), pc.dir.map(x => -x), pc.de, D, h, id, t1);
          bride(out, add(mid, pc.dir, 1), pc.dir, pc.de, D, h, id, t2);
          break;
        }
        case 'raccord': {
          cylindre(out, pc.p0, pc.p1, r * 1.25, r * 1.25, COUL.raccord, id, true);
          if (pc.el.type !== 'manchon') { const m = add(pc.p0, pc.dir, pc.L / 2); boite(out, m, [pc.dir, ...base(pc.dir)], [pc.L * 0.18, r * 1.55, r * 1.55], COUL.bride, id); }
          break;
        }
        case 'vanne': vanne(out, pc); break;
        case 'v3v': vanne3v(out, pc); break;
        default: break;
      }
    });
    return out;
  }
  // Remet l'anneau suivant dans l'ordre du précédent (évite les faces vrillées dans les coudes)
  function aligner(prec, ring) {
    let best = 0, bd = Infinity;
    ring.forEach((q, k) => { const dd = (q[0] - prec[0][0]) ** 2 + (q[1] - prec[0][1]) ** 2 + (q[2] - prec[0][2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
    const sens = ring.map((_, k) => ring[(best + k) % ring.length]);
    const inv = ring.map((_, k) => ring[(best - k + ring.length) % ring.length]);
    const e = s => (s[1][0] - prec[1][0]) ** 2 + (s[1][1] - prec[1][1]) ** 2 + (s[1][2] - prec[1][2]) ** 2;
    return e(sens) <= e(inv) ? sens : inv;
  }
  function vanne(out, pc) {
    const r = pc.de / 2, id = pc.id, d = pc.dir, type = pc.el.type || 'boisseau', v = Tuyauterie.VANNES[type] || Tuyauterie.VANNES.boisseau;
    const coul = type === 'clapet' ? COUL.clapet : type === 'filtre' ? COUL.filtre : type === 'equilibrage' ? COUL.equilibrage : type === 'dilatation' ? COUL.dilatation : COUL.vanne;
    let a = pc.p0, b = pc.p1;
    if (pc.brides) {
      const [D, h] = Tuyauterie.BRIDE[pc.dn];
      // Contre-brides soudées sur le tube, puis les brides du corps de la vanne
      const t = (pc.flanges || [])[0];
      bride(out, add(a, d, h), d.map(x => -x), pc.de, D, h, id, t);
      bride(out, add(b, d, -h), d, pc.de, D, h, id, t);
      a = add(a, d, h + 2); b = add(b, d, -h - 2);
      cylindre(out, a, add(a, d, Math.min(h * 0.5, pc.ftf * 0.2)), D / 2, D / 2, coul, id, true);
      cylindre(out, add(b, d, -Math.min(h * 0.5, pc.ftf * 0.2)), b, D / 2, D / 2, coul, id, true);
    }
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = add(a, d, L / 2);
    if (type === 'papillon') cylindre(out, a, b, r * 1.7, r * 1.7, coul, id, true);
    else if (type === 'dilatation') {
      // Soufflet : ondes successives
      const nb = 7;
      for (let k = 0; k < nb; k++) cylindre(out, add(a, d, (L * k) / nb), add(a, d, (L * (k + 0.5)) / nb), r * 1.12, r * 1.45, coul, id, k === 0);
      for (let k = 0; k < nb; k++) cylindre(out, add(a, d, (L * (k + 0.5)) / nb), add(a, d, (L * (k + 1)) / nb), r * 1.45, r * 1.12, coul, id, k === nb - 1);
    }
    else if (type === 'filtre') {
      cylindre(out, a, b, r * 1.3, r * 1.3, coul, id, true);
      const bas = unit(add(d.map(x => x * 0.6), pc.tige, -1));
      cylindre(out, m, add(m, bas, r * 2.6), r * 1.1, r * 0.9, coul, id, true);
    } else {
      cylindre(out, a, add(a, d, L * 0.25), r * 1.15, r * 1.6, coul, id, true);
      cylindre(out, add(a, d, L * 0.25), add(a, d, L * 0.75), r * 1.6, r * 1.6, coul, id);
      cylindre(out, add(a, d, L * 0.75), b, r * 1.6, r * 1.15, coul, id, true);
    }
    const t = pc.tige;
    if (v.prises) [-1, 1].forEach(s => cylindre(out, add(add(m, d, s * L * 0.3), t, r * 1.2), add(add(m, d, s * L * 0.3), t, r * 2.1), r * 0.16 + 2, r * 0.16 + 2, COUL.commande, id, true));
    if (v.commande === 'moteur') servomoteur(out, m, t, d, r, id);
    else if (v.commande === 'levier') {
      const haut = add(m, t, r * 2.1);
      cylindre(out, add(m, t, r * 1.5), haut, r * 0.22, r * 0.22, COUL.commande, id, true);
      const [u] = base(t), sens = Math.abs(dot(u, d)) > 0.5 ? u : d;
      boite(out, add(haut, sens, Math.max(r * 2.5, 60)), [sens, cross(t, sens), t], [Math.max(r * 2.5, 60), r * 0.22 + 4, r * 0.12 + 3], COUL.commande, id);
    } else if (v.commande === 'volant') {
      const haut = add(m, t, r * 3.2);
      cylindre(out, add(m, t, r * 1.5), haut, r * 0.5, r * 0.4, coul, id, true);
      cylindre(out, haut, add(haut, t, r * 0.6), r * 0.12 + 3, r * 0.12 + 3, COUL.volant, id, true);
      const tige = add(haut, t, r * 0.6), anneauV = anneau(tige, t, r * 1.6, 20), interieur = anneau(add(tige, t, r * 0.15), t, r * 1.35, 20);
      relier(out, anneauV, interieur, COUL.volant, id);
      relier(out, anneau(add(tige, t, -r * 0.1), t, r * 1.6, 20), anneauV, COUL.volant, id);
    } else if (type === 'clapet') boite(out, add(m, t, r * 1.5), [d, cross(t, d), t], [L * 0.22, r * 0.9, r * 0.3], coul, id);
  }

  // Servomoteur de vanne de régulation : arcade, boîtier
  function servomoteur(out, m, t, d, r, id) {
    cylindre(out, add(m, t, r * 1.4), add(m, t, r * 2.6), r * 0.25 + 2, r * 0.25 + 2, COUL.bride, id, true);
    const s = Math.max(r * 1.2, 45);
    boite(out, add(m, t, r * 2.6 + s * 0.9), [d, cross(t, d), t], [s, s * 0.75, s * 0.9], COUL.moteur, id);
  }
  // Vanne 3 voies : corps, trois voies (contre-brides si à brides), servomoteur
  function vanne3v(out, pc) {
    const r = pc.de / 2, id = pc.id, d = pc.dir, [D, h] = Tuyauterie.BRIDE[pc.dn], t = (pc.flanges || [])[0];
    const voies = [[pc.p0, d.map(x => -x)], [pc.p1, d]].concat(pc.pb ? [[pc.pb, pc.vb]] : []);
    voies.forEach(([q, dir]) => {
      let face = q;
      if (pc.brides) { bride(out, add(q, dir, -h), dir, pc.de, D, h, id, t); face = add(q, dir, -h - 2); }
      cylindre(out, pc.centre, face, r * 1.15, r * 1.15, COUL.vanne, id, true);
    });
    cylindre(out, add(pc.centre, d, -r * 1.6), add(pc.centre, d, r * 1.6), r * 1.8, r * 1.8, COUL.vanne, id, true);
    if (pc.tige) servomoteur(out, pc.centre, pc.tige, d, r, id);
  }

  // Habillage de l'isométrique : cotes à l'axe (nœud à nœud), repères et longueurs de coupe, annotations libres,
  // points bleus des assemblages à brides
  function etiquettes(placement) {
    const milieu = pc => (pc.centre ? pc.centre : add(pc.p0, add(pc.p1, pc.p0, -1), 0.5));
    const notes = placement.pieces.filter(pc => String(pc.el.note || '').trim()).map(pc => ({ pos: milieu(pc), txt: String(pc.el.note).trim(), id: pc.id }));
    if (placement.depart && placement.depart.note) notes.unshift({ pos: placement.depart.p, txt: placement.depart.note, id: 'depart' });
    return {
      reperes: placement.pieces.filter(pc => pc.t === 'tube' || pc.el.repere).map(pc => ({ pos: milieu(pc), repere: pc.el.repere || '', coupe: pc.t === 'tube' ? Math.round(pc.coupe || 0) : null, r: pc.de / 2, id: pc.id })),
      cotes: placement.cotes || [], notes, triangles: placement.triangles || [],
      soudures: (placement.soudures || []).map(s => s.p), sertissages: (placement.sertissages || []).map(s => s.p), joints: placement.pieces.flatMap(pc => pc.joints || []),
    };
  }
  // Étiquette encadrée centrée sur (x, y), tournée de a
  function etiquette(ctx, txt, x, y, a, couleur, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const tw = ctx.measureText(txt).width + 8 * s, th = 17 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(-tw / 2, -th / 2, tw, th);
    ctx.fillStyle = couleur; ctx.fillText(txt, 0, s * 0.5);
    ctx.restore();
  }
  // Cote à l'axe : lignes d'attache, ligne de cote décalée, traits obliques aux extrémités, valeur en mm
  function cote(ctx, A, B, valeur, s) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (L < 28 * s) return;
    let nx = -dy / L, ny = dx / L;
    if (ny > 0.01 || (Math.abs(ny) <= 0.01 && nx < 0)) { nx = -nx; ny = -ny; } // côté haut (ou droit) de la ligne
    const off = 24 * s, ux = dx / L, uy = dy / L, A2 = [A[0] + nx * off, A[1] + ny * off], B2 = [B[0] + nx * off, B[1] + ny * off];
    ctx.strokeStyle = COTE; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8 * s; ctx.beginPath();
    [A, B].forEach(P => { ctx.moveTo(P[0] + nx * 5 * s, P[1] + ny * 5 * s); ctx.lineTo(P[0] + nx * (off + 5 * s), P[1] + ny * (off + 5 * s)); });
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.1 * s; ctx.beginPath();
    ctx.moveTo(A2[0], A2[1]); ctx.lineTo(B2[0], B2[1]);
    const tx = (ux + nx) * 4.5 * s, ty = (uy + ny) * 4.5 * s;
    [A2, B2].forEach(P => { ctx.moveTo(P[0] - tx, P[1] - ty); ctx.lineTo(P[0] + tx, P[1] + ty); });
    ctx.stroke();
    let a = Math.atan2(dy, dx); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
    etiquette(ctx, fmtMm(valeur), (A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2, a, COTE, s);
  }
  const fmtMm = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // Lumière et caméra
  function camera(etat) {
    const cy = Math.cos(etat.yaw), sy = Math.sin(etat.yaw), cp = Math.cos(etat.pitch), sp = Math.sin(etat.pitch);
    const vue = [cp * cy, cp * sy, sp]; // direction vers l'observateur
    const droite = unit([-sy, cy, 0]), haut = cross(vue, droite);
    return { vue, droite, haut };
  }
  function bornes(faces) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    faces.forEach(f => f.p.forEach(q => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } }));
    if (!isFinite(mn[0])) return { c: [0, 0, 0], r: 500 };
    return { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], r: Math.max(200, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2) };
  }

  function dessiner(ctx, w, h, faces, labels, etat, opts = {}) {
    const cam = camera(etat), k = etat.zoom * Math.min(w, h) / (2 * etat.rayon);
    const proj = q => { const r = add(q, etat.centre, -1); return [w / 2 + etat.px + dot(r, cam.droite) * k, h / 2 + etat.py - dot(r, cam.haut) * k, dot(r, cam.vue)]; };
    const lum = unit(add(add(cam.vue, cam.haut, 0.6), cam.droite, -0.4));
    ctx.clearRect(0, 0, w, h);
    if (opts.fond) { ctx.fillStyle = opts.fond; ctx.fillRect(0, 0, w, h); }
    const proj2 = faces.map(f => {
      const s = f.p.map(proj);
      let nrm = cross(add(f.p[1], f.p[0], -1), add(f.p[2], f.p[0], -1));
      if (Math.hypot(...nrm) < 1e-9 && f.p[3]) nrm = cross(add(f.p[2], f.p[0], -1), add(f.p[3], f.p[0], -1));
      nrm = unit(nrm);
      if (dot(nrm, cam.vue) < 0) nrm = nrm.map(x => -x);
      return { s, z: s.reduce((a, q) => a + q[2], 0) / s.length, i: 0.38 + 0.62 * Math.max(0, dot(nrm, lum)), f };
    }).sort((a, b) => a.z - b.z);
    proj2.forEach(({ s, i, f }) => {
      const c = f.id === etat.sel ? COUL.sel : f.c;
      ctx.fillStyle = `rgb(${Math.round(c[0] * i)},${Math.round(c[1] * i)},${Math.round(c[2] * i)})`;
      ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (let q = 1; q < s.length; q++) ctx.lineTo(s[q][0], s[q][1]); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();
    });
    etat.ecran = proj2;
    const s = (opts.police || 12) / 12;
    ctx.font = `${opts.police || 12}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Triangles hachurés des dévoiements (ISO 6412)
    labels.triangles.forEach(tr => {
      const P = tr.pts.map(proj);
      ctx.save(); ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); P.slice(1).forEach(q => ctx.lineTo(q[0], q[1])); ctx.closePath();
      ctx.fillStyle = 'rgba(20,40,110,0.06)'; ctx.fill(); ctx.strokeStyle = COTE; ctx.lineWidth = 1 * s; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.clip();
      const xs = P.map(q => q[0]), ys = P.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      ctx.globalAlpha = 0.45; ctx.lineWidth = 0.8 * s; ctx.beginPath();
      for (let x = x0 - (y1 - y0); x < x1; x += 6 * s) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); }
      ctx.stroke(); ctx.restore();
    });
    // Points bleus : soudures
    // Points verts : sertissages (tube à sertir)
    (labels.sertissages || []).forEach(j => { const P = proj(j); ctx.beginPath(); ctx.arc(P[0], P[1], 3.5 * s, 0, Math.PI * 2); ctx.fillStyle = '#1f9d55'; ctx.fill(); ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#fff'; ctx.stroke(); });
    labels.soudures.forEach(j => { const P = proj(j); ctx.beginPath(); ctx.arc(P[0], P[1], 4 * s, 0, Math.PI * 2); ctx.fillStyle = BLEU; ctx.fill(); ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#fff'; ctx.stroke(); });
    if (etat.cotes) labels.cotes.forEach(c => cote(ctx, proj(c.a), proj(c.b), c.valeur, s));
    labels.reperes.forEach(l => {
      const txt = [l.repere, etat.coupes && l.coupe !== null ? `coupe ${fmtMm(l.coupe)}` : ''].filter(Boolean).join(' · ');
      if (!txt) return;
      const P = proj(add(l.pos, cam.haut, -(l.r + 12 * s / k)));
      etiquette(ctx, txt, P[0], P[1], 0, '#3c4650', s);
    });
    // Annotations : ligne de rappel vers la pièce
    if (etat.notes !== false) {
      ctx.font = `italic ${opts.police || 12}px system-ui, sans-serif`; ctx.textAlign = 'left';
      labels.notes.forEach(l => {
        const tw = ctx.measureText(l.txt).width + 10 * s, P = proj(l.pos);
        // Rappel vers la droite, ou vers la gauche si le texte sortirait du cadre
        const gauche = P[0] + 26 * s + tw > w - 4 && P[0] - 26 * s - tw > 4, Q = [P[0] + (gauche ? -26 - tw / s : 26) * s, P[1] - 30 * s];
        ctx.strokeStyle = NOTE; ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(gauche ? Q[0] + tw : Q[0], Q[1]); ctx.lineTo(gauche ? Q[0] : Q[0] + tw, Q[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(P[0], P[1], 2.5 * s, 0, Math.PI * 2); ctx.fillStyle = NOTE; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(Q[0], Q[1] - 17 * s, tw, 15 * s);
        ctx.fillStyle = NOTE; ctx.fillText(l.txt, Q[0] + 5 * s, Q[1] - 9 * s);
      });
      ctx.textAlign = 'center';
    }
    // Repère des directions (Nord, Est, Haut)
    const o = [34, h - 34];
    [['E', [1, 0, 0], '#c0392b'], ['N', [0, 1, 0], '#27ae60'], ['H', [0, 0, 1], '#2962a0']].forEach(([lib, d, col]) => {
      const x = o[0] + dot(d, cam.droite) * 22, y = o[1] - dot(d, cam.haut) * 22;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = col; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lib, o[0] + dot(d, cam.droite) * 30, o[1] - dot(d, cam.haut) * 30);
    });
  }
  // Pièce sous un point de l'écran (la plus proche de l'observateur)
  function pointer(etat, x, y) {
    const dedans = s => { let c = false; for (let i = 0, j = s.length - 1; i < s.length; j = i++) { if ((s[i][1] > y) !== (s[j][1] > y) && x < ((s[j][0] - s[i][0]) * (y - s[i][1])) / (s[j][1] - s[i][1]) + s[i][0]) c = !c; } return c; };
    const l = etat.ecran || [];
    for (let k = l.length - 1; k >= 0; k--) if (dedans(l[k].s)) return l[k].f.id;
    return null;
  }

  // Vue interactive dans un canevas. etat (conservé d'un affichage à l'autre) : angles, zoom, décalage, sélection, cotes
  function creer(canvas, etat, { onPick } = {}) {
    let faces = [], labels = { reperes: [], cotes: [], notes: [], joints: [], soudures: [], triangles: [] }, cadre = null;
    const ctx = canvas.getContext('2d');
    const taille = () => { const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1; canvas.width = Math.max(1, r.width * k); canvas.height = Math.max(1, r.height * k); ctx.setTransform(k, 0, 0, k, 0, 0); return r; };
    let r = taille();
    const rendu = () => { if (cadre) return; cadre = requestAnimationFrame(() => { cadre = null; dessiner(ctx, r.width, r.height, faces, labels, etat); }); };
    const ptrs = new Map();
    let geste = null, bouge = 0;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); bouge = 0;
      geste = ptrs.size === 2 ? 'pince' : e.button === 2 || e.shiftKey ? 'deplace' : 'tourne';
    });
    canvas.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const [x0, y0] = ptrs.get(e.pointerId), dx = e.clientX - x0, dy = e.clientY - y0;
      if (geste === 'pince' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], avant = Math.hypot(a[0] - b[0], a[1] - b[1]);
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        const [c, d] = [...ptrs.values()], apres = Math.hypot(c[0] - d[0], c[1] - d[1]);
        if (avant > 0) etat.zoom = Math.min(40, Math.max(0.2, etat.zoom * apres / avant));
        etat.px += dx / 2; etat.py += dy / 2;
      } else {
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (geste === 'deplace') { etat.px += dx; etat.py += dy; } else if (geste === 'tourne') {
          etat.yaw -= dx * 0.01; etat.pitch = Math.max(-Math.PI / 2 + 1e-4, Math.min(Math.PI / 2 - 1e-4, etat.pitch + dy * 0.01));
        }
      }
      bouge += Math.abs(dx) + Math.abs(dy);
      rendu();
    });
    const fin = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (!ptrs.size && bouge < 6 && geste === 'tourne' && onPick) { const b = canvas.getBoundingClientRect(); onPick(pointer(etat, e.clientX - b.left, e.clientY - b.top)); }
      if (ptrs.size === 1) geste = 'tourne';
      if (!ptrs.size) geste = null;
    };
    canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
    canvas.addEventListener('wheel', e => { e.preventDefault(); etat.zoom = Math.min(40, Math.max(0.2, etat.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); rendu(); }, { passive: false });
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { r = taille(); rendu(); }) : null;
    if (obs) obs.observe(canvas);
    return {
      maj(placement, recadrer) {
        faces = maillage(placement); labels = etiquettes(placement);
        if (recadrer || !etat.rayon) { const b = bornes(faces); etat.centre = b.c; etat.rayon = b.r; }
        rendu();
      },
      vue(nom) { Object.assign(etat, VUES[nom] || ISO, { zoom: 1.3, px: 0, py: 0 }); const b = bornes(faces); etat.centre = b.c; etat.rayon = b.r; rendu(); },
      rendu,
      detruire() { if (obs) obs.disconnect(); },
    };
  }
  const etatInitial = () => ({ ...ISO, zoom: 1.3, px: 0, py: 0, sel: null, cotes: true, coupes: false, notes: true, centre: [0, 0, 0], rayon: 0 });

  // Image de la ligne en isométrique (fiche imprimée, PDF) : PNG en data URL
  function image(placement, w = 1200, h = 800) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const faces = maillage(placement), b = bornes(faces);
    dessiner(cv.getContext('2d'), w, h, faces, etiquettes(placement), { ...etatInitial(), centre: b.c, rayon: b.r, zoom: 1.3 }, { fond: '#ffffff', police: 20 });
    return cv.toDataURL('image/png');
  }
  return { creer, etatInitial, image, maillage, VUES };
})();
