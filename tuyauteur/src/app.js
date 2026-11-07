// Tuyauteur : interface (sans framework). Chaque module lit son formulaire, calcule à chaque saisie,
// affiche les résultats et l'aperçu, et prépare le PDF et le DXF à partir des mêmes dessins.
(function () {
  'use strict';
  const { fmt } = Geometrie;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mm = (v, d = 1) => v == null ? '-' : `${fmt(v, d)} mm`;
  const deg = (v, d = 2) => v == null ? '-' : `${fmt(v, d)}°`;
  const CLE = 'pipefit-tuyauteur-v1';
  let memo = {};
  try { memo = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch { memo = {}; }
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(memo)); } catch { /* stockage indisponible */ } };

  // ------------------------------------------------------------ Sélecteur de tube (DN ISO, Ø, épaisseur, coude)
  function construireTube(div) {
    const px = div.dataset.prefixe, coude = !!div.dataset.coude;
    const opts = Normes.TUBES.map(t => `<option value="${t.dn}">DN ${t.dn} - Ø ${fmt(t.de)}</option>`).join('');
    div.innerHTML = `
      <label>DN (ISO 4200 / EN 10220)<select name="${px}_dn">${opts}<option value="libre">Autre diamètre…</option></select></label>
      <div class="deux">
        <label>Ø extérieur (mm)<input name="${px}_de" type="number" step="0.1" min="1"></label>
        <label>Épaisseur (mm)<input name="${px}_ep" type="number" step="0.1" min="0" list="${px}_eps"><datalist id="${px}_eps"></datalist></label>
      </div>
      ${coude ? `<div class="deux">
        <label>Coude<select name="${px}_coude">${Normes.TYPES_COUDES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <label>Rayon à l'axe (mm)<input name="${px}_rayon" type="number" step="0.1" min="1"></label>
      </div>` : ''}`;
    const sel = div.querySelector(`[name=${px}_dn]`), de = div.querySelector(`[name=${px}_de]`), ep = div.querySelector(`[name=${px}_ep]`);
    const typeC = div.querySelector(`[name=${px}_coude]`), ray = div.querySelector(`[name=${px}_rayon]`);
    const majRayon = () => {
      if (!typeC) return;
      const r = typeC.value === 'libre' ? null : Normes.rayonCoude(sel.value, typeC.value);
      ray.readOnly = typeC.value !== 'libre';
      if (typeC.value !== 'libre') ray.value = r ?? (typeC.value === '5D' ? Math.round(2.5 * +de.value) : typeC.value === '2D' ? Math.round(+de.value) : Math.round(1.5 * +de.value));
    };
    const majDN = () => {
      const t = Normes.tube(sel.value);
      de.readOnly = !!t;
      if (t) {
        de.value = t.de;
        $(`#${px}_eps`).innerHTML = t.epaisseurs.map(e => `<option value="${e}">`).join('');
        if (!ep.value || !t.epaisseurs.includes(+ep.value)) ep.value = t.epaisseurs[Math.min(1, t.epaisseurs.length - 1)];
      }
      majRayon();
    };
    sel.addEventListener('change', majDN);
    de.addEventListener('input', majRayon);
    if (typeC) typeC.addEventListener('change', majRayon);
    sel.value = div.dataset.dn;
    majDN();
    return { lire: () => ({ de: +de.value, ep: +ep.value, rayon: ray ? +ray.value : null, dn: sel.value, coude: typeC ? typeC.value : null }) };
  }

  // ------------------------------------------------------------ Mémoire des saisies
  function restaurer(id, form) {
    const m = memo[id];
    if (!m) return;
    // DN et types de coudes d'abord (ils remplissent les autres champs)
    const ordre = el => /_(dn|coude)$/.test(el.name) ? 0 : 1;
    $$('input, select', form).filter(el => el.name && m[el.name] !== undefined).sort((a, b) => ordre(a) - ordre(b)).forEach(el => {
      if (el.type === 'radio') el.checked = el.value === m[el.name];
      else { el.value = m[el.name]; el.dispatchEvent(new Event('change')); }
    });
  }
  function memoriser(id, form) {
    const m = {};
    for (const el of $$('input, select', form)) {
      if (!el.name) continue;
      if (el.type === 'radio') { if (el.checked) m[el.name] = el.value; } else m[el.name] = el.value;
    }
    memo[id] = { ...memo[id], ...m };
    sauver();
  }
  const valeurs = form => {
    const v = {};
    for (const el of $$('input, select', form)) if (el.name && (el.type !== 'radio' || el.checked)) v[el.name] = el.value;
    return v;
  };

  // ------------------------------------------------------------ Affichage commun
  function preparerSortie(section) {
    const s = $('[data-sortie]', section);
    s.appendChild($('#tpl-sortie').content.cloneNode(true));
    return s;
  }
  function afficher(sortie, etat) {
    const err = $('.erreur', sortie), av = $('.avertissements', sortie);
    err.hidden = !etat.erreur; err.textContent = etat.erreur || '';
    av.hidden = !(etat.avertissements || []).length;
    av.innerHTML = (etat.avertissements || []).map(a => `<li>${esc(a)}</li>`).join('');
    $('.exports', sortie).hidden = !!etat.erreur;
    if (etat.erreur) { $('.resultats', sortie).innerHTML = ''; $('.apercus', sortie).innerHTML = ''; $('.tableaux', sortie).innerHTML = ''; return; }
    $('.resultats', sortie).innerHTML = etat.resultats.map(([l, v, fort]) => `<div class="carte${fort ? ' forte' : ''}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
    $('.apercus', sortie).innerHTML = etat.dessins.map(d => `<figure><figcaption>${esc(d.titre)}</figcaption>${Dessin.versSVG(d.dessin, { classe: 'apercu' })}</figure>`).join('');
    $('.tableaux', sortie).innerHTML = (etat.tableaux || []).map(t => `<h3>${esc(t.titre)}</h3><div class="tableau-defile"><table class="table"><thead><tr>${t.colonnes.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.lignes.map(l => `<tr>${l.map(c => `<td>${esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
    const gab = etat.dessins.some(d => d.gabarit);
    $('[data-echelle1]', sortie).closest('label').hidden = !gab;
    $('[data-format]', sortie).closest('label').hidden = !gab;
  }

  function telecharger(nom, contenu, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const nomFichier = s => Dessin.sansAccents(s).replace(/%%d/g, 'deg').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  // DXF : les dessins « gabarit » côte à côte (50 mm d'écart), dans leur vraie grandeur
  function dxfDe(etat) {
    const tous = Dessin.creer();
    let x = 0;
    for (const d of etat.dessins) {
      const b = Dessin.boite(d.dessin);
      Dessin.fusionner(tous, d.dessin, x - b.x0, -b.y0);
      x += b.l + 50;
    }
    return Dessin.versDXF(tous, { polylignes3d: etat.polylignes3d });
  }

  // ------------------------------------------------------------ Moteur d'un module
  function module(id, calculer, initialiser) {
    const section = $(`#${id}`), form = $('form', section), sortie = preparerSortie(section);
    const ctx = { section, form, tubes: {} };
    $$('.tube', form).forEach(div => { ctx.tubes[div.dataset.prefixe] = construireTube(div); });
    if (initialiser) initialiser(ctx);
    restaurer(id, form);
    if (ctx.apresRestauration) ctx.apresRestauration();
    let etat = null, minuteur = null;
    const maj = () => {
      if (ctx.visibilite) ctx.visibilite();
      try { etat = calculer(valeurs(form), ctx); } catch (e) {
        if (!(e instanceof Geometrie.ErreurSaisie)) console.error(e);
        etat = { erreur: e instanceof Geometrie.ErreurSaisie ? e.message : `Calcul impossible : ${e.message}` };
      }
      afficher(sortie, etat);
      memoriser(id, form);
    };
    ctx.maj = maj;
    form.addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(maj, 120); });
    form.addEventListener('change', () => { clearTimeout(minuteur); minuteur = setTimeout(maj, 30); });
    form.addEventListener('submit', e => e.preventDefault());
    $('[data-pdf]', sortie).addEventListener('click', async ev => {
      if (!etat || etat.erreur) return;
      const b = ev.currentTarget; b.disabled = true; const t = b.textContent; b.textContent = 'Préparation…';
      try {
        const octets = await ExportPDF.creer({ ...etat.pdf, resultats: etat.resultats.map(([l, v]) => [l, v]), avertissements: etat.avertissements, tableaux: etat.tableaux, dessins: etat.dessins, echelle1: $('[data-echelle1]', sortie).checked, format: $('[data-format]', sortie).value });
        telecharger(`${nomFichier(etat.pdf.titre)}.pdf`, octets, 'application/pdf');
      } catch (e) { console.error(e); alert(`PDF impossible : ${e.message}`); } finally { b.disabled = false; b.textContent = t; }
    });
    $('[data-dxf]', sortie).addEventListener('click', () => {
      if (!etat || etat.erreur) return;
      telecharger(`${nomFichier(etat.pdf.titre)}.dxf`, dxfDe(etat), 'application/dxf');
    });
    maj();
    return ctx;
  }

  // ------------------------------------------------------------ Piquage
  module('piquage', (v, ctx) => {
    const C = ctx.tubes.pqC.lire(), P = ctx.tubes.pqP.lire();
    const r = Geometrie.piquage({ D: C.de, eD: C.ep, d: P.de, ed: P.ep, angle: v.angle, excentration: v.excentration, type: v.type, hauteur: v.hauteur, divisions: v.divisions });
    const R = r.resultats, avecH = R.longueurMin != null;
    const titre = `Piquage Ø${fmt(P.de)} sur Ø${fmt(C.de)}${+v.angle !== 90 ? ` à ${fmt(+v.angle)}°` : ''}${+v.excentration ? ` excentré ${fmt(+v.excentration)}` : ''}`;
    return {
      pdf: {
        titre, sousTitre: `${r.type === 'pose' ? 'Piquage posé' : 'Piquage pénétrant'} - gabarit de coupe et gabarit du trou`,
        infos: [['Collecteur', `Ø ${fmt(C.de)} × ${fmt(C.ep)} mm`], ['Piquage', `Ø ${fmt(P.de)} × ${fmt(P.ep)} mm`], ['Angle entre axes', deg(+v.angle, 1)], ['Excentration', mm(+v.excentration || 0)], ['Type', r.type === 'pose' ? 'posé (set-on)' : 'pénétrant (set-in)'], ['Traçage coupe', `Ø${fmt(2 * r.coupe.r)} sur Ø${fmt(2 * r.coupe.R)}`], ['Traçage trou', `Ø${fmt(2 * r.trou.r)} sur Ø${fmt(2 * r.trou.R)}`]],
        pied: titre,
      },
      avertissements: r.avertissements,
      resultats: [
        ['Développé du piquage (π × Ø ext.)', mm(R.developpe), true],
        ['Profondeur de coupe (flèche)', mm(R.profondeur), true],
        ...(avecH ? [['Génératrice la plus courte', mm(R.longueurMin)], ['Génératrice la plus longue', mm(R.longueurMax)]] : [['Hauteur mini / maxi depuis l\'axe', `${fmt(R.hauteurMin)} / ${fmt(R.hauteurMax)} mm`]]),
        ['Trou : longueur suivant le collecteur', mm(R.trouLongueur)],
        ['Trou : largeur développée (corde)', `${fmt(R.trouLargeur)} mm (${fmt(R.trouCorde)})`],
      ],
      dessins: [{ titre: 'Gabarit de coupe du piquage (à enrouler)', dessin: r.dessins.gabarit, gabarit: true }, { titre: 'Gabarit du trou sur le collecteur (développé)', dessin: r.dessins.trou, gabarit: true }],
      tableaux: [{
        titre: `Table de traçage (${r.table.length - 1} divisions)`,
        colonnes: ['N°', 'Angle', 'Abscisse', 'Hauteur coupe', ...(avecH ? ['Longueur'] : []), 'Trou X', 'Trou arc'],
        lignes: r.table.map(t => [t.n, fmt(t.angle, 1) + '°', fmt(t.abscisse), fmt(t.hauteur), ...(avecH ? [fmt(t.longueur)] : []), fmt(t.trouX), fmt(t.trouS)]),
      }],
    };
  });

  // ------------------------------------------------------------ Baïonnette
  module('baionnette', (v, ctx) => {
    const T = ctx.tubes.bt.lire();
    const angle = v.angleType === 'libre' ? v.angle : v.angleType;
    const r = Geometrie.baionnette({ de: T.de, rayon: T.rayon, decalageV: v.decalageV, decalageH: v.decalageH, mode: v.mode, angle, avance: v.avance, longueur: v.longueur, jeu: v.jeu });
    const R = r.resultats, C = r.coude;
    const roule = Math.abs(R.projectionV) > 1e-9 && Math.abs(R.projectionH) > 1e-9;
    const titre = `Baïonnette Ø${fmt(T.de)} décalage ${fmt(R.decalageReel)} à ${fmt(R.angle, 1)}°`;
    return {
      pdf: {
        titre, sousTitre: roule ? 'Baïonnette orientée (renvoi roulé)' : 'Baïonnette dans un plan',
        infos: [['Tube', `Ø ${fmt(T.de)} × ${fmt(T.ep)} mm`], ['Coudes', `${T.coude === 'libre' ? 'rayon libre' : T.coude} - R ${fmt(T.rayon)} mm`], ['Décalage vertical', mm(R.projectionV)], ['Décalage horizontal', mm(R.projectionH)], ['Calcul par', { angle: 'angle imposé', avance: 'avance imposée', longueur: 'entraxe imposé' }[v.mode]], ['Jeu de soudure', mm(+v.jeu || 0)]],
        pied: titre,
      },
      avertissements: r.avertissements,
      resultats: [
        ['Angle des coudes', deg(R.angle), true],
        ['Tube droit entre coudes (coupe)', mm(R.tubeDroit), true],
        ['Décalage réel', mm(R.decalageReel)],
        ...(roule ? [['Orientation des coudes (depuis l\'horizontale)', deg(R.roulis, 1), true]] : [['Orientation',R.projectionV ? 'coudes dans le plan vertical' : 'coudes dans le plan horizontal']]),
        ['Avance (entre sommets, le long de la ligne)', mm(R.avance)],
        ['Entraxe (sommet à sommet)', mm(R.entraxe)],
        ['Réduction par coude (sommet → soudure)', mm(R.reduction)],
        ['Encombrement soudure à soudure', mm(R.encombrement)],
        ['Angle maximal possible', deg(R.angleMax, 1)],
      ],
      dessins: [{ titre: 'Croquis dans le plan du décalage', dessin: r.dessins.croquis }],
      tableaux: [{
        titre: `Recoupe de chaque coude à ${fmt(R.angle, 1)}° (mesures sur le coude)`,
        colonnes: ['Mesure', 'Longueur d\'arc'],
        lignes: [['Extrados (dos du coude)', mm(C.extrados)], ['Axe', mm(C.axe)], ['Intrados (ventre du coude)', mm(C.intrados)]],
      }],
    };
  }, ctx => {
    ctx.visibilite = () => {
      const mode = ($('input[name=mode]:checked', ctx.form) || {}).value || 'angle';
      const libre = $('[name=angleType]', ctx.form).value === 'libre';
      $$('[data-mode]', ctx.form).forEach(el => { el.hidden = el.dataset.mode !== mode || (el.hasAttribute('data-libre') && !libre); });
    };
  });

  // ------------------------------------------------------------ Renvoi 3D
  module('renvoi', (v, ctx) => {
    const T = ctx.tubes.rv.lire();
    const lignes = $$('.points tbody tr', ctx.form).map(tr => $$('input', tr).map(i => +i.value || 0));
    let pts = lignes;
    if (v.saisie === 'relatif') { const acc = [0, 0, 0]; pts = lignes.map((d, i) => { if (i === 0) return [0, 0, 0]; acc[0] += d[0]; acc[1] += d[1]; acc[2] += d[2]; return [...acc]; }); }
    const r = Geometrie.renvoi3D({ de: T.de, rayon: T.rayon, jeu: v.jeu, points: pts });
    const R = r.resultats;
    const titre = `Renvoi 3D Ø${fmt(T.de)} - ${R.nbCoudes} coude${R.nbCoudes > 1 ? 's' : ''}`;
    return {
      pdf: { titre, sousTitre: 'Ligne par sommets : angles de coudes, rotations et longueurs de coupe', infos: [['Tube', `Ø ${fmt(T.de)} × ${fmt(T.ep)} mm`], ['Coudes', `${T.coude === 'libre' ? 'rayon libre' : T.coude} - R ${fmt(T.rayon)} mm`], ['Jeu de soudure', mm(+v.jeu || 0)], ['Sommets', String(pts.length)]], pied: titre },
      avertissements: r.avertissements,
      resultats: [['Coudes', String(R.nbCoudes), true], ['Tube droit total', mm(R.longueurDroite), true], ['Longueur développée de l\'axe', mm(R.longueurAxe)]],
      dessins: [{ titre: 'Vue isométrique (longueurs de coupe en bleu)', dessin: r.dessins.iso }],
      polylignes3d: [{ pts: r.sommets, calque: 'TRACAGE' }, { pts: r.axe3D, calque: 'AXES' }],
      tableaux: [
        { titre: 'Coudes', colonnes: ['Sommet', 'Angle', 'Rotation / précédent', 'Réduction', 'Extrados', 'Axe', 'Intrados'], lignes: r.coudes.map(c => [`P${c.point}`, deg(c.angle), c.rotation == null ? '-' : deg(c.rotation, 1), fmt(c.reduction), fmt(c.extrados), fmt(c.axe), fmt(c.intrados)]) },
        { titre: 'Tronçons droits', colonnes: ['Tronçon', 'ΔX', 'ΔY', 'ΔZ', 'Entre sommets', 'Pente', 'Longueur de coupe'], lignes: r.segments.map(s => [`P${s.de} → P${s.a}`, fmt(s.dx), fmt(s.dy), fmt(s.dz), fmt(s.longueur), deg(s.pente, 1), fmt(s.coupe)]) },
      ],
    };
  }, ctx => {
    const tbody = $('.points tbody', ctx.form), saisie = $('[name=saisie]', ctx.form);
    const ligne = (vals = [0, 0, 0]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="num"></td>${vals.map(x => `<td><input type="number" step="1" value="${x}"></td>`).join('')}<td><button type="button" class="suppr" title="Supprimer ce point">×</button></td>`;
      tbody.appendChild(tr);
      numeroter();
    };
    const numeroter = () => $$('tr', tbody).forEach((tr, i) => {
      $('.num', tr).textContent = `P${i + 1}`;
      // En saisie relative, le premier point est l'origine
      $$('input', tr).forEach(inp => { inp.disabled = i === 0 && saisie.value === 'relatif'; if (inp.disabled) inp.value = 0; });
    });
    const remplir = pts => { tbody.innerHTML = ''; pts.forEach(p => ligne(p)); };
    const EXEMPLE = [[0, 0, 0], [1500, 0, 0], [0, 1200, 0], [0, 0, 800], [1000, 600, 0]];
    ctx.form.addEventListener('click', e => {
      if (e.target.closest('[data-ajout-point]')) { ligne(); ctx.maj(); }
      else if (e.target.closest('[data-exemple-points]')) { saisie.value = 'relatif'; remplir(EXEMPLE); ctx.maj(); }
      else if (e.target.closest('.suppr')) { if ($$('tr', tbody).length > 3) { e.target.closest('tr').remove(); numeroter(); ctx.maj(); } }
    });
    // Passage relatif ↔ absolu : les points restent les mêmes dans l'espace
    let modePrec = saisie.value;
    saisie.addEventListener('change', () => {
      const lig = $$('tr', tbody).map(tr => $$('input', tr).map(i => +i.value || 0));
      if (!lig.length) { modePrec = saisie.value; return; }
      if (modePrec !== saisie.value) {
        if (saisie.value === 'absolu') { const acc = [0, 0, 0]; remplir(lig.map((d, i) => { if (i) { acc[0] += d[0]; acc[1] += d[1]; acc[2] += d[2]; } return [...acc]; })); }
        else remplir(lig.map((p, i) => i ? [p[0] - lig[i - 1][0], p[1] - lig[i - 1][1], p[2] - lig[i - 1][2]] : [0, 0, 0]));
      }
      modePrec = saisie.value;
      memo.renvoiPoints = $$('tr', tbody).map(tr => $$('input', tr).map(i => +i.value || 0)); sauver();
    });
    ctx.form.addEventListener('input', () => { memo.renvoiPoints = $$('tr', tbody).map(tr => $$('input', tr).map(i => +i.value || 0)); sauver(); });
    ctx.apresRestauration = () => { modePrec = saisie.value; remplir(Array.isArray(memo.renvoiPoints) && memo.renvoiPoints.length >= 3 ? memo.renvoiPoints : EXEMPLE); };
  });

  // ------------------------------------------------------------ Développés
  module('developpe', v => {
    const r = Geometrie.developpe({ ...v, masseVolumique: v.matiere });
    const R = r.resultats, nq = r.forme === 'carre-carre' ? null : +v.divisions;
    const n = r.pieces.length;
    const f = r.fibreNeutre;
    const nomForme = { 'rond-carre': 'Rond-carré', 'carre-carre': 'Trémie carré-carré', 'rond-rond': 'Cône / réduction' }[r.forme];
    const dims = r.forme === 'rond-carre' ? [['Rectangle (bas)', `${v.A} × ${v.B} mm`], ['Rond (haut)', `Ø ${v.D} mm`]]
      : r.forme === 'carre-carre' ? [['Bas', `${v.A} × ${v.B} mm`], ['Haut', `${v.A2} × ${v.B2} mm`]]
        : [['Ø bas', `${v.D} mm`], ['Ø haut', `${v.D2} mm`]];
    return {
      pdf: {
        titre: r.titre, sousTitre: `${nomForme} - développé par triangulation, ${n} pièce${n > 1 ? 's' : ''}`,
        infos: [...dims, ['Hauteur', `${v.hauteur} mm`], ['Excentration X / Y', `${v.ex || 0} / ${v.ey || 0} mm`], ['Épaisseur', `${v.epaisseur} mm (cotes ${{ int: 'intérieures', ext: 'extérieures', moy: 'fibre neutre' }[v.cotes]})`],
          ['Fibre neutre', Object.entries(f).map(([k, x]) => `${k} ${fmt(x)}`).join(' / ')], ...(nq ? [['Divisions par quart', String(nq)]] : [])],
        pied: r.titre,
      },
      avertissements: r.avertissements,
      resultats: [
        ['Pièces', String(n), true],
        ...r.pieces.map((p, i) => [`Pièce ${i + 1} : encombrement du flan`, `${fmt(p.largeur, 0)} × ${fmt(p.hauteur, 0)} mm`, i === 0]),
        ['Surface totale', `${fmt(R.aireTotale, 3)} m²`],
        ['Masse totale', `${fmt(R.masseTotale, 1)} kg`],
      ],
      dessins: r.pieces.map((p, i) => ({ titre: `Pièce ${i + 1}/${n} : contour de découpe et lignes de pliage`, dessin: p.dessin, gabarit: true })),
      tableaux: [{ titre: 'Longueurs vraies (traçage à la main)', colonnes: ['Bas', 'Haut', 'Longueur vraie', 'En plan'], lignes: r.lignesVraies.map(l => [l.bas, l.haut, fmt(l.vraie), fmt(l.projetee)]) }],
    };
  }, ctx => {
    ctx.visibilite = () => {
      const forme = ($('input[name=forme]:checked', ctx.form) || {}).value;
      $$('[data-forme]', ctx.form).forEach(el => { el.hidden = !el.dataset.forme.split(' ').includes(forme); });
      $$('[data-forme-texte]', ctx.form).forEach(el => { el.hidden = el.dataset.formeTexte !== forme; });
      $('[name=divisions]', ctx.form).closest('label').hidden = forme === 'carre-carre';
    };
  });

  // ------------------------------------------------------------ Table des normes
  $('[data-table-normes]').innerHTML = `<thead><tr><th>DN</th><th>Ø ext. (mm)</th><th>Épaisseurs usuelles (mm)</th><th>Coude 2D R</th><th>Coude 3D R</th><th>Coude 5D R</th><th>Développé π×Ø</th></tr></thead><tbody>${Normes.TUBES.map(t => `<tr><td>${t.dn}</td><td>${fmt(t.de)}</td><td>${t.epaisseurs.map(e => fmt(e)).join(' - ')}</td><td>${t.r2D ?? '-'}</td><td>${t.r3D ?? '-'}</td><td>${t.r5D}</td><td>${fmt(Math.PI * t.de)}</td></tr>`).join('')}</tbody>`;

  // ------------------------------------------------------------ Onglets
  const ouvrir = nom => {
    $$('.onglets button').forEach(b => b.classList.toggle('actif', b.dataset.onglet === nom));
    $$('.module').forEach(s => s.classList.toggle('actif', s.id === nom));
    memo.onglet = nom; sauver();
  };
  $$('.onglets button').forEach(b => b.addEventListener('click', () => ouvrir(b.dataset.onglet)));
  if (memo.onglet && $(`#${memo.onglet}`)) ouvrir(memo.onglet);
}());
