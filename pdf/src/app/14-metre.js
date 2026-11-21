  // ---------- Métré sur plan : réseaux, diamètres, comptage de symboles, légende, export Excel ----------
  // Une mesure (cote, longueur, surface) ou un comptage peut porter un réseau (e.reseau : code, couleur du réseau)
  // et un diamètre (e.dn, texte libre : « DN20 », « Cu 14 », « Ø160 »). Un comptage {points, symbole, reseau}
  // regroupe les symboles d'un même type sur la page : un clic = un symbole compté.
  const RESEAUX_DEFAUT = [
    { code: 'EF', nom: 'Eau froide', couleur: '#1e88e5' },
    { code: 'ECS', nom: 'Eau chaude sanitaire', couleur: '#e53935' },
    { code: 'BECS', nom: 'Bouclage ECS', couleur: '#ec407a' },
    { code: 'CHD', nom: 'Chauffage départ', couleur: '#ef6c00' },
    { code: 'CHR', nom: 'Chauffage retour', couleur: '#3949ab' },
    { code: 'EGD', nom: 'Eau glacée départ', couleur: '#00acc1' },
    { code: 'EGR', nom: 'Eau glacée retour', couleur: '#00796b' },
    { code: 'EU', nom: 'Évacuation EU / EV', couleur: '#6d4c41' },
    { code: 'EP', nom: 'Eaux pluviales', couleur: '#78909c' },
    { code: 'GAZ', nom: 'Gaz', couleur: '#f9a825' },
    { code: 'FRIGO', nom: 'Frigorifique', couleur: '#8e24aa' },
    { code: 'SOUF', nom: 'Soufflage', couleur: '#43a047' },
    { code: 'REP', nom: 'Reprise / extraction', couleur: '#9e9d24' },
    { code: 'INC', nom: 'Incendie (RIA, sprinkler)', couleur: '#b71c1c' },
  ];
  // Couleurs proposées aux réseaux ajoutés par l'utilisateur
  const PALETTE_RESEAUX = ['#5d4037', '#c2185b', '#0097a7', '#689f38', '#512da8', '#ff8f00', '#455a64', '#d81b60'];
  const METRE = ['cote', 'longueur', 'surface', 'compte'];
  reglages.metre = Object.assign({ reseau: '', dn: '', symbole: 'Radiateur' }, reglages.metre || {});
  reglages.compte = reglages.compte || { couleur: MoteurPDF.DEFAUTS.compte };

  function reseauxPerso() { try { return JSON.parse(localStorage.getItem('atelierpdf.reseaux') || '[]'); } catch { return []; } }
  function tousReseaux() { const perso = reseauxPerso(); return [...RESEAUX_DEFAUT, ...perso.filter(r => !RESEAUX_DEFAUT.some(d => d.code === r.code))]; }
  // Réseau d'un élément ; un réseau inconnu sur ce poste (projet venu d'un collègue) garde le nom et la couleur enregistrés
  function reseauDe(e) {
    if (!e || !e.reseau) return null;
    return tousReseaux().find(r => r.code === e.reseau) || { code: e.reseau, nom: e.reseauNom || e.reseau, couleur: e.couleur || '#455a64' };
  }
  function remplirReseaux() {
    const sel = $('#ed-reseau');
    const v = reglages.metre.reseau;
    sel.replaceChildren(
      new Option('— Réseau —', ''),
      ...tousReseaux().map(r => { const o = new Option(`${r.code} · ${r.nom}`, r.code); o.style.color = r.couleur; return o; }),
      new Option('＋ Autre réseau…', '+autre'));
    sel.value = tousReseaux().some(r => r.code === v) ? v : '';
  }
  // Valeurs du métré données à un nouvel élément (couleur du réseau choisi)
  function appliquerMetre(e) {
    if (!METRE.includes(e.type)) return;
    const m = reglages.metre;
    const r = m.reseau && tousReseaux().find(x => x.code === m.reseau);
    if (r) { e.reseau = r.code; e.reseauNom = r.nom; e.couleur = r.couleur; }
    if (m.dn && e.type !== 'surface' && e.type !== 'compte') e.dn = m.dn;
    if (e.type === 'compte') e.symbole = m.symbole || 'Symbole';
  }
  // Barre du métré : visible avec un outil de mesure ou une mesure choisie
  // Avec l'outil Sélection, la barre règle la mesure choisie ; avec un outil de tracé, les prochaines mesures
  const mesureReglee = () => (ed.outil === 'selection' ? ed.elements[ed.choisi] : null);
  function majZoneMetre() {
    const e = mesureReglee();
    const type = e ? e.type : ed.outil;
    const visible = METRE.includes(type) || type === 'legende';
    $('#ed-metre').hidden = !visible;
    if (!visible) return;
    const source = e && METRE.includes(e.type) ? { reseau: e.reseau || '', dn: e.dn || '', symbole: e.symbole || '' } : reglages.metre;
    if (![...$('#ed-reseau').options].some(o => o.value === source.reseau)) remplirReseaux();
    $('#ed-reseau').value = source.reseau || '';
    const r = reseauDe(source);
    $('#ed-reseau').style.borderLeft = `6px solid ${r ? r.couleur : 'transparent'}`;
    $('#ed-reseau').hidden = type === 'legende';
    $('#ed-dn').value = source.dn || '';
    $('#ed-dn').hidden = type === 'compte' || type === 'surface' || type === 'legende';
    $('#ed-symbole').value = source.symbole || reglages.metre.symbole;
    $('#ed-symbole').hidden = type !== 'compte';
  }
  function changerMetre(cle, valeur) {
    const e = mesureReglee();
    reglages.metre[cle] = valeur;
    sauverReglages();
    if (e && METRE.includes(e.type)) {
      edMemo();
      if (cle === 'reseau') {
        const r = valeur && tousReseaux().find(x => x.code === valeur);
        if (r) { e.reseau = r.code; e.reseauNom = r.nom; e.couleur = r.couleur; }
        else { delete e.reseau; delete e.reseauNom; e.couleur = (reglages[e.type] || {}).couleur || MoteurPDF.DEFAUTS[e.type]; }
      } else if (cle === 'dn' && e.type !== 'compte' && e.type !== 'surface') { if (valeur) e.dn = valeur; else delete e.dn; }
      else if (cle === 'symbole' && e.type === 'compte') e.symbole = valeur || 'Symbole';
    }
    dessinerCalque();
  }
  $('#ed-reseau').addEventListener('change', () => {
    let v = $('#ed-reseau').value;
    if (v === '+autre') {
      const nom = (prompt('Nom du réseau (ex. « Eau adoucie », « Vapeur », « Air comprimé ») :') || '').trim();
      if (!nom) { majZoneMetre(); return; }
      const perso = reseauxPerso();
      const code = nom.length <= 8 ? nom.toUpperCase() : nom.split(/\s+/).map(m => m[0]).join('').toUpperCase().slice(0, 6);
      if (!tousReseaux().some(r => r.code === code)) {
        perso.push({ code, nom, couleur: PALETTE_RESEAUX[perso.length % PALETTE_RESEAUX.length] });
        try { localStorage.setItem('atelierpdf.reseaux', JSON.stringify(perso)); } catch { /* rien */ }
      }
      remplirReseaux();
      v = code;
      $('#ed-reseau').value = v;
    }
    changerMetre('reseau', v);
  });
  $('#ed-dn').addEventListener('change', () => changerMetre('dn', $('#ed-dn').value.trim()));
  $('#ed-symbole').addEventListener('change', () => changerMetre('symbole', $('#ed-symbole').value.trim()));
  remplirReseaux();

  // Outil Compter : clic = un symbole de plus dans le comptage en cours ; clic sur un repère = le retirer
  function clicCompte(pt) {
    for (let i = ed.elements.length - 1; i >= 0; i--) {
      const e = ed.elements[i];
      if (e.type !== 'compte') continue;
      const k = e.points.findIndex(([x, y]) => Math.hypot((x - pt.x) * ed.L, (y - pt.y) * ed.H) <= MoteurPDF.RAYON_COMPTE * ed.ech + 2);
      if (k < 0) continue;
      edMemo();
      e.points.splice(k, 1);
      if (!e.points.length) { ed.elements.splice(i, 1); ed.choisi = null; } else ed.choisi = i;
      dessinerCalque();
      return;
    }
    const m = reglages.metre;
    const symbole = m.symbole || 'Symbole';
    const i = ed.elements.findIndex(e => e.type === 'compte' && e.symbole === symbole && (e.reseau || '') === (m.reseau || ''));
    let e;
    if (i >= 0) { edMemo(); e = ed.elements[i]; e.points.push([pt.x, pt.y]); ed.choisi = i; }
    else e = nouvelElement('compte', { points: [[pt.x, pt.y]] });
    dessinerCalque();
  }

  // Lignes de légende d'une page : longueurs par réseau et diamètre, comptages, surfaces
  const libelleGroupe = (r, dn) => [r ? `${r.code} ${r.nom}` : 'Sans réseau', dn].filter(Boolean).join(' · ');
  function lignesMetre(elements, p) {
    const groupes = new Map();
    const ajouter = (cle, init, f) => { if (!groupes.has(cle)) groupes.set(cle, init); f(groupes.get(cle)); };
    for (const e of elements) {
      if (!METRE.includes(e.type)) continue;
      const r = reseauDe(e);
      if (e.type === 'compte') {
        ajouter(`c|${e.symbole}|${e.reseau || ''}`, { ordre: 2, forme: 'rond', couleur: e.couleur || MoteurPDF.DEFAUTS.compte, nom: `${e.symbole}${r ? ` (${r.code})` : ''}`, n: 0 }, g => { g.n += e.points.length; });
      } else if (e.type === 'surface') {
        ajouter(`s|${e.reseau || ''}`, { ordre: 3, forme: 'surface', couleur: e.couleur || MoteurPDF.DEFAUTS.surface, nom: r ? `Surface ${r.code}` : 'Surfaces', mm2: 0 }, g => { g.mm2 += valeurMesure(e, p, elements).mm2; });
      } else if (e.type === 'longueur' || r || e.dn) {
        ajouter(`l|${e.reseau || ''}|${e.dn || ''}`, { ordre: r ? 0 : 1, forme: 'trait', couleur: e.couleur || MoteurPDF.DEFAUTS.longueur, nom: libelleGroupe(r, e.dn), mm: 0, n: 0 }, g => { g.mm += valeurMesure(e, p, elements).mm; g.n++; });
      }
    }
    return [...groupes.values()].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
      .map(g => ({ couleur: g.couleur, forme: g.forme, texte: g.forme === 'rond' ? `${g.nom} : ${g.n}` : g.forme === 'surface' ? `${g.nom} : ${formatSurface(g.mm2)}` : `${g.nom} : ${formatLongueur(g.mm)}` }));
  }
  // Légendes de la page : contenu recalculé à chaque changement, hauteur ajustée au nombre de lignes
  function majLegendes(elements, p) {
    const legendes = elements.filter(e => e.type === 'legende');
    if (!legendes.length) return;
    const d = dims(p);
    const lignes = lignesMetre(elements, p);
    for (const e of legendes) {
      e.lignes = lignes.length ? lignes : [{ couleur: '#9e9e9e', forme: 'trait', texte: 'Aucune mesure sur cette page' }];
      e.h = MoteurPDF.hauteurLegende(e.lignes.length, e.taille || 8) / d.h;
    }
  }
  function insererLegende() {
    if (!ed.page) return;
    const i = ed.elements.findIndex(e => e.type === 'legende');
    if (i >= 0) { choisirOutil('selection'); choisirElement(i); note('La légende est déjà sur la page : elle se met à jour toute seule.'); return; }
    const d = dims(ed.page);
    const w = Math.min(0.6, 210 / d.l);
    choisirOutil('selection');
    nouvelElement('legende', { x: 1 - w - 18 / d.l, y: 18 / d.h, w, h: 0.1, titre: `Légende${ed.page.echelle && ed.page.echelle.libelle ? ` – échelle ${ed.page.echelle.libelle.replace('/', ':')}` : ''}`, taille: 8 });
    dessinerCalque();
    note('Légende ajoutée en haut à droite : déplacez-la et élargissez-la à la souris. Elle suit les mesures de la page.', 'ok');
  }
  $('#ed-legende').addEventListener('click', insererLegende);

  const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  // Fenêtre « Enregistrer sous » de Windows si possible ; sinon téléchargement (nom sans accents : certains
  // navigateurs remplacent un nom accentué par « download »)
  async function enregistrerClasseur(blob, nom) {
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: nom, types: [{ description: 'Classeur Excel', accept: { [TYPE_XLSX]: ['.xlsx'] } }] });
        const w = await h.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    telecharger(blob, nom.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  }

  // ----- Export du métré (Excel) : récapitulatif par réseau et diamètre, comptages, détail -----
  function exporterMetre() {
    validerEditeur();
    const nomDoc = p => etat.sources.get(p.source)?.nom || p.titre || '';
    const longueurs = new Map(), comptes = new Map(), surfaces = new Map();
    const detail = [['Page', 'Document', 'Type', 'Réseau', 'Diamètre / symbole', 'Quantité', 'Unité', 'Échelle']];
    let n = 0;
    etat.pages.forEach((p, i) => {
      for (const e of p.elements) {
        if (![...MESURES, 'compte'].includes(e.type)) continue;
        n++;
        const r = reseauDe(e);
        const ech = zoneDe(e, p.elements)?.echelle || p.echelle;
        const echTxt = ech ? (ech.libelle || 'étalonnée') : 'aucune';
        const reseauTxt = r ? `${r.code} – ${r.nom}` : '';
        if (e.type === 'compte') {
          const cle = `${e.symbole}|${reseauTxt}`;
          const g = comptes.get(cle) || { symbole: e.symbole, reseau: reseauTxt, n: 0, pages: new Set() };
          g.n += e.points.length; g.pages.add(i + 1); comptes.set(cle, g);
          detail.push([i + 1, nomDoc(p), 'Comptage', reseauTxt, e.symbole, { v: e.points.length, format: '0' }, 'u', '']);
          continue;
        }
        const v = valeurMesure(e, p);
        const type = { cote: 'Cote', longueur: 'Longueur', surface: 'Surface', angle: 'Angle' }[e.type];
        if (v.type === 'angle') { detail.push([i + 1, nomDoc(p), type, reseauTxt, '', { v: +v.deg.toFixed(1), format: '0.00' }, '°', '']); continue; }
        if (v.type === 'surface') {
          const g = surfaces.get(reseauTxt) || { reseau: reseauTxt, m2: 0 };
          g.m2 += v.mm2 / 1e6; surfaces.set(reseauTxt, g);
          detail.push([i + 1, nomDoc(p), type, reseauTxt, '', { v: v.mm2 / 1e6, format: '0.00' }, 'm²', echTxt]);
          continue;
        }
        // Les cotes ne comptent dans les longueurs de réseau que si elles portent un réseau ou un diamètre
        if (e.type === 'longueur' || r || e.dn) {
          const cle = `${reseauTxt}|${e.dn || ''}`;
          const g = longueurs.get(cle) || { reseau: reseauTxt, dn: e.dn || '', m: 0, n: 0 };
          g.m += v.mm / 1000; g.n++; longueurs.set(cle, g);
        }
        detail.push([i + 1, nomDoc(p), type, reseauTxt, e.dn || '', { v: v.mm / 1000, format: '0.000' }, 'm', echTxt]);
      }
    });
    if (!n) { note('Aucune mesure ni comptage dans le dossier.', 'erreur'); return; }
    const tri = (a, b) => (a.reseau || '~').localeCompare(b.reseau || '~', 'fr') || String(a.dn || a.symbole || '').localeCompare(String(b.dn || b.symbole || ''), 'fr', { numeric: true });
    const lg = [...longueurs.values()].sort(tri);
    const totalM = lg.reduce((a, g) => a + g.m, 0);
    const feuilles = [
      { nom: 'Longueurs', largeurs: [34, 16, 16, 12], lignes: [['Réseau', 'Diamètre', 'Longueur (m)', 'Tronçons'],
        ...lg.map(g => [g.reseau || 'Sans réseau', g.dn, { v: g.m, format: '0.00' }, { v: g.n, format: '0' }]),
        ...(lg.length ? [['Total', '', { v: totalM, format: '0.00', gras: true }, { v: lg.reduce((a, g) => a + g.n, 0), format: '0', gras: true }]] : [])] },
      { nom: 'Comptages', largeurs: [30, 34, 12, 20], lignes: [['Symbole', 'Réseau', 'Quantité', 'Pages'],
        ...[...comptes.values()].sort(tri).map(g => [g.symbole, g.reseau, { v: g.n, format: '0' }, [...g.pages].join(', ')])] },
      { nom: 'Surfaces', largeurs: [34, 16], lignes: [['Réseau / zone', 'Surface (m²)'], ...[...surfaces.values()].sort(tri).map(g => [g.reseau || 'Sans réseau', { v: g.m2, format: '0.00' }])] },
      { nom: 'Détail', largeurs: [7, 30, 11, 30, 18, 12, 7, 12], lignes: detail },
    ];
    const octets = MoteurPDF.classeurXlsx(feuilles);
    enregistrerClasseur(new Blob([octets], { type: TYPE_XLSX }), `Métré - ${nomFichier($('#o-titre').value.trim() || 'dossier')}.xlsx`);
    note(`Métré exporté : ${lg.length} ligne(s) de longueurs, ${comptes.size} type(s) de symboles, ${n} mesure(s) au détail (fichier Excel).`, 'ok');
  }
