// Schéma d'ensemble de l'installation hydraulique : un dessin unique de toute l'installation, de gauche à droite,
// productions racines → circuits (pompe, montage, régime, puissance) → schémas aval imbriqués (sous-station, PAC de
// zone…) → réseaux arborescents → consommateurs (terminaux, batteries de CTA, ECS).
// Entrée : Installation.arbre(et). Sortie : SVG autonome (attributs de présentation seulement, sans feuille de style)
// que Dxf.depuisSvg sait convertir : chaque niveau est un groupe <g data-calque="NIVEAU_n"> (un calque DXF par niveau).
// Module pur (navigateur, node, tests).
const Ensemble = (() => {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nf = (x, d = 1) => (Number.isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',') : '');
  const val = (x, u, d = 1) => (Number.isFinite(x) && x !== 0 ? `${nf(x, d)} ${u}` : '');
  const W = 236, GX = 52, GY = 12, PAD = 20, ENTETE = 74, LH = 13, MAX_FEUILLES = 14;
  // Couleurs : un fond par niveau (schémas), traits de départ chaud / froid
  const FONDS = ['#fde2dc', '#e3f0ff', '#e6f6e6', '#fff4d6', '#efe6fb', '#e0f4f4'];
  const CHAUD = '#c0392b', FROID = '#1f6fb2', TRAIT = '#333333';
  // Renvoie une ligne trop longue pour la largeur disponible (mots entiers), au plus max lignes, la dernière abrégée
  const casser = (t, fs, larg = W - 14, max = 2) => {
    const n = Math.max(8, Math.floor(larg / (fs * 0.56))), out = [];
    let cour = '';
    String(t || '').split(/\s+/).filter(Boolean).forEach(m => { if (!cour) cour = m; else if ((`${cour} ${m}`).length <= n) cour += ` ${m}`; else { out.push(cour); cour = m; } });
    if (cour) out.push(cour);
    const l = out.slice(0, max);
    if (out.length > max) l[max - 1] = `${l[max - 1]} ${out.slice(max).join(' ')}`;
    return l.map(x => (x.length > n ? `${x.slice(0, n - 1)}…` : x));
  };
  const froidDe = regime => { const m = /(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)/.exec(String(regime || '')); return !!m && parseFloat(m[1].replace(',', '.')) < 18; };

  /* ---------- Arbre de dessin ---------- */
  // Nœud : { type, niveau (1 = production racine), titre, lignes, fond, froid, pompe, enfants }
  function noeuds(arbre) {
    const parCle = new Map((arbre.consommateurs || []).map(c => [c.cle, c])), H = arbre.hydraulique;
    const pompeProd = note => { const b = H && (H.boucles || []).find(x => x.type === 'production' && x.note === note); return b ? b.pompe : ''; };
    const conso = (c, niveau) => ({ type: 'conso', niveau, titre: c.libelle, lignes: [[val(c.P, 'kW'), val(c.Q, 'm³/h', 2), c.regime].filter(Boolean).join(' · ')].filter(Boolean), froid: c.saison === 'froid', enfants: [] });
    const limiter = (l, niveau) => (l.length > MAX_FEUILLES ? [...l.slice(0, MAX_FEUILLES - 1), { type: 'conso', niveau, titre: `+ ${l.length - MAX_FEUILLES + 1} autre(s)`, lignes: [], enfants: [] }] : l);
    const reseau = (r, niveau) => {
      // Branches terminales (aucune autre branche ne part d'elles) : consommateur relié ou émetteur saisi
      const amonts = new Set(r.branches.map(b => String(b.amont || '').trim()).filter(Boolean));
      const feuilles = r.branches.filter(b => b.consommateur || !amonts.has(String(b.rep || '').trim())).map(b => {
        const c = b.consommateur && parCle.get(b.consommateur);
        return c ? { ...conso(c, niveau), titre: `${b.rep} · ${c.libelle}` } : { type: 'conso', niveau, titre: `${b.rep}${b.nom ? ` · ${b.nom}` : ''}`, lignes: [val(b.P, 'kW')].filter(Boolean), froid: r.saison === 'froid', enfants: [] };
      });
      return { type: 'reseau', niveau, titre: `Réseau ${r.libelle}`, froid: r.saison === 'froid',
        lignes: [`Réseau arborescent ${r.saison === 'froid' ? 'd\'eau glacée' : 'd\'eau chaude'}`, [val(r.P, 'kW'), val(r.Q, 'm³/h', 2), val(r.hmt, 'mCE', 2)].filter(Boolean).join(' · '), `${r.branches.length} branche(s)`].filter(Boolean),
        enfants: limiter(feuilles, niveau) };
    };
    const schema = s => {
      const niveau = s.niveau + 1, pp = !s.amont ? pompeProd(s.note) : '';
      return { type: 'schema', niveau, titre: s.libelle, fond: FONDS[(niveau - 1) % FONDS.length], froid: froidDe(s.regime), etiquette: `Niveau ${niveau}`,
        lignes: [`${s.nGen > 1 ? `${s.nGen} × ` : ''}${s.generateur}${s.Pgen ? ` ${nf(s.Pgen, 0)} kW` : ''}`, s.regime, `Production ${val(s.Pprod, 'kW', 0) || '—'} · appelée ${val(s.Pdem, 'kW', 0) || '—'}`,
          s.amont ? `Alimenté par le circuit ${s.amont.rep}` : '', s.primaire ? `Primaire : ${s.primaire.libelle}${s.primaire.regime ? ` ${s.primaire.regime} °C` : ''}` : '', pp ? `Pompe : ${pp}` : ''].filter(Boolean),
        enfants: s.circuits.map(c => {
          const autres = c.consommateurs.filter(k => k !== `${s.note}|${c.i}` && !(c.schema && k === `${c.schema.note}:schema`) && !(c.reseau && k === `${c.reseau.note}:reseau`)).map(k => parCle.get(k)).filter(Boolean);
          return { type: 'circuit', niveau, titre: `Circuit ${c.rep}`, froid: froidDe(c.regime), pompe: true,
            lignes: [c.emetteur, `Montage : ${c.montage}`, [c.regime, val(c.P, 'kW')].filter(Boolean).join(' · '), [val(c.Q, 'm³/h', 2), val(c.hmt, 'mCE', 2)].filter(Boolean).length ? `Pompe : ${[val(c.Q, 'm³/h', 2), val(c.hmt, 'mCE', 2)].filter(Boolean).join(' · ')}` : 'Pompe de circuit',
              c.annexe && !['arbo', 'pid'].includes(c.annexe.type) ? `Annexe : ${c.annexe.libelle}` : ''].filter(Boolean),
            enfants: [...(c.schema ? [schema(c.schema)] : []), ...(c.reseau ? [reseau(c.reseau, niveau)] : []), ...limiter(autres.map(x => conso(x, niveau)), niveau)] };
        }) };
    };
    return [...(arbre.schemas || []).map(schema), ...(arbre.reseaux || []).map(r => reseau(r, 1))];
  }

  /* ---------- Mise en page (arbre rangé : une colonne par profondeur) ---------- */
  // Lignes rendues (titre sur deux lignes au plus, à côté de l'étiquette du niveau pour un schéma) et hauteur de la boîte
  function mesurer(n) {
    const fsT = n.type === 'conso' ? 10 : 11;
    n.tl = casser(n.titre, fsT, n.type === 'schema' ? W - 80 : W - 14, 2);
    n.ll = n.lignes.flatMap(l => casser(l, 9.5, W - 14, 2));
    n.h = 8 + (fsT + 3) * n.tl.length + LH * n.ll.length;
    const hs = n.enfants.map(mesurer), tot = hs.reduce((a, h) => a + h, 0) + GY * Math.max(0, hs.length - 1);
    n.bande = Math.max(n.h, tot);
    return n.bande;
  }
  function placer(n, prof, y) {
    n.x = PAD + prof * (W + GX);
    let yc = y + (n.bande - n.enfants.reduce((a, e) => a + e.bande, 0) - GY * Math.max(0, n.enfants.length - 1)) / 2;
    n.enfants.forEach(e => { placer(e, prof + 1, yc); yc += e.bande + GY; });
    // Parent centré sur ses enfants (ou sur sa bande s'il n'en a pas)
    const ys = n.enfants.map(e => e.y + e.h / 2), milieu = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : y + n.bande / 2;
    n.y = Math.max(y, Math.min(y + n.bande - n.h, milieu - n.h / 2));
    return prof;
  }
  const profondeur = n => 1 + Math.max(0, ...n.enfants.map(profondeur));

  /* ---------- Dessin ---------- */
  const r1 = v => String(Math.round(v * 10) / 10);
  const texte = (x, y, t, o = {}) => `<text x="${r1(x)}" y="${r1(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${o.fs || 10}"${o.b ? ' font-weight="bold"' : ''}${o.a ? ` text-anchor="${o.a}"` : ''} fill="${o.c || '#222222'}">${esc(t)}</text>`;
  function boite(n) {
    const out = [], { x, y, h } = n, coul = n.froid ? FROID : CHAUD;
    if (n.type === 'schema') out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${W}" height="${r1(h)}" rx="6" fill="${n.fond}" stroke="${TRAIT}" stroke-width="1.6"/>`,
      `<rect x="${r1(x + W - 64)}" y="${r1(y - 9)}" width="60" height="16" rx="8" fill="#ffffff" stroke="${TRAIT}" stroke-width="1"/>`, texte(x + W - 34, y + 3, n.etiquette, { fs: 9, a: 'middle', b: true }));
    else if (n.type === 'circuit') out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${W}" height="${r1(h)}" rx="3" fill="#ffffff" stroke="${coul}" stroke-width="1.4"/>`);
    else if (n.type === 'reseau') out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${W}" height="${r1(h)}" rx="3" fill="#f7f7f7" stroke="${coul}" stroke-width="1.2" stroke-dasharray="5 3"/>`);
    else out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${W}" height="${r1(h)}" rx="2" fill="#ffffff" stroke="#888888" stroke-width="0.8"/>`);
    const fsT = n.type === 'conso' ? 10 : 11, yt = y + 4 + (fsT + 3) * n.tl.length;
    n.tl.forEach((t, i) => out.push(texte(x + 7, y + 4 + fsT + (fsT + 3) * i, t, { fs: fsT, b: n.type !== 'conso' })));
    n.ll.forEach((l, i) => out.push(texte(x + 7, yt + LH * (i + 1) - 2, l, { fs: 9.5, c: '#444444' })));
    return out.join('');
  }
  function lien(p, e) {
    const x1 = p.x + W, y1 = p.y + p.h / 2, x2 = e.x, y2 = e.y + e.h / 2, xm = x1 + GX / 2, coul = e.froid ? FROID : CHAUD, out = [];
    out.push(`<path d="M ${r1(x1)} ${r1(y1)} H ${r1(xm)} V ${r1(y2)} H ${r1(x2)}" fill="none" stroke="${coul}" stroke-width="1.5"/>`);
    // Pompe du circuit : cercle et triangle sur l'arrivée du circuit
    if (e.pompe) { const cx = x2 - 12, cy = y2; out.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="7" fill="#ffffff" stroke="${TRAIT}" stroke-width="1.3"/>`, `<path d="M ${r1(cx - 4)} ${r1(cy - 5)} L ${r1(cx + 6)} ${r1(cy)} L ${r1(cx - 4)} ${r1(cy + 5)} Z" fill="none" stroke="${TRAIT}" stroke-width="1"/>`); }
    return out.join('');
  }
  // Rend { svg, largeur, hauteur, niveaux } ; opts.titre : titre du folio (objet de l'étude)
  function dessiner(arbre, opts = {}) {
    const racines = noeuds(arbre || {}), parNiveau = new Map();
    let y = ENTETE, prof = 1;
    racines.forEach(r => { mesurer(r); placer(r, 0, y); y += r.bande + GY * 3; prof = Math.max(prof, profondeur(r)); });
    const parcourir = (n, p) => { const l = parNiveau.get(n.niveau) || []; l.push(boite(n)); if (p) l.push(lien(p, n)); parNiveau.set(n.niveau, l); n.enfants.forEach(e => parcourir(e, n)); };
    racines.forEach(r => parcourir(r, null));
    const niveaux = [...parNiveau.keys()].sort((a, b) => a - b), larg = Math.max(760, PAD * 2 + prof * W + (prof - 1) * GX);
    const legendeY = Math.max(y, ENTETE + 40) + 6, haut = legendeY + 46;
    const legende = [`<g data-calque="CARTOUCHE">`, texte(PAD, legendeY + 12, 'Légende :', { fs: 10, b: true }),
      `<line x1="${PAD + 64}" y1="${legendeY + 8}" x2="${PAD + 94}" y2="${legendeY + 8}" stroke="${CHAUD}" stroke-width="1.5"/>`, texte(PAD + 100, legendeY + 12, 'départ eau chaude / boucle', { fs: 9.5 }),
      `<line x1="${PAD + 250}" y1="${legendeY + 8}" x2="${PAD + 280}" y2="${legendeY + 8}" stroke="${FROID}" stroke-width="1.5"/>`, texte(PAD + 286, legendeY + 12, 'départ eau glacée', { fs: 9.5 }),
      `<circle cx="${PAD + 400}" cy="${legendeY + 8}" r="7" fill="#ffffff" stroke="${TRAIT}" stroke-width="1.3"/>`, texte(PAD + 412, legendeY + 12, 'pompe de circuit', { fs: 9.5 }),
      texte(PAD, legendeY + 30, `Niveaux : ${niveaux.map(n => `${n} = ${n === 1 ? 'production racine' : `schéma alimenté par un circuit du niveau ${n - 1}`}`).join(' · ') || '—'}. Réseaux et consommateurs dessinés au niveau de leur circuit.`, { fs: 9, c: '#555555' }), '</g>'].join('');
    const titre = `Schéma d'ensemble de l'installation hydraulique${opts.titre ? ` — ${opts.titre}` : ''}`;
    const nr = (arbre && arbre.nonRaccordes) || [];
    const entete = `<g data-calque="CARTOUCHE">${texte(PAD, 26, titre, { fs: 15, b: true, c: '#1f3864' })}${texte(PAD, 44, `${racines.filter(r => r.type === 'schema').length} production(s) racine(s) · ${niveaux.length} niveau(x) · ${(arbre && arbre.consommateurs || []).length} consommateur(s)${nr.length ? ` dont ${nr.length} non raccordé(s)` : ''}`, { fs: 10, c: '#555555' })}${texte(PAD, 58, 'Productions à gauche ; chaque circuit (pompe, montage, régime, puissance) alimente à sa droite un schéma aval, un réseau arborescent ou des consommateurs.', { fs: 9, c: '#777777' })}</g>`;
    const corps = racines.length ? niveaux.map(n => `<g data-calque="NIVEAU_${n}">${parNiveau.get(n).join('')}</g>`).join('') : `<g data-calque="CARTOUCHE">${texte(PAD, ENTETE + 20, 'Aucun schéma de principe ni réseau dans l\'étude.', { fs: 11, c: '#777777' })}</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(larg)}" height="${Math.ceil(haut)}" viewBox="0 0 ${Math.ceil(larg)} ${Math.ceil(haut)}" data-depart="${CHAUD}" data-retour="${FROID}"><rect x="0" y="0" width="${Math.ceil(larg)}" height="${Math.ceil(haut)}" fill="#ffffff"/>${entete}${corps}${legende}</svg>`;
    return { svg, largeur: Math.ceil(larg), hauteur: Math.ceil(haut), niveaux };
  }
  const svg = (arbre, opts) => dessiner(arbre, opts).svg;
  return { svg, dessiner, noeuds };
})();
if (typeof module !== 'undefined') module.exports = Ensemble;
