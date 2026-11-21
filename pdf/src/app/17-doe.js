  // ---------- Assemblage d'un DOE (Dossier des Ouvrages Exécutés) ----------
  // Page de garde, un intercalaire par section, documents classés sous leur section d'après leur nom, sommaire à
  // deux niveaux après la page de garde, signets par section. Les pages créées restent modifiables (double-clic).
  // Pages du DOE : p.doe = 'garde' | 'section' (les documents qui suivent une section sont rangés dessous).
  const SECTIONS_DOE = [
    { titre: 'Pièces administratives et attestations', mots: 'attestation, coupe feu, calfeutrement, autocontrole, auto controle, conformite, consuel, certificat, qualification, declaration, dc4, kbis, assurance' },
    { titre: 'Notices d\'exploitation et de maintenance', mots: 'notice, notices, exploitation, maintenance, entretien, manuel, mode d emploi, consignes' },
    { titre: 'Fiches techniques des matériels', mots: 'fiche technique, fiches techniques, ft, documentation, catalogue, datasheet, avis technique, caracteristiques' },
    { titre: 'Procès-verbaux d\'essais et de mise en service', mots: 'pv, proces verbal, proces verbaux, essai, essais, mise en service, etancheite, epreuve, reception' },
    { titre: 'Relevés d\'équilibrage et de mesures', mots: 'equilibrage, debit, debits, releve, releves, mesures, aeraulique' },
    { titre: 'Plans de recollement', mots: 'plan, plans, recollement, synoptique, schema, schemas, implantation, rdc, sous sol, etage, r+1, r+2, toiture, coupe, dwg' },
    { titre: 'Garanties et contrats d\'entretien', mots: 'garantie, garanties, contrat, contrats, sav' },
  ];
  const normDoe = t => ` ${String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_.\-()[\]'’,]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  // Section d'un document d'après son nom : expressions-clés (sections connues) ou mots du titre (sections ajoutées)
  function sectionPour(nom, sections) {
    const n = normDoe(nom);
    let best = -1, score = 0;
    sections.forEach((sec, i) => {
      const connue = SECTIONS_DOE.find(x => normDoe(x.titre) === normDoe(sec));
      const exprs = connue ? connue.mots.split(',').map(normDoe) : normDoe(sec).split(' ').filter(m => m.length > 3).map(m => ` ${m} `);
      let sc = 0;
      for (const m of exprs) if (m.trim() && n.includes(m)) sc += m.trim().split(' ').length + 1;
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }

  function ouvrirDoe() {
    const garde = etat.pages.find(p => p.doe === 'garde');
    const memo = (() => { try { return JSON.parse(localStorage.getItem('atelierpdf.doe') || '{}'); } catch { return {}; } })();
    const v = (garde && garde.doeInfos) || memo;
    $('#doe-chantier').value = v.chantier || '';
    $('#doe-adresse').value = v.adresse || '';
    $('#doe-moa').value = v.moa || '';
    $('#doe-moe').value = v.moe || '';
    $('#doe-lot').value = v.lot || 'Lot CVC – Plomberie';
    $('#doe-entreprise').value = v.entreprise || 'TECNITUB';
    $('#doe-date').value = v.date || new Date().toLocaleDateString('fr-FR');
    $('#doe-indice').value = v.indice || 'A';
    $('#doe-sections').value = (v.sections && v.sections.length ? v.sections : SECTIONS_DOE.map(s => s.titre)).join('\n');
    $('#doe-classer').checked = true;
    $('#dlg-doe').hidden = false;
    $('#doe-chantier').focus();
  }

  // Texte centré sur une page (fractions de la page affichée)
  function texteCentre(p, texte, y, taille, gras = false, couleur = '#17324f') {
    const d = dims(p);
    const l = mesureTexte(texte, gras, taille) / d.l;
    return { type: 'texte', x: Math.max(0.04, 0.5 - l / 2), y, texte, taille, gras, couleur };
  }
  function nouvellePageDoe(type) {
    return { id: nouvelId('p'), type: 'blanche', source: null, index: 0, rotBase: 0, rot: 0, boite: { x: 0, y: 0, width: A4[0], height: A4[1] }, elements: [], doe: type };
  }
  function pageDeGarde(v) {
    const p = nouvellePageDoe('garde');
    p.doeInfos = v;
    const d = dims(p);
    const els = p.elements;
    els.push({ type: 'cadre', x: 0.06, y: 0.04, w: 0.88, h: 0.92, couleur: '#17324f', epaisseur: 2 });
    els.push(texteCentre(p, v.entreprise || '', 0.08, 22, true));
    els.push(texteCentre(p, 'DOSSIER DES OUVRAGES EXÉCUTÉS', 0.27, 22, true));
    els.push(texteCentre(p, '(DOE)', 0.31, 14, false, '#455a64'));
    if (v.lot) els.push(texteCentre(p, v.lot, 0.37, 17, true, '#c62828'));
    if (v.chantier) els.push(texteCentre(p, v.chantier, 0.46, 19, true, '#212121'));
    if (v.adresse) els.push(texteCentre(p, v.adresse, 0.505, 12, false, '#455a64'));
    // Tableau des intervenants
    const lignes = [['Maître d\'ouvrage', v.moa], ['Maître d\'œuvre', v.moe], ['Entreprise', v.entreprise], ['Date', v.date], ['Indice', v.indice]].filter(l => l[1]);
    const y0 = 0.66, pas = 26 / d.h;
    els.push({ type: 'cadre', x: 0.14, y: y0 - 10 / d.h, w: 0.72, h: lignes.length * pas + 12 / d.h, couleur: '#90a4ae', epaisseur: 1 });
    lignes.forEach(([k, val], i) => {
      els.push({ type: 'texte', x: 0.17, y: y0 + i * pas, texte: `${k} :`, taille: 11, gras: true, couleur: '#37474f' });
      els.push({ type: 'texte', x: 0.42, y: y0 + i * pas, texte: String(val), taille: 11, gras: false, couleur: '#212121' });
    });
    return p;
  }
  function pageSection(n, titre, v) {
    const p = nouvellePageDoe('section');
    p.titre = `${n}. ${titre}`;
    const d = dims(p);
    p.elements.push(
      { type: 'texte', x: 0.08, y: 0.05, texte: [v.chantier, v.lot].filter(Boolean).join(' – ') || 'DOE', taille: 9, couleur: '#78909c' },
      { type: 'surligne', x: 0.08, y: 0.36, w: 0.84, h: 4 / d.h, couleur: '#17324f' },
      texteCentre(p, String(n), 0.24, 54, true, '#c62828'),
      texteCentre(p, titre, 0.40, 20, true),
    );
    return p;
  }

  function creerDoe() {
    const v = {
      chantier: $('#doe-chantier').value.trim(), adresse: $('#doe-adresse').value.trim(), moa: $('#doe-moa').value.trim(), moe: $('#doe-moe').value.trim(),
      lot: $('#doe-lot').value.trim(), entreprise: $('#doe-entreprise').value.trim(), date: $('#doe-date').value.trim(), indice: $('#doe-indice').value.trim(),
      sections: $('#doe-sections').value.split(/\r?\n/).map(t => t.replace(/^\s*\d+[.)-]?\s*/, '').trim()).filter(Boolean),
    };
    if (!v.sections.length) { note('Indiquez au moins une section (une par ligne).', 'erreur'); return; }
    try { localStorage.setItem('atelierpdf.doe', JSON.stringify({ ...v, chantier: '', adresse: '', date: '' })); } catch { /* rien */ }
    $('#dlg-doe').hidden = true;
    memoriser();
    // Structure précédente remplacée (le DOE peut être refait après ajout de documents)
    const docs = etat.pages.filter(p => !p.doe);
    // Documents : pages consécutives d'un même fichier = un bloc, classé d'après le nom du fichier
    const blocs = [];
    for (const p of docs) {
      const dernier = blocs[blocs.length - 1];
      if (dernier && p.source && dernier.source === p.source) dernier.pages.push(p);
      else blocs.push({ source: p.source, pages: [p] });
    }
    const classer = $('#doe-classer').checked;
    const parSection = v.sections.map(() => []);
    const autres = [];
    for (const b of blocs) {
      const s = etat.sources.get(b.source);
      const i = classer && s ? sectionPour(s.nom, v.sections) : -1;
      (i >= 0 ? parSection[i] : autres).push(...b.pages);
    }
    const pages = [pageDeGarde(v)];
    v.sections.forEach((t, i) => pages.push(pageSection(i + 1, t, v), ...parSection[i]));
    if (autres.length) {
      if (classer) pages.push(pageSection(v.sections.length + 1, 'Autres documents', v));
      pages.push(...autres);
    }
    etat.pages = pages;
    etat.selection = new Set();
    // Réglages du document compilé
    $('#o-titre').value = ['DOE', v.chantier, v.lot].filter(Boolean).join(' – ');
    if (!$('#o-auteur').value.trim()) $('#o-auteur').value = v.entreprise;
    $('#o-sommaire').checked = true;
    $('#o-signets').checked = true;
    $('#o-num').checked = true;
    $('#o-num-ignorer').value = 1;
    $('#o-num').dispatchEvent(new Event('change', { bubbles: true }));
    sauverOptions();
    rafraichir();
    const classes = parSection.reduce((a, l) => a + l.length, 0);
    note(`DOE créé : page de garde, ${v.sections.length} section(s)${classer && docs.length ? `, ${classes} page(s) classée(s) automatiquement${autres.length ? `, ${autres.length} dans « Autres documents »` : ''}` : ''}. Glissez les documents sous la bonne section si besoin ; sommaire et numéros sont faits à l'enregistrement.`, 'ok');
  }
  $('#b-doe').onclick = ouvrirDoe;
  $('#doe-annuler').onclick = () => { $('#dlg-doe').hidden = true; };
  $('#doe-ok').onclick = creerDoe;
  $('#doe-defaut').onclick = () => { $('#doe-sections').value = SECTIONS_DOE.map(s => s.titre).join('\n'); };
