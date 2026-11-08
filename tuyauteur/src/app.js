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
        <label>Rayon = encombrement 90° (mm)<input name="${px}_rayon" type="number" step="0.1" min="1"></label>
      </div>` : ''}`;
    const sel = div.querySelector(`[name=${px}_dn]`), de = div.querySelector(`[name=${px}_de]`), ep = div.querySelector(`[name=${px}_ep]`);
    const typeC = div.querySelector(`[name=${px}_coude]`), ray = div.querySelector(`[name=${px}_rayon]`);
    const majRayon = () => {
      if (!typeC) return;
      if (!typeC.value) typeC.value = '3D'; // type enregistré qui n'existe plus (ex. ancien coude 2D)
      const r = typeC.value === 'libre' ? null : Normes.rayonCoude(sel.value, typeC.value);
      ray.readOnly = typeC.value !== 'libre';
      if (typeC.value !== 'libre') ray.value = r ?? (typeC.value === '5D' ? Math.round(2.5 * +de.value) : Math.round(1.5 * +de.value));
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
    if (memo[id]) remplir(form, memo[id]);
  }
  function memoriser(id, form) {
    const m = {};
    for (const el of $$('input, select', form)) {
      if (!el.name) continue;
      if (el.type === 'radio') { if (el.checked) m[el.name] = el.value; } else if (el.type === 'checkbox') m[el.name] = el.checked; else m[el.name] = el.value;
    }
    memo[id] = { ...memo[id], ...m };
    sauver();
  }
  const valeurs = form => {
    const v = {};
    for (const el of $$('input, select', form)) {
      if (!el.name || el.closest('[data-hors-saisie]')) continue;
      if (el.type === 'checkbox') v[el.name] = el.checked;
      else if (el.type !== 'radio' || el.checked) v[el.name] = el.value;
    }
    return v;
  };
  // Remplit un formulaire avec des valeurs enregistrées (DN et coudes d'abord, ils remplissent les autres champs)
  function remplir(form, m) {
    const ordre = el => /_(dn|coude)$/.test(el.name) ? 0 : /^(fixation|materiau|forme|type)$/.test(el.name) ? 1 : 2;
    $$('input, select', form).filter(el => el.name && m[el.name] !== undefined).sort((a, b) => ordre(a) - ordre(b)).forEach(el => {
      if (el.type === 'radio') el.checked = el.value === m[el.name];
      else if (el.type === 'checkbox') el.checked = m[el.name] === true;
      else { el.value = m[el.name]; el.dispatchEvent(new Event('change')); }
    });
  }


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
    if (etat.erreur) { $('.extra', sortie).innerHTML = etat.html || ''; $('.resultats', sortie).innerHTML = ''; $('.apercus', sortie).innerHTML = ''; $('.tableaux', sortie).innerHTML = ''; return; }
    $('.extra', sortie).innerHTML = etat.html || '';
    $('.resultats', sortie).innerHTML = etat.resultats.map(([l, v, fort]) => `<div class="carte${fort ? ' forte' : ''}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
    $('.apercus', sortie).innerHTML = etat.dessins.map(d => `<figure><figcaption>${esc(d.titre)}</figcaption>${Dessin.versSVG(d.dessin, { classe: 'apercu' })}</figure>`).join('');
    $('.tableaux', sortie).innerHTML = (etat.tableaux || []).map(t => `<h3>${esc(t.titre)}</h3><div class="tableau-defile"><table class="table"><thead><tr>${t.colonnes.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.lignes.map(l => `<tr>${l.map(c => `<td${typeof c === 'string' && c.length > 24 && /[a-zé]{3}/i.test(c) ? ' class="texte"' : ''}>${esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
    const gab = (etat.export || etat).dessins.some(d => d.gabarit);
    $('[data-pdf]', sortie).textContent = etat.libellePDF || 'Télécharger le PDF';
    $('[data-dxf]', sortie).textContent = etat.libelleDXF || 'Télécharger le DXF';
    $('[data-dxf]', sortie).hidden = etat.dxf === false;
    $('[data-echelle1]', sortie).closest('label').hidden = !gab;
    $('[data-format]', sortie).closest('label').hidden = !gab;
  }

  // Message bref en bas de l'écran (remplace alert(), bloqué dans certaines vues)
  let minuteurMsg = null;
  function annoncer(texte, erreur = false) {
    let el = $('#annonce');
    if (!el) { el = document.createElement('div'); el.id = 'annonce'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = texte; el.className = erreur ? 'erreur-annonce' : ''; el.hidden = false;
    clearTimeout(minuteurMsg); minuteurMsg = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // Archive ZIP sans compression (un seul fichier) : sert à livrer un DXF là où seul le .zip est accepté
  const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  function zipUnFichier(nom, contenu) {
    const data = typeof contenu === 'string' ? new TextEncoder().encode(contenu) : new Uint8Array(contenu);
    const n = new TextEncoder().encode(nom);
    let crc = 0xffffffff; for (const o of data) crc = CRC[(crc ^ o) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
    const loc = new DataView(new ArrayBuffer(30)), cen = new DataView(new ArrayBuffer(46)), fin = new DataView(new ArrayBuffer(22));
    [[0, 0x04034b50, 4], [4, 20, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2]].forEach(([o, v, t]) => t === 4 ? loc.setUint32(o, v, true) : loc.setUint16(o, v, true));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2]].forEach(([o, v, t]) => t === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true));
    const tailleLoc = 30 + n.length + data.length;
    [[0, 0x06054b50, 4], [8, 1, 2], [10, 1, 2], [12, 46 + n.length, 4], [16, tailleLoc, 4]].forEach(([o, v, t]) => t === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true));
    return new Blob([loc, n, data, cen, n, fin]);
  }

  async function telecharger(nom, contenu, type) {
    // Dans une page claude.ai, les fichiers passent par le lecteur (confirmation de l'utilisateur)
    const enLecteur = window.claude && typeof window.claude.use === 'function';
    if (enLecteur) {
      const dl = await window.claude.use('downloads');
      if (dl) {
        const dxf = /\.dxf$/i.test(nom);
        try {
          await dl.save(dxf ? { filename: nom.replace(/\.dxf$/i, '.zip'), data: zipUnFichier(nom, contenu) } : { filename: nom, data: new Blob([contenu], { type }) });
          if (dxf) annoncer('DXF enregistré dans un fichier .zip : le décompresser avant la découpe.');
        } catch (e) {
          if (e && e.code !== 'declined') annoncer(`Téléchargement impossible ici (${e.code || e.message}).`, true);
        }
        return;
      }
    }
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
    // Les gabarits seuls (pièces à découper) s'il y en a, sinon tous les dessins
    const ex = etat.export || etat;
    const choix = ex.dessins.some(d => d.gabarit) ? ex.dessins.filter(d => d.gabarit) : ex.dessins;
    for (const d of choix) {
      const b = Dessin.boite(d.dessin);
      Dessin.fusionner(tous, d.dessin, x - b.x0, -b.y0);
      x += b.l + 50;
    }
    return Dessin.versDXF(tous, { polylignes3d: etat.polylignes3d });
  }

  // Champs conditionnels : data-si="nom=valeur1|valeur2" (plusieurs conditions séparées par « ; »)
  function visibilite(form) {
    const v = valeurs(form);
    $$('[data-si]', form).forEach(el => {
      el.hidden = !el.dataset.si.split(';').every(c => { const [n, vals] = c.split('='); return vals.split('|').includes(String(v[n])); });
    });
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
      visibilite(form);
      if (ctx.visibilite) ctx.visibilite();
      try { etat = calculer(valeurs(form), ctx); } catch (e) {
        if (!(e instanceof Dessin.ErreurSaisie)) console.error(e);
        etat = { erreur: e instanceof Dessin.ErreurSaisie ? e.message : `Calcul impossible : ${e.message}`, html: ctx.htmlErreur ? ctx.htmlErreur() : '' };
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
        const ex = etat.export || etat;
        const octets = await ExportPDF.creer({ ...(ex.pdf || etat.pdf), resultats: ex.resultats.map(([l, v]) => [l, v]), avertissements: ex.avertissements, tableaux: ex.tableaux, dessins: ex.dessins, echelle1: $('[data-echelle1]', sortie).checked, format: $('[data-format]', sortie).value });
        telecharger(`${nomFichier((ex.pdf || etat.pdf).titre)}.pdf`, octets, 'application/pdf');
      } catch (e) { console.error(e); annoncer(`PDF impossible : ${e.message}`, true); } finally { b.disabled = false; b.textContent = t; }
    });
    $('[data-dxf]', sortie).addEventListener('click', () => {
      if (!etat || etat.erreur) return;
      telecharger(`${nomFichier(((etat.export && etat.export.pdf) || etat.pdf).titre)}.dxf`, dxfDe(etat), 'application/dxf');
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
        ['Encombrement de chaque coude (sommet → soudure)', mm(R.reduction)],
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

  // ------------------------------------------------------------ Platines
  const ctxPlatine = module('platine', v => {
    const r = Platine.platine({ ...v, cotes: true });
    const R = r.resultats;
    const dims = r.forme === 'rond' ? `Ø${fmt(+v.D, 0)}` : `${fmt(+v.L, 0)} × ${fmt(+v.l, 0)}`;
    const titre = `Platine ${v.repere || ''} ${dims} ép. ${fmt(+v.epaisseur, 0)}`.replace(/\s+/g, ' ');
    return {
      pdf: { titre, sousTitre: 'Platine pour découpe laser', infos: [['Dimensions', `${dims} mm`], ['Épaisseur', mm(+v.epaisseur, 0)], ['Trous', `${R.nbTrous} trou${R.nbTrous > 1 ? 's' : ''}`], ['Quantité', String(R.quantite)]], pied: titre },
      avertissements: r.avertissements,
      resultats: [['Masse unitaire', `${fmt(R.masse, 2)} kg`, true], ['Masse totale', `${fmt(R.masseTotale, 2)} kg`], ['Surface nette', `${fmt(R.aire, 4)} m²`], ['Longueur de découpe (total)', `${fmt(R.longueurDecoupe, 2)} m`], ['Trous', String(R.nbTrous)]],
      dessins: [{ titre: `${v.repere || 'Platine'} - contour et trous`, dessin: r.dessin, gabarit: true }],
      tableaux: r.trous.length ? [{ titre: 'Position des trous (depuis le coin bas gauche)', colonnes: ['N°', 'X', 'Y', 'Ø'], lignes: r.trous.map((t, i) => [i + 1, fmt(t.dx), fmt(t.dy), fmt(+v.dTrou)]) }] : [],
    };
  });
  const ouvrirPlatine = vals => { remplir(ctxPlatine.form, vals); ctxPlatine.maj(); ouvrir('platine'); window.scrollTo(0, 0); };

  // ------------------------------------------------------------ Brides
  const ctxBrides = module('brides', (v, ctx) => {
    let html = '', rec = null;
    if (+v.rmesure > 0) {
      try {
        rec = Brides.reconnaitre({ n: v.rn, mode: v.rmode, mesure: v.rmesure, dTrou: v.rdTrou, D: v.rD });
        ctx.candidats = rec.candidats;
        const libC = { forte: 'certitude forte', moyenne: 'certitude moyenne', faible: 'certitude faible', aucune: 'aucune bride' }[rec.certitude];
        html = `<h3>Bride reconnue <span class="badge ${rec.certitude}">${libC}</span></h3>
          <p class="aide">Ø de perçage calculé : <b>${fmt(rec.K)} mm</b> (entraxe de deux trous voisins ${fmt(rec.entraxeVoisins)} mm).</p>
          <div class="candidats">${rec.candidats.length ? rec.candidats.map((c, i) => `<div class="candidat${i ? '' : ' premier'}">
            <div><b>${esc(c.designation)}</b><div class="doux">D ${fmt(c.D)} - perçage ${fmt(c.K)} (${c.ecartK >= 0 ? '+' : ''}${fmt(c.ecartK)}) - ${c.n} trous Ø${fmt(c.L)} - ${esc(c.filetage)}</div></div>
            <div class="boutons">${c.norme === 'EN 1092-1' ? `<button type="button" data-utiliser="${i}">Boulonnerie</button>` : ''}<button type="button" data-platine-bride="${i}">Bride pleine (platine)</button></div>
          </div>`).join('') : '<p>Aucune bride normalisée avec ce nombre de trous.</p>'}</div>`;
      } catch (e) {
        if (!(e instanceof Dessin.ErreurSaisie)) throw e;
        html = `<div class="erreur">${esc(e.message)}</div>`;
      }
    } else ctx.candidats = [];
    const opts = { montage: v.montage, fixation: v.fixation, joint: v.joint, rondelles: v.rondelles, jointVanne: v.jointVanne };
    const b = Brides.boulonnerie({ ...opts, dn: v.dn, pn: v.pn, epaisseur: v.epaisseur, epaisseur2: v.epaisseur2, faceAFace: v.faceAFace, engagement: v.engagement });
    const ab = Brides.abaque(opts);
    const br = b.bride;
    const titre = `Boulonnerie DN ${br.dn} PN ${br.pn} - ${Brides.MONTAGES[b.montage].split(' (')[0]}`;
    const bDessin = rec && rec.candidats.length ? rec.candidats[0] : { ...br, designation: `DN ${br.dn} PN ${br.pn}` };
    return {
      html,
      pdf: { titre, sousTitre: Brides.MONTAGES[b.montage], infos: [['Bride', `EN 1092-1 DN ${br.dn} PN ${br.pn}`], ['Perçage', `${br.n} trous Ø${br.L} sur Ø${br.K}`], ['Ø extérieur', mm(br.D, 0)], ['Joint', mm(+v.joint)], ['Rondelles', v.rondelles ? 'oui' : 'non']], pied: titre },
      avertissements: b.avertissements,
      resultats: [
        ['Boulonnerie', b.designation, true],
        ['Longueur calculée', mm(b.longueurCalc)],
        ['Serrage (épaisseurs cumulées)', mm(b.serrage)],
        ['Bride', `${br.n} trous Ø${br.L} sur Ø${br.K}`],
        ...(b.rondelles ? [['Rondelles', `${b.rondelles}`]] : []),
        ['Détail', b.detail],
      ],
      dessins: [{ titre: rec && rec.candidats.length ? `Bride reconnue : ${bDessin.designation}` : `Bride DN ${br.dn} PN ${br.pn}`, dessin: Brides.dessinBride(bDessin, rec ? rec.K : null) }],
      tableaux: [{ titre: `Abaque des longueurs : ${Brides.MONTAGES[b.montage]}${v.fixation === 'vis' && b.montage !== 'papillon-taraude' ? ', vis + écrou' : b.montage === 'papillon-taraude' ? ', vis par côté' : ', tiges filetées'}`, colonnes: ['DN', ...Brides.PNS.map(p => `PN ${p}`)], lignes: ab.map(r => [r.dn, ...r.pns.map(c => c ? c.texte : '-')]) }],
    };
  }, ctx => {
    $('[name=dn]', ctx.form).innerHTML = Brides.DNS.map(d => `<option value="${d}"${d === 100 ? ' selected' : ''}>DN ${d}</option>`).join('');
    ctx.section.addEventListener('click', e => {
      const u = e.target.closest('[data-utiliser]'), pl = e.target.closest('[data-platine-bride]');
      if (u) {
        const c = ctx.candidats[+u.dataset.utiliser];
        $('[name=dn]', ctx.form).value = c.dn; $('[name=pn]', ctx.form).value = c.pns[c.pns.length - 1];
        ctx.maj();
      } else if (pl) {
        const c = ctx.candidats[+pl.dataset.platineBride];
        ouvrirPlatine({ repere: `Bride pleine ${c.norme === 'EN 1092-1' ? `DN${c.dn} PN${c.pns.join('-')}` : `${c.nps}" cl.${c.classe}`}`, forme: 'rond', D: c.D, disposition: 'cercle', n: c.n, pcd: c.K, dTrou: c.L, angleDepart: '', dCentral: 0 });
      }
    });
  });
  void ctxBrides;

  // ------------------------------------------------------------ Escaliers et passerelles
  module('escalier', v => {
    const r = Escalier.calculer(v);
    const passerelle = v.type === 'passerelle';
    const titre = passerelle ? `Passerelle H ${fmt(+v.H1, 0)} / ${fmt(+v.H2, 0)} - partie droite ${fmt(+v.droite, 0)}` : `Escalier H ${fmt(+v.H1, 0)}`;
    const noms = ['Montée', 'Descente'];
    return {
      pdf: { titre, sousTitre: 'Escalier industriel : marches, limons, garde-corps et débit', infos: [['Largeur de passage', mm(+v.largeur, 0)], ['Limons', `plat ${v.limonL} × ${v.limonE}`], ['Garde-corps', { deux: 'deux côtés', un: 'un côté', aucun: 'aucun' }[v.gardeCorps]], ['Plinthe', v.plinthe && v.gardeCorps !== 'aucun' ? `${v.hPlinthe} mm${v.plintheVolees ? ', volées comprises' : ''}` : 'non']], pied: titre },
      avertissements: r.avertissements,
      resultats: [
        ...r.volees.flatMap((vl, i) => [[`${passerelle ? noms[i] : 'Marches'} : ${vl.n} hauteurs de`, mm(vl.h, 1), true], [`${passerelle ? noms[i] + ' : ' : ''}giron × angle`, `${fmt(vl.g)} mm × ${fmt(vl.alpha, 1)}°`]]),
        ['Longueur au sol (limon à limon)', mm(r.emprise, 0)],
        ...(r.poteaux ? [['Poteaux de garde-corps', String(r.poteaux)]] : []),
      ],
      dessins: [
        { titre: 'Élévation', dessin: r.dessins.elevation },
        ...r.dessins.limons.map(l => ({ titre: `${l.nom} à plat (×${l.quantite}) : traits des marches en tirets`, dessin: l.dessin, gabarit: true })),
      ],
      tableaux: [
        { titre: 'Volées', colonnes: ['Volée', 'Hauteur', 'Hauteurs de marche', 'h', 'Giron', 'Angle', 'g + 2h', 'Reculement', 'Rampant'], lignes: r.volees.map((vl, i) => [passerelle ? noms[i] : 'Escalier', fmt(vl.H, 0), vl.n, fmt(vl.h, 1), fmt(vl.g, 1), `${fmt(vl.alpha, 1)}°`, fmt(vl.blondel, 0), fmt(vl.reculement, 0), fmt(vl.rampant, 0)]) },
        { titre: 'Débit', colonnes: ['Pièce', 'Section', 'Qté', 'Longueur', 'Observations'], lignes: r.debit.map(d => [d[0], d[1], d[2], fmt(d[3], 0), d[4]]) },
        { titre: 'Traçage des nez de marche (montée, depuis le pied de la 1re contremarche)', colonnes: ['Marche', 'X', 'Y'], lignes: r.tableauMarches.map(m => [m.k, fmt(m.x), fmt(m.y)]) },
      ],
    };
  });

  // ------------------------------------------------------------ Carnet de supportage
  memo.carnet = Array.isArray(memo.carnet) ? memo.carnet : [];
  const paramsSupport = vals => ({ ...vals, de: +vals.sp_de });
  module('supportage', (v, ctx) => {
    const cour = Supportage.support(paramsSupport(v));
    const carnet = memo.carnet.map(c => { try { return Supportage.support(paramsSupport(c)); } catch (e) { return { repere: c.repere, erreur: e.message, pieces: [], platines: [], quincaillerie: [], masse: 0, resume: e.message }; } });
    const enCours = ctx.enCours;
    $('[data-carnet-ajout]', ctx.form).textContent = enCours != null && memo.carnet[enCours] ? `Mettre à jour ${memo.carnet[enCours].repere}` : 'Ajouter au carnet';
    const html = `<h3>Carnet (${carnet.length} support${carnet.length > 1 ? 's' : ''})</h3>${carnet.length ? `<div class="tableau-defile"><table class="table carnet"><thead><tr><th>Repère</th><th>Qté</th><th>Tube</th><th>Description</th><th>Masse</th><th></th></tr></thead><tbody>${carnet.map((s, i) => `<tr class="${i === enCours ? 'encours' : ''}"><td>${esc(s.repere)}</td><td>${s.quantite || ''}</td><td>Ø${fmt(+memo.carnet[i].sp_de)}</td><td style="text-align:left;white-space:normal">${esc(s.resume)}</td><td>${fmt(s.masse)} kg</td><td><div class="boutons"><button type="button" data-carnet-modif="${i}">Modifier</button><button type="button" data-carnet-copie="${i}">Copier</button><button type="button" data-carnet-suppr="${i}">×</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="aide">Le carnet est vide : régler un support à gauche puis « Ajouter au carnet ».</p>'}`;
    const lignesSupport = s => s.pieces.map(x => [s.repere, x[0].replace(`${s.repere} `, ''), x[1], x[2] * (s.quantite || 1), fmt(x[3], 0), x[4]]);
    const vue = s => [
      { titre: `${s.repere} - ${s.resume} (×${s.quantite})`, dessin: s.dessin },
      ...s.platines.map(pl => ({ titre: `${pl.nom} (×${pl.quantite})`, dessin: pl.dessin, gabarit: true })),
    ];
    const tabSupport = s => [
      { titre: `${s.repere} : débit`, colonnes: ['Repère', 'Pièce', 'Profilé', 'Qté', 'Longueur', 'Usinage'], lignes: lignesSupport(s) },
      { titre: `${s.repere} : quincaillerie`, colonnes: ['Article', 'Qté', 'Observations'], lignes: s.quincaillerie.map(qq => [qq[0], qq[1], qq[2]]) },
    ];
    // Export : tout le carnet s'il n'est pas vide, sinon le support en cours
    const liste = carnet.filter(s => !s.erreur);
    const base = liste.length ? liste : [cour];
    const recap = Supportage.recapitulatif(base);
    const exportCarnet = {
      pdf: { titre: liste.length ? `Carnet de supportage (${liste.length} supports)` : `Support ${cour.repere}`, sousTitre: 'Supports de tuyauterie fabriqués sur mesure : débit, platines et quincaillerie', infos: [['Supports', String(base.length)], ['Pièces', String(base.reduce((t, s) => t + (s.quantite || 1), 0))]], pied: 'Carnet de supportage' },
      resultats: [['Masse totale d\'acier', `${fmt(recap.masse)} kg`]],
      avertissements: base.flatMap(s => (s.avertissements || []).map(a => `${s.repere} : ${a}`)),
      tableaux: [
        { titre: 'Récapitulatif des profilés', colonnes: ['Profilé', 'Pièces', 'Longueur totale', 'Barres de 6 m', 'Masse'], lignes: recap.profils.map(r => [r.prof, r.pieces, fmt(r.longueur, 0), r.barres6m, `${fmt(r.masse)} kg`]) },
        { titre: 'Récapitulatif de la quincaillerie', colonnes: ['Article', 'Qté'], lignes: recap.quincaillerie.map(r => [r.nom, r.n]) },
        { titre: 'Débit détaillé', colonnes: ['Repère', 'Pièce', 'Profilé', 'Qté', 'Longueur', 'Usinage'], lignes: base.flatMap(lignesSupport) },
      ],
      dessins: base.flatMap(vue),
    };
    return {
      html,
      libellePDF: liste.length ? `PDF du carnet (${liste.length})` : 'PDF du support',
      libelleDXF: 'DXF des platines',
      pdf: exportCarnet.pdf,
      export: exportCarnet,
      avertissements: cour.avertissements,
      resultats: [['Support en cours', `${cour.repere} (×${cour.quantite})`, true], ['Masse', `${fmt(cour.masse)} kg`], ['Axe → dessus du profil', mm(cour.hauteurAxeProfil, 0)], ['Description', cour.resume]],
      dessins: vue(cour),
      tableaux: tabSupport(cour),
    };
  }, ctx => {
    const opts = Object.entries(Supportage.PROFILS).map(([k, p]) => `<option value="${k}">${p[0]}</option>`).join('');
    $$('[data-profils]', ctx.form).forEach(s => { s.innerHTML = opts; });
    $('[name=profil]', ctx.form).value = 'L50'; $('[name=profilPoteau]', ctx.form).value = 'T60';
    const modes = () => {
      const f = $('[name=fixation]', ctx.form).value, m = $('[name=materiau]', ctx.form).value;
      const sel = $('[name=mode]', ctx.form), ancien = sel.value;
      const liste = Supportage.FIXATIONS[f === 'sol' ? 'sol' : m];
      sel.innerHTML = liste.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
      if (liste.some(([v]) => v === ancien)) sel.value = ancien;
    };
    $('[name=fixation]', ctx.form).addEventListener('change', modes);
    $('[name=materiau]', ctx.form).addEventListener('change', modes);
    modes();
    ctx.enCours = null;
    const prochainRepere = () => { let n = memo.carnet.length + 1; while (memo.carnet.some(c => c.repere === `S${n}`)) n++; return `S${n}`; };
    ctx.form.addEventListener('click', e => {
      if (e.target.closest('[data-carnet-ajout]')) {
        const vals = valeurs(ctx.form);
        try { Supportage.support(paramsSupport(vals)); } catch (err) { annoncer(err.message, true); return; } // refuse un support incalculable
        if (ctx.enCours != null && memo.carnet[ctx.enCours]) memo.carnet[ctx.enCours] = vals; else memo.carnet.push(vals);
        ctx.enCours = null;
        $('[name=repere]', ctx.form).value = prochainRepere();
        sauver(); ctx.maj();
      } else if (e.target.closest('[data-carnet-nouveau]')) {
        ctx.enCours = null; $('[name=repere]', ctx.form).value = prochainRepere(); ctx.maj();
      }
    });
    ctx.section.addEventListener('click', e => {
      const m = e.target.closest('[data-carnet-modif]'), c = e.target.closest('[data-carnet-copie]'), s = e.target.closest('[data-carnet-suppr]');
      if (m) { ctx.enCours = +m.dataset.carnetModif; remplir(ctx.form, memo.carnet[ctx.enCours]); ctx.maj(); window.scrollTo(0, 0); }
      else if (c) { const v = { ...memo.carnet[+c.dataset.carnetCopie] }; ctx.enCours = null; remplir(ctx.form, v); $('[name=repere]', ctx.form).value = prochainRepere(); ctx.maj(); }
      else if (s) {
        const i = +s.dataset.carnetSuppr;
        // Suppression en deux temps (pas de fenêtre de confirmation)
        if (s.dataset.confirme) { memo.carnet.splice(i, 1); if (ctx.enCours === i) ctx.enCours = null; sauver(); ctx.maj(); }
        else { s.dataset.confirme = '1'; s.textContent = 'Supprimer ?'; s.classList.add('danger'); setTimeout(() => { if (s.isConnected) { delete s.dataset.confirme; s.textContent = '×'; s.classList.remove('danger'); } }, 4000); }
      }
    });
  });

  // ------------------------------------------------------------ Calculateur de poids
  memo.poidsListe = Array.isArray(memo.poidsListe) ? memo.poidsListe : [];
  const paramsPoids = (v, ctx) => {
    const t = ctx ? ctx.tubes.pd.lire() : { de: +v.pd_de, ep: +v.pd_ep };
    return { ...v, de: v.type === 'rond' ? v.dRond : t.de, ep: v.type === 'tube' ? t.ep : v.epProfil };
  };
  const kg = x => `${fmt(x, 2)} kg`;
  module('poids', (v, ctx) => {
    const cour = Poids.piece(paramsPoids(v, ctx));
    const lignes = memo.poidsListe.map(l => { try { return Poids.piece(l); } catch (e) { return null; } }).filter(Boolean);
    const tot = Poids.liste(lignes);
    const tableau = lignes.length ? `<h3>Liste (${lignes.length} ligne${lignes.length > 1 ? 's' : ''}) : ${kg(tot.total)}</h3><div class="tableau-defile"><table class="table carnet"><thead><tr><th>Désignation</th><th>Matière</th><th>Qté</th><th>Unitaire</th><th>Total</th><th></th></tr></thead><tbody>${lignes.map((l, i) => `<tr><td style="text-align:left;white-space:normal">${esc(l.designation)}</td><td>${esc(l.matiere)}</td><td>${l.quantite}</td><td>${kg(l.unitaire)}</td><td>${kg(l.total)}</td><td><div class="boutons"><button type="button" data-poids-suppr="${i}">×</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="aide">La liste est vide : régler une pièce à gauche puis « Ajouter à la liste ».</p>';
    const res = [
      ['Masse de la pièce', kg(cour.unitaire), true],
      ...(cour.quantite > 1 ? [[`Masse × ${cour.quantite}`, kg(cour.total), true]] : []),
      ...(cour.kgm != null ? [['Masse linéique', `${fmt(cour.kgm, 2)} kg/m`]] : []),
      ...(cour.kgm2 != null ? [['Masse surfacique', `${fmt(cour.kgm2, 2)} kg/m²`]] : []),
      ...(cour.service ? [['En service (tube + contenu + calorifuge)', `${fmt(cour.service.total, 2)} kg/m`, true], ['Contenu / calorifuge', `${fmt(cour.service.contenu, 2)} / ${fmt(cour.service.isolant, 2)} kg/m`]] : []),
      ...(cour.detail ? [['Détail', cour.detail]] : []),
    ];
    const lignesTab = lignes.map(l => [l.designation, l.matiere, l.quantite, l.kgm != null ? fmt(l.kgm, 2) : `${fmt(l.kgm2, 2)} /m²`, fmt(l.unitaire, 2), fmt(l.total, 2)]);
    return {
      html: tableau,
      libellePDF: lignes.length ? `PDF de la liste (${lignes.length})` : 'PDF de la pièce',
      dxf: false,
      pdf: { titre: `Poids : ${cour.designation}`, infos: [['Matière', cour.matiere], ['Quantité', String(cour.quantite)]], pied: 'Calculateur de poids' },
      export: {
        pdf: { titre: lignes.length ? `Liste de poids : ${fmt(tot.total, 1)} kg` : `Poids : ${cour.designation}`, sousTitre: 'Masses théoriques, tolérances de laminage non comprises', infos: [['Lignes', String(Math.max(1, lignes.length))]], pied: 'Calculateur de poids' },
        resultats: lignes.length ? [['Masse totale', kg(tot.total)], ...tot.parMatiere.map(m => [m.matiere, kg(m.kg)])] : res.map(([a, b]) => [a, b]),
        avertissements: [],
        tableaux: lignes.length ? [{ titre: 'Liste des pièces', colonnes: ['Désignation', 'Matière', 'Qté', 'kg/m', 'Unitaire kg', 'Total kg'], lignes: [...lignesTab, ['Total', '', '', '', '', fmt(tot.total, 2)]] }] : [],
        dessins: [],
      },
      avertissements: [],
      resultats: res,
      dessins: [],
      tableaux: [],
    };
  }, ctx => {
    const sel = $('[name=taille]', ctx.form), type = $('[name=type]', ctx.form);
    const tailles = () => {
      const t = Poids.POUTRELLES[type.value];
      if (!t) return;
      const ancien = sel.value;
      sel.innerHTML = Object.keys(t).map(k => `<option value="${k}">${type.value} ${k}</option>`).join('');
      sel.value = t[ancien] ? ancien : Object.keys(t)[Math.min(5, Object.keys(t).length - 1)];
    };
    type.addEventListener('change', tailles);
    tailles();
    ctx.form.addEventListener('click', e => {
      if (e.target.closest('[data-poids-ajout]')) {
        const vals = paramsPoids(valeurs(ctx.form), ctx);
        try { Poids.piece(vals); } catch (err) { annoncer(err.message, true); return; }
        memo.poidsListe.push(vals); sauver(); ctx.maj(); annoncer('Pièce ajoutée à la liste.');
      } else if (e.target.closest('[data-poids-vider]')) {
        const b = e.target.closest('[data-poids-vider]');
        if (!memo.poidsListe.length) return;
        if (b.dataset.confirme) { memo.poidsListe = []; sauver(); ctx.maj(); delete b.dataset.confirme; b.textContent = 'Vider la liste'; }
        else { b.dataset.confirme = '1'; b.textContent = 'Confirmer : vider ?'; setTimeout(() => { delete b.dataset.confirme; b.textContent = 'Vider la liste'; }, 4000); }
      }
    });
    ctx.section.addEventListener('click', e => {
      const s = e.target.closest('[data-poids-suppr]');
      if (s) { memo.poidsListe.splice(+s.dataset.poidsSuppr, 1); sauver(); ctx.maj(); }
    });
  });

  // ------------------------------------------------------------ Encombrement des coudes
  const e45 = R => R == null ? null : R * Math.tan(22.5 * Math.PI / 180);
  const f0 = v => v == null ? '-' : fmt(v, 0);
  module('coudes', (v, ctx) => {
    const T = ctx.tubes.cd.lire();
    const c90 = Geometrie.coude({ de: T.de, rayon: T.rayon, angle: 90 }), c45 = Geometrie.coude({ de: T.de, rayon: T.rayon, angle: 45 });
    const a = +v.angle;
    const cA = v.angle !== '' && a > 0 && a !== 90 && a !== 45 ? Geometrie.coude({ de: T.de, rayon: T.rayon, angle: a }) : null;
    const type = T.coude === 'libre' ? `R ${fmt(T.rayon)}` : `${T.coude} (R ${fmt(T.rayon)})`;
    const titre = `Encombrement coudes Ø${fmt(T.de)} ${type}`;
    const tous = [c90, c45, ...(cA ? [cA] : [])];
    return {
      dxf: false,
      pdf: { titre, sousTitre: 'Encombrement = R × tan(angle / 2), du sommet à la face', infos: [['Tube', `Ø ${fmt(T.de)} mm`], ['Coude', type]], pied: titre },
      avertissements: [],
      resultats: [
        ['Encombrement coude 90°', mm(c90.encombrement), true],
        ['Encombrement coude 45°', mm(c45.encombrement), true],
        ...(cA ? [[`Encombrement coude ${fmt(a, a % 1 ? 1 : 0)}°`, mm(cA.encombrement), true]] : []),
        ['Rayon à l\'axe', mm(T.rayon)],
      ],
      dessins: tous.map(c => ({ titre: `Coude ${fmt(c.angle, c.angle % 1 ? 1 : 0)}°`, dessin: c.dessin })),
      tableaux: [
        { titre: 'Encombrements EN 10253-2 : 90° / 45° (mm)', colonnes: ['DN', 'Ø ext.', '3D 90°', '3D 45°', '5D 90°', '5D 45°'], lignes: Normes.TUBES.map(t => [t.dn, fmt(t.de), f0(t.r3D), f0(e45(t.r3D)), f0(t.r5D), f0(e45(t.r5D))]) },
        { titre: 'Arcs le long du coude', colonnes: ['Coude', 'Encombrement', 'Extrados', 'Axe', 'Intrados'], lignes: tous.map(c => [`${fmt(c.angle, c.angle % 1 ? 1 : 0)}°`, fmt(c.encombrement), fmt(c.extrados), fmt(c.axe), fmt(c.intrados)]) },
      ],
    };
  });

  // ------------------------------------------------------------ Table des normes
  $('[data-table-normes]').innerHTML = `<thead><tr><th>DN</th><th>Ø ext. (mm)</th><th>Épaisseurs usuelles (mm)</th><th>3D 90°</th><th>3D 45°</th><th>5D 90°</th><th>5D 45°</th><th>Développé π×Ø</th></tr></thead><tbody>${Normes.TUBES.map(t => `<tr><td>${t.dn}</td><td>${fmt(t.de)}</td><td>${t.epaisseurs.map(e => fmt(e)).join(' - ')}</td><td>${f0(t.r3D)}</td><td>${f0(e45(t.r3D))}</td><td>${f0(t.r5D)}</td><td>${f0(e45(t.r5D))}</td><td>${fmt(Math.PI * t.de)}</td></tr>`).join('')}</tbody>`;

  // ------------------------------------------------------------ Navigation : accueil à grosses touches, un outil par écran
  // L'adresse porte l'outil ouvert (#piquage…) : la touche « retour » du téléphone ramène au menu.
  const TITRES = Object.fromEntries($$('.tuile').map(b => [b.dataset.onglet, b.querySelector('b').textContent]));
  const naviguer = () => {
    const nom = location.hash.slice(1);
    const outil = TITRES[nom] && $(`#${nom}.module`) ? nom : null;
    $$('.module').forEach(s => s.classList.toggle('actif', s.id === outil));
    $('#accueil').classList.toggle('actif', !outil);
    $('[data-accueil]').hidden = !outil;
    $('[data-titre-module]').textContent = outil ? TITRES[outil] : '';
    document.title = outil ? `${TITRES[outil]} - Pipe-Fit Tuyauteur` : 'Pipe-Fit Tuyauteur';
    window.scrollTo(0, 0);
  };
  const ouvrir = nom => { if (location.hash.slice(1) === nom) naviguer(); else location.hash = nom; };
  $$('.tuile').forEach(b => b.addEventListener('click', () => ouvrir(b.dataset.onglet)));
  $('[data-accueil]').addEventListener('click', () => ouvrir('menu'));
  window.addEventListener('hashchange', naviguer);
  naviguer();
}());
