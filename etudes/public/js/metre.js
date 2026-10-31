// Métré d'une étude et chiffrage dans Pipe-Fit : quantités tirées des calculs (tuyauteries par série et diamètre avec
// raccords, supports et main-d'œuvre, calorifuge, gaines, équipements du schéma), rapprochées de la bibliothèque de prix
// de Pipe-Fit, puis converties en ouvrages de devis (fournitures de la bibliothèque + heures de main-d'œuvre).
const Metre = ((N, C, D, L, Sc) => {
  const nf = N.nf, num = N.num;
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[×x]/g, ' x ').replace(/,/g, '.');
  const CHAPITRES = ['Études', 'Production', 'Tuyauteries', 'Équipements hydrauliques', 'Calorifuge', 'Aéraulique'];
  // Mots-clés de matériau par série de tubes
  const MATIERE = { acier: ['acier', 'p235', 'p265', 'noir', 'e235', 'st37'], galva: ['galva'], inox: ['inox', '316', '304', '1.44', '1.43'], cuivre: ['cuivre'], pehd: ['pehd', 'pe100', 'polyethylene'], multicouche: ['multicouche', 'per-al', 'pert'] };
  const matiereDe = serie => (/galva/.test(serie) ? 'galva' : /inox/.test(serie) ? 'inox' : /cuivre/.test(serie) ? 'cuivre' : /pehd/.test(serie) ? 'pehd' : /multicouche/.test(serie) ? 'multicouche' : 'acier');
  // Ratios de métré réglables dans les Réglages : heures = a + b · DN (tubes au mètre, calorifuge), heures par équipement
  // (nombre, ou [a, b] selon le DN), raccords et supports par mètre, chutes ; coefficients de calage par main-d'œuvre (REX Pipe-Fit)
  const DEFAUTS = {
    tube: { acier: [0.3, 0.012], galva: [0.3, 0.01], inox: [0.25, 0.009], cuivre: [0.2, 0.008], pehd: [0.25, 0.008], multicouche: [0.15, 0.006] },
    calorifuge: [0.15, 0.004], gaine: 0.5, coudesParMl: 0.2, supportsParMl: 1, chute: 5, be: [4, 2],
    equip: { generateur: 16, soupape: 0.5, bouteille: 6, echangeur: 8, tampon: 6, desemboueur: 3, pompe: 3, vanne: 2, equilibrage: 1, isolement: [0.3, 0.01], compteur: 2, vase: 3, cta: 16, bouche: 0.75 },
    coefs: { monteur: 1, calorifugeur: 1, be: 1 },
  };
  const LIBELLES_EQUIP = { generateur: 'Générateur', soupape: 'Soupape de sécurité', bouteille: 'Bouteille de découplage', echangeur: 'Échangeur à plaques', tampon: 'Ballon tampon',
    desemboueur: 'Pot à boue / désemboueur', pompe: 'Pompe', vanne: 'Vanne de régulation motorisée', equilibrage: 'Vanne d\'équilibrage', isolement: 'Vanne d\'isolement (a + b · DN)',
    compteur: 'Compteur d\'énergie', vase: 'Vase d\'expansion', cta: 'Centrale de traitement d\'air', bouche: 'Bouche de soufflage ou d\'extraction' };
  const copie = o => JSON.parse(JSON.stringify(o));
  let R = copie(DEFAUTS);
  // Fusion prudente : seules les valeurs numériques valides remplacent les valeurs par défaut
  function utiliser(cfg) {
    R = copie(DEFAUTS);
    const fusion = (cible, src) => { for (const k of Object.keys(cible)) { const v = src && src[k]; if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(cible[k])) { if (Array.isArray(v) && v.length === 2 && v.every(x => Number.isFinite(+x) && +x >= 0)) cible[k] = v.map(Number); else if (Number.isFinite(+v) && !Array.isArray(v) && +v >= 0 && k !== 'be' && !(k in DEFAUTS.tube)) cible[k] = +v; }
      else if (typeof cible[k] === 'object') fusion(cible[k], v);
      else if (Number.isFinite(+v) && +v >= 0) cible[k] = +v; } };
    fusion(R, cfg || {});
    return R;
  }
  const ratios = () => R;
  const lin = (v, dn) => (Array.isArray(v) ? v[0] + v[1] * (dn || 0) : v);
  const heuresMl = (serie, dn) => lin(R.tube[matiereDe(serie)], dn);

  /* ---------- Métré ---------- */
  // Postes : { cle, chapitre, designation, unite, qte, recherche: { mots, taille }, heures (par unité), mo: 'monteur'|'calorifugeur'|'be', source }
  function metre(etude) {
    const postes = new Map(), ajouter = (cle, p) => { const ex = postes.get(cle); if (ex) { ex.qte += p.qte; ex.sources.add(p.source); } else postes.set(cle, { ...p, sources: new Set([p.source]) }); };
    const tube = (serie, cle, Lm, source) => {
      const t = C.tube(serie, cle);
      if (!t || !(Lm > 0)) return;
      const mat = matiereDe(serie), court = { acier: 'acier', galva: 'acier galvanisé', inox: 'inox', cuivre: 'cuivre', pehd: 'PEHD', multicouche: 'multicouche' }[mat];
      ajouter(`tube|${serie}|${cle}`, { chapitre: 'Tuyauteries', designation: `Tuyauterie ${court} ${t.nom}, raccords et supports compris`, unite: 'ml', qte: Lm, heures: heuresMl(serie, t.dn), mo: 'monteur', source,
        recherche: { type: 'tube', matiere: mat, dn: t.dn, de: t.de }, accessoires: [{ type: 'coude', matiere: mat, dn: t.dn, de: t.de, qte: R.coudesParMl }, { type: 'support', qte: R.supportsParMl }] });
    };
    const equip = (cle, chapitre, designation, qte, heures, recherche, source) => { const r = R.equip[recherche.type]; if (qte > 0) ajouter(cle, { chapitre, designation, unite: 'u', qte, heures: r === undefined ? heures : lin(r, recherche.dn), mo: 'monteur', recherche, source }); };
    const notes = etude.notes || [], titre = n => `N${notes.indexOf(n) + 1}`;
    notes.forEach(n => {
      const e = L.resoudre(etude, n).entrees, r = N.calculer(n.type, e), v = r.valeurs || {}, src = titre(n);
      // Notes créées depuis un schéma : déjà comptées par le schéma (pas de double compte)
      if (n.lien && n.lien.note && notes.some(x => x.id === n.lien.note) && n.lien.role !== 'vase') return;
      if (n.type === 'reseau') (v.troncons || []).forEach(t => tube(t.serie, t.tube, t.L, src));
      if (n.type === 'arbo') {
        (v.troncons || []).forEach(t => tube(t.serie, t.tube, t.L, src));
        (v.vannes || []).forEach(x => equip(`equil|${x.dn}`, 'Équipements hydrauliques', `Vanne d'équilibrage DN ${x.dn}`, 1, 1, { type: 'equilibrage', dn: x.dn }, src));
        if (v.pompe) equip(`pompe|${v.pompe.modele}`, 'Équipements hydrauliques', `Pompe ${N.libPompe(v.pompe).replace(/, vitesse.*/, '')}`, 1, 3, { type: 'pompe', modele: v.pompe.modele, dn: v.pompe.dn }, src);
      }
      if (n.type === 'cta' && v.Pchaud !== undefined) equip(`cta|${num(e.Qs)}`, 'Aéraulique', `Centrale de traitement d'air ${nf(num(e.Qs), 0)} m³/h (batterie chaude ${nf(v.Pchaud, 0)} kW${v.Pfroid ? `, froide ${nf(v.Pfroid, 0)} kW` : ''})`, 1, 16, { type: 'cta' }, src);
      if (n.type === 'bouches') (v.bouches || []).forEach(b => equip(`bouche|${b.type}|${b.taille}`, 'Aéraulique', `${b.type} ${b.taille}, plénum et raccordement`, b.n, 0.75, { type: 'bouche', taille: b.taille }, src));
      if (n.type === 'tuyauterie' && v.choix) tube(e.serie, v.choix, num(e.L), src);
      if (n.type === 'vapeur' && v.choix) { tube(e.serie, v.choix, num(e.L), src); if (v.condensats) tube(e.serie, v.condensats, num(e.L), src); }
      if (n.type === 'air' && v.choix) tube(e.serie, v.choix, num(e.L), src);
      if (n.type === 'isolation' && v.choix) {
        const t = C.tube(e.serie, e.tube) || C.tubes(e.serie)[0], iso = D.ISOLANTS[e.isolant];
        ajouter(`iso|${e.isolant}|${v.choix}|${t.cle}`, { chapitre: 'Calorifuge', designation: `Calorifuge ${iso.libelle.toLowerCase()} ép. ${v.choix} mm sur ${t.nom}`, unite: 'ml', qte: num(e.L), heures: lin(R.calorifuge, t.dn), mo: 'calorifugeur', source: src,
          recherche: { type: 'calorifuge', isolant: e.isolant, ep: v.choix, dn: t.dn, de: t.de } });
      }
      if (n.type === 'gaine' && v.choix) ajouter(`gaine|${v.choix}`, { chapitre: 'Aéraulique', designation: `Gaine ${v.choix} mm galvanisée, supports compris`, unite: 'ml', qte: num(e.L), heures: R.gaine, mo: 'monteur', source: src, recherche: { type: 'gaine', nom: v.choix } });
      // Schéma aéraulique : CTA ou caisson, bouches, gaines principales et antennes
      if (n.type === 'aero') {
        const cta = /^cta/.test(v.producteur || ''), Q = Math.max(v.Qs || 0, v.Qr || 0);
        equip(`aero|${v.producteur}|${Math.round(Q)}`, 'Aéraulique', cta ? `Centrale de traitement d'air ${nf(Q, 0)} m³/h${v.Qr && v.Qs ? ' double flux' : ''}` : `Caisson ${v.Qs ? 'd\'insufflation' : 'd\'extraction'} ${nf(Q, 0)} m³/h`, 1, cta ? 16 : 6, { type: cta ? 'cta' : 'caisson' }, src);
        (v.bouches || []).forEach(b => equip(`bouche|${b.type}|${b.taille}`, 'Aéraulique', `${b.type} ${b.taille}, plénum et raccordement`, b.n, 0.75, { type: 'bouche', taille: b.taille }, src));
        (v.troncons || []).forEach(t => ajouter(`gaine|${t.nom}`, { chapitre: 'Aéraulique', designation: `Gaine ${t.nom} mm galvanisée, supports compris`, unite: 'ml', qte: t.L, heures: R.gaine, mo: 'monteur', source: src, recherche: { type: 'gaine', nom: t.nom } }));
      }
      if (n.type === 'aeraulique') (v.troncons || []).forEach(t => ajouter(`gaine|${t.nom}`, { chapitre: 'Aéraulique', designation: `Gaine ${t.nom} mm galvanisée, supports compris`, unite: 'ml', qte: t.L, heures: R.gaine, mo: 'monteur', source: src, recherche: { type: 'gaine', nom: t.nom } }));
      if (n.type === 'vase' && v.choisi) equip(`vase|${v.choisi}`, 'Équipements hydrauliques', `Vase d'expansion ${v.choisi} L, gonflé à ${nf(v.p0, 1)} bar`, 1, 3, { type: 'vase', volume: v.choisi }, src);
      if (n.type === 'vanne' && v.vanne) equip(`vanne|${v.vanne.type}|${v.vanne.dn}|${v.vanne.Kvs}`, 'Équipements hydrauliques', `${N.libVanne(v.vanne)} motorisée`, 1, 2, { type: 'vanne', sorte: v.vanne.type, dn: v.vanne.dn, kvs: v.vanne.Kvs }, src);
      if (n.type === 'pid') {
        const d = Sc.dimensionner(e), G = d.gen[0];
        equip(`gen|${e.generateur}|${d.Pg}`, 'Production', `${G} ${nf(d.Pg, 0)} kW${d.co ? ` (froid ${nf(d.co.dF.Pg, 0)} kW)` : ''}`, d.n, 16, { type: 'generateur', mots: G }, src);
        equip(`soupape|${d.tg.dn}`, 'Production', `Soupape de sécurité sur générateur`, d.n, 0.5, { type: 'soupape' }, src);
        if (d.tb) equip(`bouteille|${d.tb.cle}`, 'Production', `Bouteille de découplage ${d.tb.nom}`, 1, 6, { type: 'bouteille' }, src);
        if (d.echangeur) equip(`echangeur|${Math.round(d.Pdem)}`, 'Production', `Échangeur à plaques ${nf(d.Pdem, 0)} kW (≈ ${nf(d.Aech, 1)} m²)`, 1, 8, { type: 'echangeur' }, src);
        if (d.tampon && d.tampon.V > 0) equip(`tampon|${d.tampon.V}`, 'Production', `Ballon tampon ${nf(d.tampon.V, 0)} L`, 1, 6, { type: 'tampon', volume: d.tampon.V }, src);
        if (e.desemboueur !== 'non') equip(`desemboueur|${d.tc.dn}`, 'Production', `Pot à boue / désemboueur DN ${d.tc.dn}`, 1, 3, { type: 'desemboueur', dn: d.tc.dn }, src);
        tube(e.serie, d.tc.cle, 2 * (d.circuits.length * 1.5 + 2), `${src} (collecteurs)`);
        tube(e.serie, d.tg.cle, d.n * 6, `${src} (raccordement des générateurs)`);
        if (d.pompesInd && (d.bouteille || d.echangeur || d.n > 1)) { const pp = (typeof Catalogue !== 'undefined' ? Catalogue : require('./catalogue')).pompesPour(d.Qg, 5)[0]; equip(`pompe|${pp ? pp.modele : 'primaire'}`, 'Production', pp ? `Pompe primaire ${N.libPompe(pp).replace(/, vitesse.*/, '')}` : 'Pompe primaire', d.n, 3, { type: 'pompe', modele: pp && pp.modele, dn: pp && pp.dn }, src); }
        d.circuits.forEach(c => {
          tube(e.serie, c.t.cle, c.L, src);
          if (c.pompe) equip(`pompe|${c.pompe.modele}`, 'Équipements hydrauliques', `Pompe ${N.libPompe(c.pompe).replace(/, vitesse.*/, '')}`, 1, 3, { type: 'pompe', modele: c.pompe.modele, dn: c.pompe.dn }, src);
          if (c.vanne) equip(`vanne|${c.vanne.type}|${c.vanne.dn}|${c.vanne.Kvs}`, 'Équipements hydrauliques', `${N.libVanne(c.vanne)} motorisée`, 1, 2, { type: 'vanne', sorte: c.vanne.type, dn: c.vanne.dn, kvs: c.vanne.Kvs }, src);
          equip(`equil|${c.t.dn}`, 'Équipements hydrauliques', `Vanne d'équilibrage DN ${c.t.dn}`, 1, 1, { type: 'equilibrage', dn: c.t.dn }, src);
          equip(`isol|${c.t.dn}`, 'Équipements hydrauliques', `Vanne d'isolement DN ${c.t.dn}`, 4, 0.3 + 0.01 * c.t.dn, { type: 'isolement', dn: c.t.dn }, src);
          if (e.compteurs === 'oui') equip(`ce|${c.t.dn}`, 'Équipements hydrauliques', `Compteur d'énergie DN ${c.t.dn}`, 1, 2, { type: 'compteur', dn: c.t.dn }, src);
        });
        equip(`isol|${d.tg.dn}`, 'Production', `Vanne d'isolement DN ${d.tg.dn}`, 2 * d.n, 0.3 + 0.01 * d.tg.dn, { type: 'isolement', dn: d.tg.dn }, src);
      }
    });
    const nCalc = notes.filter(n => !n.lien).length;
    if (nCalc) ajouter('be', { chapitre: 'Études', designation: 'Études d\'exécution, notes de calcul et schémas', unite: 'forfait', qte: 1, heures: lin(R.be, nCalc), mo: 'be', source: 'étude', recherche: { type: 'aucune' } });
    // Matériel retenu (fabricant et référence exacte choisis) : repris dans la désignation, donc dans le devis
    const retenu = etude.materiel || {}, refDe = cle => { const x = retenu[cle]; return x && String(x.reference || '').trim() ? [x.fabricant, x.reference].map(v => String(v || '').trim()).filter(Boolean).join(' ') : ''; };
    return [...postes.entries()].map(([cle, p]) => ({ ...p, cle, designationBase: p.designation, ...(p.unite === 'u' && refDe(cle) ? { designation: `${p.designation} — ${refDe(cle)}`, fabricant: String(retenu[cle].fabricant || '').trim(), reference: String(retenu[cle].reference).trim() } : {}),
      qte: Math.round(p.qte * 100) / 100, heures: p.heures * (R.coefs[p.mo] ?? 1), sources: [...p.sources] }))
      .sort((a, b) => CHAPITRES.indexOf(a.chapitre) - CHAPITRES.indexOf(b.chapitre) || a.designation.localeCompare(b.designation, 'fr'));
  }

  /* ---------- Rapprochement avec la bibliothèque de prix ---------- */
  // Le diamètre doit apparaître dans la désignation : « DN50 », « DN 50 », « Ø54 », « 54x1,5 », « 60,3 »
  const tailleOk = (txt, dn, de) => (dn && new RegExp(`\\bdn ?${dn}\\b`).test(txt)) || (de && new RegExp(`(^|[^\\d.])(o|ø|d)? ?${String(de).replace('.', '\\.')}( ?x|\\b|mm)`).test(txt));
  const contient = (txt, mots) => mots.some(m => txt.includes(m));
  function score(article, r) {
    const t = norm(`${article.designation} ${article.ref || ''} ${article.famille || ''} ${article.sousFamille || ''}`), f = norm(article.famille);
    switch (r.type) {
      case 'tube': return /tube/.test(t) && !/coude|bride|te |reduc/.test(t) && contient(t, MATIERE[r.matiere]) && tailleOk(t, r.dn, r.de) ? 3 + (/tube/.test(f) ? 1 : 0) : 0;
      case 'coude': return /coude/.test(t) && contient(t, MATIERE[r.matiere]) && tailleOk(t, r.dn, r.de) ? 3 + (/90/.test(t) ? 1 : 0) : 0;
      case 'support': return /support|collier/.test(t) ? 2 + (/support/.test(f) ? 1 : 0) : 0;
      case 'calorifuge': return /calorifug|coquille|isola|armaflex|elastom|laine/.test(t) && new RegExp(`\\b${r.ep} ?mm|ep\\.? ?${r.ep}\\b`).test(t) && tailleOk(t, r.dn, r.de) ? 3 : 0;
      case 'vanne': return /vanne/.test(t) && (r.sorte === '3v' ? /3 ?voies|trois voies/ : /2 ?voies|deux voies/).test(t) && tailleOk(t, r.dn) ? 3 + (new RegExp(`kvs ?${String(r.kvs).replace('.', '\\.')}\\b`).test(t) ? 1 : 0) : 0;
      case 'isolement': return /vanne|robinet/.test(t) && /papillon|boisseau|opercule|1\/4|isolement/.test(t) && tailleOk(t, r.dn) ? 3 : 0;
      case 'equilibrage': return /equilibr/.test(t) && tailleOk(t, r.dn) ? 3 : 0;
      case 'pompe': return /pompe|circulateur|accelerateur/.test(t) ? (r.modele && t.includes(norm(r.modele).replace(/^(circulateur|in-line) /, '')) ? 4 : r.dn && tailleOk(t, r.dn) ? 2 : 0) : 0;
      case 'cta': return /centrale|\bcta\b|traitement d.air/.test(t) ? 2 : 0;
      case 'bouche': return /diffuseur|grille|bouche/.test(t) ? 2 + (r.taille && t.includes(norm(r.taille).replace(/^col /, '')) ? 1 : 0) : 0;
      case 'soupape': return /soupape/.test(t) ? 2 : 0;
      case 'vase': return /vase/.test(t) && new RegExp(`\\b${r.volume} ?l\\b`).test(t) ? 3 : 0;
      case 'tampon': return /tampon/.test(t) && new RegExp(`\\b${r.volume} ?l\\b`).test(t) ? 3 : 0;
      case 'bouteille': return /bouteille/.test(t) ? 2 : 0;
      case 'desemboueur': return /desemboueur|pot a boue/.test(t) ? 2 + (tailleOk(t, r.dn) ? 1 : 0) : 0;
      case 'compteur': return /compteur/.test(t) && /energie|calorie/.test(t) ? 2 + (tailleOk(t, r.dn) ? 1 : 0) : 0;
      case 'echangeur': return /echangeur/.test(t) ? 2 : 0;
      case 'gaine': return /gaine|conduit/.test(t) && t.includes(norm(r.nom).replace(/\s+/g, ' ').replace('o ', '')) ? 3 : 0;
      case 'generateur': return norm(r.mots).split(' ').filter(m => m.length > 3).every(m => t.includes(m)) ? 2 : 0;
      default: return 0;
    }
  }
  const meilleurs = (articles, r) => articles.map(a => [a, score(a, r)]).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1]).map(([a]) => a);
  const moPour = (mainoeuvre, genre) => {
    const re = { monteur: /monteur|tuyauteur|monte/, calorifugeur: /calorif/, be: /etude|bureau|dessin/ }[genre];
    return mainoeuvre.find(m => re.test(norm(`${m.libelle} ${m.code}`))) || mainoeuvre.find(m => /monteur|tuyauteur/.test(norm(m.libelle))) || mainoeuvre[0] || null;
  };
  function rapprocher(postes, articles = [], mainoeuvre = []) {
    return postes.map(p => {
      const cand = meilleurs(articles, p.recherche);
      return { ...p, candidats: cand.slice(0, 6), articleId: cand[0] ? cand[0].id : '', accessoires: (p.accessoires || []).map(x => ({ ...x, article: meilleurs(articles, x)[0] || null })), moId: (moPour(mainoeuvre, p.mo) || {}).id || '' };
    });
  }

  /* ---------- Lignes du devis Pipe-Fit ---------- */
  function lignesDevis(postes, articles = [], mainoeuvre = []) {
    const art = id => articles.find(a => a.id === id), mo = id => mainoeuvre.find(m => m.id === id);
    const F = (a, qte, des, unite) => (a ? { type: 'f', articleId: a.id, designation: a.designation, unite: a.unite, qte, pu: num(a.prixVente), cout: num(a.coutRevient), poids: num(a.poidsUnitaire) }
      : { type: 'f', articleId: '', designation: des, unite, qte, pu: 0, cout: 0, poids: 0 });
    const out = [];
    CHAPITRES.forEach(ch => {
      const ps = postes.filter(p => p.chapitre === ch && p.inclus !== false && p.qte > 0);
      if (!ps.length) return;
      out.push({ type: 'chapitre', titre: ch });
      ps.forEach(p => {
        const a = art(p.articleId), m = mo(p.moId), composants = [];
        if (p.recherche.type !== 'aucune') composants.push(F(a, p.unite === 'ml' ? 1 + R.chute / 100 : 1, p.designation, p.unite));
        (p.accessoires || []).forEach(x => { if (x.article) composants.push(F(x.article, x.qte)); });
        if (m && p.heures > 0) composants.push({ type: 'mo', moId: m.id, libelle: m.libelle, heures: Math.round(p.heures * 100) / 100, taux: num(m.tauxVente), cout: num(m.tauxCout) });
        out.push({ type: 'ouvrage', designation: p.designation, unite: p.unite, qte: p.qte, composants, ...(a || p.recherche.type === 'aucune' ? {} : { libre: true }) });
      });
    });
    return out;
  }
  // Estimation du prix de vente d'un poste (fourniture + main-d'œuvre), pour l'aperçu
  function prixPoste(p, articles = [], mainoeuvre = []) {
    const a = articles.find(x => x.id === p.articleId), m = mainoeuvre.find(x => x.id === p.moId);
    const fourn = (a ? num(a.prixVente) * (p.unite === 'ml' ? 1 + R.chute / 100 : 1) : 0) + (p.accessoires || []).reduce((s, x) => s + (x.article ? num(x.article.prixVente) * x.qte : 0), 0);
    return { unitaire: fourn + (m ? num(m.tauxVente) * p.heures : 0), total: p.qte * (fourn + (m ? num(m.tauxVente) * p.heures : 0)), heures: p.qte * p.heures };
  }
  // Calage sur le retour d'expérience : chantiers terminés de Pipe-Fit, heures prévues au devis face aux heures pointées,
  // regroupées par genre de main-d'œuvre du métré (monteur, calorifugeur, bureau d'études)
  function calage(rex, retenus) {
    const mo = rex.mainoeuvre || [], genre = id => { const m = mo.find(x => x.id === id); if (!m) return 'monteur'; const t = norm(`${m.libelle} ${m.code}`); return /calorif/.test(t) ? 'calorifugeur' : /etude|bureau|dessin/.test(t) ? 'be' : 'monteur'; };
    const g = { monteur: { prevues: 0, passees: 0, n: 0 }, calorifugeur: { prevues: 0, passees: 0, n: 0 }, be: { prevues: 0, passees: 0, n: 0 } };
    (rex.affaires || []).filter(a => !retenus || retenus.includes(a.id)).forEach(a => {
      const vus = new Set();
      Object.entries(a.parMo || {}).forEach(([id, h]) => { const k = genre(id); if (!(h.prevues > 0)) return; g[k].prevues += h.prevues; g[k].passees += h.passees; vus.add(k); });
      vus.forEach(k => g[k].n++);
    });
    const coefs = {};
    for (const [k, v] of Object.entries(g)) coefs[k] = v.prevues > 0 && v.n ? Math.round(Math.min(3, Math.max(0.3, v.passees / v.prevues)) * 100) / 100 : null;
    return { groupes: g, coefs };
  }
  const csv = postes => ['Chapitre;Désignation;Unité;Quantité;Heures par unité;Article Pipe-Fit;Sources',
    ...postes.filter(p => p.inclus !== false).map(p => [p.chapitre, p.designation, p.unite, String(p.qte).replace('.', ','), String(p.heures).replace('.', ','), p.articleId || 'hors bibliothèque', p.sources.join(' ')].map(x => `"${String(x).replace(/"/g, '""')}"`).join(';'))].join('\r\n');
  return { metre, rapprocher, lignesDevis, prixPoste, csv, score, CHAPITRES, DEFAUTS, LIBELLES_EQUIP, utiliser, ratios, calage, moPour };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Donnees !== 'undefined' ? Donnees : require('./donnees'),
  typeof Liens !== 'undefined' ? Liens : require('./liens'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Metre;
