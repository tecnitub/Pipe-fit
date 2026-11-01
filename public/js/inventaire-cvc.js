// Inventaire des équipements CVC d'un dossier de consultation : producteurs (chaudières, PAC, groupes froids, sous-stations),
// émetteurs (radiateurs, planchers, ventilo-convecteurs, aérothermes, CTA, ballons d'ECS…) et auxiliaires (pompes, vannes,
// ventilateurs, régulation), reconnus dans le CCTP (articles lus par CctpLecture) et dans le DPGF (lignes Excel, CSV ou PDF),
// rapprochés entre les deux : quantité du DPGF, prescription et repère du CCTP, puissance de l'un ou de l'autre.
// Sert à préremplir le schéma de principe et l'alimentation électrique d'une étude. Module commun navigateur / tests.
const InventaireCVC = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '\'').replace(/\s+/g, ' ').trim();
  const nombre = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

  // [motif, catégorie, genre, libellé du genre] — les plus précis d'abord (« pompe à chaleur » avant « pompe »)
  const REGLES = [
    [/pompes? a chaleur[^.]*(?:reversible)|pac reversible|reversible[^.]*pompe a chaleur/, 'producteur', 'pac-rev', 'PAC réversible'],
    [/pompes? a chaleur[^.]*eau ?\/ ?eau|pac eau ?\/ ?eau|pac geothermi|geothermi/, 'producteur', 'pac-eau', 'PAC eau / eau'],
    [/pompes? a chaleur|\bpac\b/, 'producteur', 'pac-air', 'PAC air / eau'],
    [/groupes? (?:de production )?(?:froid|d'eau glacee)|refroidisseur|\bchiller\b|production d'eau glacee/, 'producteur', 'gf-air', 'Groupe froid'],
    [/chaudiere[^.]*(?:bois|granule|biomasse|plaquette)/, 'producteur', 'chaudiere-bois', 'Chaudière bois'],
    [/chaudiere[^.]*fioul/, 'producteur', 'chaudiere-fioul', 'Chaudière fioul'],
    [/chaudiere[^.]*condensation|condensation[^.]*chaudiere/, 'producteur', 'chaudiere-cond', 'Chaudière à condensation'],
    [/chaudiere/, 'producteur', 'chaudiere-gaz', 'Chaudière gaz'],
    [/sous[- ]station|reseau de chaleur|echangeur[^.]*(?:primaire|reseau)/, 'producteur', 'echangeur', 'Sous-station / échangeur'],
    [/centrales? de traitement d'air|\bcta\b|centrale double flux/, 'emetteur', 'cta', 'CTA'],
    [/ventilo-?convecteur|cassette/, 'emetteur', 'ventilo', 'Ventilo-convecteurs'],
    [/aerotherme/, 'emetteur', 'aerotherme', 'Aérothermes'],
    [/plancher (?:chauffant|rafraichissant|reversible)/, 'emetteur', 'plancher', 'Plancher chauffant'],
    [/radiateur/, 'emetteur', 'radiateurs', 'Radiateurs'],
    [/panneaux? rayonnant|tubes? radiant|plafond rayonnant chauffant|cassette rayonnante/, 'emetteur', 'radiant', 'Panneaux rayonnants'],
    [/poutres? (?:froide|climatique)|plafonds? (?:froid|rafraichissant)/, 'emetteur', 'plafond', 'Poutres / plafonds froids'],
    [/ballons?\b|preparateur|production d'eau chaude|eau chaude sanitaire|\becs\b/, 'emetteur', 'ecs', 'Production d\'ECS'],
    [/\bsplits?\b|unites? (?:interieure|exterieure)|\bdrv\b|\bvrv\b|\bvrf\b|multi-?split/, 'emetteur', 'split', 'Splits / DRV'],
    [/circulateur|pompes?\b/, 'auxiliaire', 'pompe', 'Pompe'],
    [/vannes? (?:de regulation )?(?:3|trois) voies|\bv3v\b/, 'auxiliaire', 'vanne3v', 'Vanne 3 voies'],
    [/vannes? (?:de regulation )?(?:2|deux) voies|\bv2v\b/, 'auxiliaire', 'vanne2v', 'Vanne 2 voies'],
    // Émetteurs aérauliques (avant la ventilation : « bouche VMC » est une bouche)
    [/(?:bouches?|grilles?)[^.]*(?:extraction|reprise|vmc|hygro)|(?:extraction|reprise)[^.]*(?:bouches?|grilles?)/, 'emetteur', 'bouche-extraction', 'Bouches d\'extraction / reprise'],
    [/(?:bouches?|grilles?)[^.]*soufflage|diffuseurs?|soufflage[^.]*(?:bouches?|grilles?)/, 'emetteur', 'bouche-soufflage', 'Bouches de soufflage'],
    [/desenfumage/, 'auxiliaire', 'desenfumage', 'Désenfumage'],
    [/\bvmc\b|caisson d'(?:extraction|insufflation)|extracteur|tourelle/, 'auxiliaire', 'ventilateur', 'Ventilation'],
    [/vase d'expansion/, 'auxiliaire', 'vase', 'Vase d\'expansion'],
    [/regulation|automate|\bgtb\b|\bgtc\b|sonde/, 'auxiliaire', 'regulation', 'Régulation'],
  ];
  // Lignes qui ne sont pas des équipements (même si elles en citent un) : tuyauteries, calorifuge, essais, études…
  // Mots entiers (« plans » ne doit pas écarter « plancher chauffant »)
  const EXCLU = /^(?:tuyauteries?|reseaux?|calorifug\w*|isolation|fourreaux?|supports?|essais?|mise en service|etudes?|plans?|doe|dossier|nettoyage|depose|demontage|reperage|peinture|formation|garantie|maintenance|raccordements?|alimentation electrique|cablage|liaisons?)\b/;
  const GENRES = Object.fromEntries(REGLES.map(r => [r[2], { categorie: r[1], libelle: r[3] }]));
  function classer(texte) {
    const t = norm(texte);
    if (!t || EXCLU.test(t)) return null;
    const r = REGLES.find(([re]) => re.test(t));
    return r ? { categorie: r[1], genre: r[2] } : null;
  }
  // Puissance (kW) et régime (« 45/35 °C ») cités dans un texte
  const puissance = texte => { const m = /(\d+(?:[.,]\d+)?)\s*kw(?:c|f|th)?\b/i.exec(String(texte || '')); return m ? nombre(m[1]) : NaN; };
  // Débit d'air cité (m³/h)
  const debitAir = texte => { const m = /(\d[\d\s]{0,6}(?:[.,]\d+)?)\s*m(?:3|³)\s*\/\s*h/i.exec(String(texte || '')); return m ? nombre(m[1]) : NaN; };
  const regime = texte => { const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*°?\s*c\b/i.exec(String(texte || '')); return m ? `${m[1]}/${m[2]}` : ''; };

  /* ---------- Réseaux (circuits hydrauliques, réseaux aérauliques) ---------- */
  // Un titre (chapitre du DPGF, article du CCTP) ou une ligne qui désigne un réseau : mot de réseau + nature reconnue
  const MOT_RESEAU = /\b(?:reseaux?|circuits?|distribution|departs?|antennes?|colonnes?|boucles?|bouclage|tuyauteries?|canalisations?|gaines?|conduits?|collecteurs?|nourrices?|alimentations? en eau)\b/;
  const NATURES = [
    // Plomberie et évacuations : reconnues pour ne pas être prises pour du chauffage, écartées des schémas CVC
    ['plomberie', 'Plomberie (eau froide, évacuations)', /eaux? (?:usees|vannes|pluviales)|evacuation|\b(?:eu|ev|ep)\b|eau froide sanitaire|\bef\b|eau de ville|incendie|\bria\b|gaz\b/, false],
    ['ecs', 'Eau chaude sanitaire', /eau chaude sanitaire|\becs\b|bouclage|\bbecs\b/, true],
    ['desenfumage', 'Désenfumage', /desenfumage/, false],
    ['soufflage', 'Soufflage', /soufflage|insufflation|air traite|air souffle/, false],
    ['reprise', 'Reprise', /reprise|air repris/, false],
    ['extraction', 'Extraction', /extraction|\bvmc\b|air vicie/, false],
    ['air-neuf', 'Air neuf / rejet', /air neuf|prise d'air|rejet/, false],
    ['vapeur', 'Vapeur et condensats', /vapeur|condensats?/, true],
    ['change-over', 'Eau chaude / eau glacée (change-over)', /change.?over|2 tubes reversibles?|reversible/, true],
    ['eau-glacee', 'Eau glacée', /eau glacee|eau froide (?:de )?(?:climatisation|cta)|\beg\b|eau de refroidissement|\bfroid\b|rafraichissement|7 ?\/ ?12|6 ?\/ ?12/, true],
    ['chauffage', 'Chauffage (eau chaude)', /chauffage|eau chaude|radiateurs?|plancher chauffant|aerothermes?|\bec\b|primaire|secondaire|ventilo|calorifique|\d{2} ?\/ ?\d{2} ?°?c/, true],
  ];
  const NATURE = Object.fromEntries(NATURES.map(n => [n[0], { libelle: n[1], hydro: n[3] }]));
  // Nature d'un réseau d'après son nom (et le texte de l'article) ; aéraulique reconnu aussi aux gaines
  function natureReseau(texte) {
    const x = norm(texte);
    const n = NATURES.find(([, , re]) => re.test(x));
    if (n) return n[0];
    if (/\bgaines?\b|\bconduits? d'air|aeraulique/.test(x)) return 'soufflage';
    return '';
  }
  const estReseau = texte => { const x = norm(texte); return MOT_RESEAU.test(x) && !!natureReseau(x) && !/^(?:essais?|calorifug|isolation|depose|mise en service|nettoyage)/.test(x); };
  const idReseau = nom => norm(nom).replace(/^[\d.\s-]+/, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
  // Longueur et diamètre des tuyauteries / gaines d'un réseau (lignes « ml » du DPGF)
  const estTube = (des, unite) => /^(?:ml|m)$/.test(norm(unite)) || /\b(?:tubes?|tuyau|tuyauteries?|canalisations?|gaines?|conduits?)\b/.test(norm(des));
  const dnDe = des => { const x = norm(des); const m = /\bdn ?(\d{2,3})\b/.exec(x) || /\b(\d{2,3}(?:[.,]\d)?) ?x ?\d(?:[.,]\d+)?\b/.exec(x) || /ø ?(\d{2,4})/.exec(String(des || '').toLowerCase()); return m ? nombre(m[1]) : NaN; };
  function nouveauReseau(nom, source, texte = '') {
    const nature = natureReseau(`${nom} ${texte}`);
    return { id: idReseau(nom), nom: String(nom).replace(/^[\d.\s-]+/, '').trim().slice(0, 80), nature, hydro: !!(NATURE[nature] || {}).hydro, regime: regime(`${nom} ${texte}`), L: 0, dnMax: NaN, sources: [source] };
  }
  // Rattachement d'un équipement à un réseau du CCTP : article parent (« 4.2 Réseau radiateurs » pour « 4.2.3 Radiateurs »)
  function reseauxCctp(analyse) {
    const lignes = (analyse.articlesDetail || analyse.articles || []).filter(a => estReseau(a.titre));
    return lignes.map(a => ({ ...nouveauReseau(a.titre, `CCTP art. ${a.num}`, a.texte || ''), article: a.num }));
  }
  const reseauDeArticle = (num, reseaux) => reseaux.filter(r => r.article && (num === r.article || String(num).startsWith(`${r.article}.`))).sort((a, b) => b.article.length - a.article.length)[0] || null;

  /* ---------- CCTP ---------- */
  // equipements : résultat de CctpLecture.analyser(lignes).equipements
  // reseaux : reseauxCctp(analyse) (facultatif) — l'équipement prend le réseau de son article parent
  function depuisCctp(equipements, reseaux = []) {
    return (equipements || []).map(x => {
      const c = classer(`${x.designation} ${x.caract || ''}`);
      if (!c) return null;
      const texte = `${x.designation} ${x.caract || ''} ${x.prescrit || ''}`, r = reseauDeArticle(x.article, reseaux);
      return { ...c, designation: x.designation, qte: Math.max(1, nombre(x.quantite) || 1), P: puissance(texte), regime: regime(texte) || (r ? r.regime : ''), Q: debitAir(texte), repere: x.repere || '', prescrit: x.prescrit || '', reseau: r ? r.id : '', sources: [`CCTP art. ${x.article}`] };
    }).filter(Boolean);
  }

  /* ---------- DPGF ---------- */
  const SYN = { designation: ['designation', 'libelle', 'description', 'designation des ouvrages', 'nature des ouvrages', 'ouvrages', 'intitule', 'prestations'], qte: ['quantite', 'qte', 'qt', 'q', 'quantites', 'quant'], unite: ['u', 'unite', 'un', 'unit'], num: ['n', 'no', 'num', 'numero', 'n prix', 'article', 'art', 'poste', 'code', 'ref', 'item', 'repere'] };
  const cle = v => norm(v).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Lignes d'une feuille (tableau de tableaux) : en-tête reconnue, puis ouvrages (désignation et quantité)
  function depuisDpgf(rows) {
    let entete = -1, map = {};
    for (let i = 0; i < Math.min(40, rows.length) && entete < 0; i++) {
      const m = {};
      (rows[i] || []).forEach((c, j) => { const k = cle(c); Object.entries(SYN).forEach(([f, syn]) => { if (m[f] === undefined && syn.includes(k)) m[f] = j; }); });
      if (m.designation !== undefined && m.qte !== undefined) { entete = i; map = m; }
    }
    if (entete < 0) return { items: [], erreur: 'En-tête du DPGF non reconnue (colonnes « Désignation » et « Quantité »).' };
    const items = [], reseaux = new Map();
    // Contexte : réseau du chapitre en cours (titre sans quantité), avec la profondeur de son numéro (« 3.2 » → 2)
    let ctx = null;
    const profondeur = n => (String(n || '').match(/\d+/g) || []).length;
    const ajouterReseau = (nom, num) => { const r = reseaux.get(idReseau(nom)) || nouveauReseau(nom, `DPGF${num ? ` ${num}` : ''}`); reseaux.set(r.id, r); return r; };
    rows.slice(entete + 1).forEach(r => {
      const des = String((r || [])[map.designation] ?? '').trim(), q = nombre((r || [])[map.qte]), unite = String((r || [])[map.unite] ?? ''), num = map.num !== undefined ? String((r || [])[map.num] ?? '').trim() : '';
      if (!des) return;
      if (!(q > 0)) {
        // Titre de chapitre : un réseau ouvre un contexte ; un autre titre de même niveau (ou plus haut) le referme
        if (estReseau(des)) { const res = ajouterReseau(des, num); ctx = { id: res.id, prof: profondeur(num) }; }
        else if (ctx && (num ? profondeur(num) <= ctx.prof : !/robinetterie|tuyauterie|accessoires?|calorifug|emetteurs?|equipements?|appareillage|regulation|supportage/.test(norm(des)))) ctx = null;
        return;
      }
      let c = classer(des);
      const res = ctx ? reseaux.get(ctx.id) : null;
      // Bouche ou grille sans précision, sous un réseau aéraulique : son réseau dit si elle souffle ou reprend
      if (!c && res && !res.hydro && /bouches?|grilles?|diffuseurs?|anemostats?|buses?/.test(norm(des))) c = res.nature === 'soufflage' ? { categorie: 'emetteur', genre: 'bouche-soufflage' } : ['reprise', 'extraction'].includes(res.nature) ? { categorie: 'emetteur', genre: 'bouche-extraction' } : null;
      // Tuyauteries et gaines : longueur et plus gros diamètre du réseau en cours (ou réseau nommé sur la ligne)
      if (!c && estTube(des, unite)) {
        const cible = res || (estReseau(des) ? ajouterReseau(des, num) : null);
        if (cible && /^(?:ml|m)$/.test(norm(unite))) { cible.L += q; const dn = dnDe(des); if (Number.isFinite(dn) && !(cible.dnMax >= dn)) cible.dnMax = dn; }
        return;
      }
      // Ligne « Réseau … » chiffrée en forfait : le réseau lui-même
      if (!c && estReseau(des)) { ajouterReseau(des, num); return; }
      if (c) items.push({ ...c, designation: des, qte: q, unite, P: puissance(des), regime: regime(des) || (res ? res.regime : ''), Q: debitAir(des), repere: '', prescrit: '', reseau: res ? res.id : '', sources: [`DPGF${num ? ` ${num}` : ''}`] });
    });
    return { items, reseaux: [...reseaux.values()].map(r => ({ ...r, L: Math.round(r.L * 10) / 10 })) };
  }
  // DPGF en PDF : lignes « n° désignation … unité quantité [prix] »
  function depuisDpgfTexte(lignes) {
    // Même lecture que le classeur : lignes chiffrées « n° désignation unité quantité », titres de réseaux entre elles
    const rows = [['N°', 'Désignation', 'Unité', 'Quantité']];
    (lignes || []).forEach(l => {
      const m = /^\s*([\d.]+[a-z]?)?\s*(.+?)\s+(u|ens|ens\.|ensemble|unite|ml|m|m2|m²|ft|forfait|kg|nb|pce|pièces?)\.?\s+(\d+(?:[.,]\d+)?)(?:\s+[\d\s.,]+€?)*\s*$/i.exec(String(l));
      if (m) { rows.push([m[1] || '', m[2].trim(), m[3], m[4]]); return; }
      const t = /^\s*([\d.]+[a-z]?)?\s*(.{4,120}?)\s*$/.exec(String(l));
      if (t) rows.push([t[1] || '', t[2].trim(), '', '']);
    });
    return depuisDpgf(rows);
  }

  /* ---------- Rapprochement CCTP / DPGF ---------- */
  const mots = t => new Set(norm(t).split(/[^a-z0-9]+/).filter(m => m.length >= 3));
  const ressemblance = (a, b) => { const x = mots(a), y = mots(b); if (!x.size || !y.size) return 0; let n = 0; x.forEach(m => { if (y.has(m)) n++; }); return n / Math.min(x.size, y.size); };
  function fusionner(cctp, dpgf) {
    const out = cctp.map((x, i) => ({ id: `c${i}`, ...x }));
    dpgf.forEach((d, i) => {
      const memes = out.filter(o => o.genre === d.genre && !o.dpgf);
      // Équipements repérés un par un dans le CCTP (CH-01, CH-02) et une ligne « quantité 2 » au DPGF : la même chose
      const reperes = memes.filter(o => o.repere);
      if (reperes.length > 1 && reperes.length === d.qte && reperes.every(o => ressemblance(o.designation, d.designation) >= 0.5 || dpgf.filter(x => x.genre === d.genre).length === 1)) {
        reperes.forEach(o => Object.assign(o, { P: Number.isFinite(o.P) ? o.P : d.P, reseau: o.reseau || d.reseau || '', dpgf: true, sources: [...o.sources, ...d.sources] }));
        return;
      }
      // Même genre : la ligne la plus ressemblante (ou la seule de ce genre de chaque côté)
      const seule = memes.length === 1 && dpgf.filter(x => x.genre === d.genre).length === 1;
      const o = memes.map(m => [m, ressemblance(m.designation, d.designation)]).sort((a, b) => b[1] - a[1]).find(([, s]) => s >= 0.5 || seule);
      if (o) { const m = o[0]; Object.assign(m, { qte: d.qte, P: Number.isFinite(m.P) ? m.P : d.P, Q: Number.isFinite(m.Q) ? m.Q : d.Q, regime: m.regime || d.regime, reseau: m.reseau || d.reseau || '', dpgf: true, sources: [...m.sources, ...d.sources] }); }
      else out.push({ id: `d${i}`, ...d, dpgf: true });
    });
    return out.map(({ dpgf: _, ...x }) => ({ ...x, P: Number.isFinite(x.P) ? x.P : '', Q: Number.isFinite(x.Q) ? x.Q : '', inclus: true }));
  }

  // Réseaux du CCTP et du DPGF réunis (même nom, ou même nature et noms ressemblants) ; les équipements suivent
  function fusionnerReseaux(rc, rd, inventaire = []) {
    const out = (rc || []).map(r => ({ ...r }));
    const renomme = new Map();
    (rd || []).forEach(d => {
      const m = out.find(r => r.id === d.id) || out.find(r => r.nature === d.nature && ressemblance(r.nom, d.nom) >= 0.6);
      if (m) { Object.assign(m, { L: m.L || d.L, dnMax: Number.isFinite(m.dnMax) ? m.dnMax : d.dnMax, regime: m.regime || d.regime, sources: [...m.sources, ...d.sources] }); renomme.set(d.id, m.id); }
      else out.push({ ...d });
    });
    inventaire.forEach(x => { if (x.reseau && renomme.has(x.reseau)) x.reseau = renomme.get(x.reseau); });
    return out;
  }

  /* ---------- Vers le schéma de principe ---------- */
  // Entrées du schéma : générateur principal (le genre le plus représenté), nombre et puissance unitaire, un circuit par émetteur
  function versSchema(inventaire, Sc, reseaux = []) {
    const inc = inventaire.filter(x => x.inclus !== false), alertes = [];
    const prod = inc.filter(x => x.categorie === 'producteur');
    const parGenre = {};
    prod.forEach(x => { parGenre[x.genre] = (parGenre[x.genre] || 0) + (nombre(x.qte) || 1); });
    const principal = Object.entries(parGenre).sort((a, b) => b[1] - a[1])[0];
    const e = {};
    if (principal) {
      const p = prod.find(x => x.genre === principal[0]);
      e.generateur = Sc.GENERATEURS[principal[0]] ? principal[0] : 'chaudiere-cond';
      e.nGen = String(Math.min(6, Math.max(1, principal[1])));
      if (Number.isFinite(nombre(p.P)) && nombre(p.P) > 0) e.Pgen = nombre(p.P);
      e.titreInstallation = p.designation.slice(0, 60);
      if (Object.keys(parGenre).length > 1) alertes.push(`Plusieurs types de producteurs (${Object.keys(parGenre).map(g => GENRES[g].libelle).join(', ')}) : le schéma reprend le plus représenté ; ajoutez un second schéma pour les autres.`);
      if (principal[1] > 6) alertes.push(`${principal[1]} générateurs : le schéma est limité à une cascade de 6.`);
    } else alertes.push('Aucun producteur reconnu : choisissez le générateur dans le schéma.');
    // Régime du réseau : celui cité pour le producteur, sinon le plus fréquent
    const reg = (prod.find(x => x.regime) || inc.find(x => x.regime) || {}).regime;
    if (reg) {
      const [d, r] = reg.split('/').map(Number), k = Object.entries(Sc.REGIMES).find(([, v]) => v[1] === d && v[2] === r);
      if (k) e.reseau = k[0]; else { e.reseau = 'perso'; e.Tdep = d; e.Tret = r; }
    } else if (principal && /^gf/.test(principal[0])) e.reseau = 'eg-7-12';
    else if (principal && principal[0] === 'pac-rev') e.reseau = 'co';
    const em = inc.filter(x => x.categorie === 'emetteur' && Sc.EMETTEURS[x.genre]);
    // Réseaux hydrauliques reconnus (hors plomberie, ECS sanitaire traitée comme un émetteur) : un circuit par réseau,
    // avec ses émetteurs (puissance cumulée), son régime et la longueur de ses tuyauteries
    // Réseaux du fluide de la production : eau chaude (et ECS) pour une chaudière ou une PAC, eau glacée pour un groupe
    // froid, les deux en change-over (PAC réversible)
    const fluide = e.reseau === 'co' || (principal && principal[0] === 'pac-rev') ? ['chauffage', 'ecs', 'eau-glacee', 'change-over'] : (principal && /^gf/.test(principal[0])) || /^eg/.test(e.reseau || '') ? ['eau-glacee'] : ['chauffage', 'ecs', 'change-over'];
    const parId = new Map((reseaux || []).map(r => [r.id, r])), hydro = (reseaux || []).filter(r => r.hydro && fluide.includes(r.nature));
    (reseaux || []).filter(r => r.hydro && r.nature !== 'vapeur' && !fluide.includes(r.nature)).forEach(r => alertes.push(`Réseau « ${r.nom} » (${(NATURE[r.nature] || {}).libelle || r.nature}) : autre fluide que la production principale, à traiter dans un second schéma.`));
    const circuitsReseaux = hydro.map(r => {
      const ems = em.filter(x => x.reseau === r.id);
      const dominant = ems.length ? ems.reduce((m, x) => ((nombre(x.qte) || 1) > (nombre(m.qte) || 1) ? x : m), ems[0]).genre : (classer(r.nom) || {}).genre;
      const emet = Sc.EMETTEURS[dominant] ? dominant : r.nature === 'ecs' ? 'ecs' : r.nature === 'eau-glacee' ? 'ventilo' : 'radiateurs';
      const Ps = ems.map(x => { const P = nombre(x.P), q = nombre(x.qte) || 1; return Number.isFinite(P) && P > 0 ? P * q : NaN; });
      const P = Ps.length && Ps.every(Number.isFinite) ? Math.round(Ps.reduce((s, v) => s + v, 0) * 10) / 10 : '';
      if (P === '') alertes.push(`Réseau « ${r.nom} » : puissance ${ems.length ? 'de certains émetteurs' : 'des émetteurs'} non trouvée, à saisir dans le schéma.`);
      return { rep: r.nom.slice(0, 40), emetteur: emet, P, regime: r.regime && r.regime !== reg ? r.regime : '', regulation: emet === 'ecs' ? 'direct' : emet === 'ventilo' ? '2v' : '3v', L: r.L > 0 ? Math.round(r.L) : 50, reseau: r.id };
    });
    // Émetteurs hors réseau reconnu : un circuit chacun ; ceux d'un réseau d'un autre fluide ne sont pas repris ici
    const sansReseau = em.filter(x => !x.reseau || !parId.has(x.reseau) || (!parId.get(x.reseau).hydro && !['soufflage', 'reprise', 'extraction', 'air-neuf'].includes(parId.get(x.reseau).nature)));
    e.circuits = [...circuitsReseaux, ...sansReseau.map(x => {
      // Puissance citée = puissance unitaire (« aérotherme 25 kW », quantité 4 → circuit de 100 kW)
      const P = nombre(x.P), q = nombre(x.qte) || 1, total = Number.isFinite(P) && P > 0 ? Math.round(P * q * 10) / 10 : '';
      return { rep: `${x.designation.slice(0, 40)}${q > 1 && !/^\d/.test(x.designation) ? ` (×${q})` : ''}`, emetteur: x.genre, P: total, regime: x.regime && x.regime !== reg ? x.regime : '', regulation: x.genre === 'ecs' ? 'direct' : x.genre === 'ventilo' ? '2v' : '3v', L: 50 };
    })];
    sansReseau.filter(x => x.P === '' || !Number.isFinite(nombre(x.P))).forEach(x => alertes.push(`${x.designation} : puissance non trouvée, à saisir dans le schéma.`));
    if (!em.length) alertes.push('Aucun émetteur hydraulique reconnu : ajoutez les circuits dans le schéma.');
    inc.filter(x => x.genre === 'split').forEach(x => alertes.push(`${x.designation} : détente directe, hors schéma hydraulique (repris dans l'alimentation électrique).`));
    return { entrees: e, alertes };
  }

  /* ---------- Vers le schéma aéraulique ---------- */
  // Producteur : la CTA (double flux si citée ou s'il y a de la reprise), sinon le caisson d'extraction / d'insufflation ;
  // émetteurs : une zone par ligne de bouches (débit cité par bouche, sinon 100 m³/h à vérifier)
  function versSchemaAir(inventaire, reseaux = []) {
    // Bouches rangées d'après la nature de leur réseau quand il est reconnu (une grille sur le réseau de reprise est une reprise)
    const nat = new Map((reseaux || []).map(r => [r.id, r.nature]));
    inventaire = inventaire.map(x => (/^bouche/.test(x.genre) && nat.get(x.reseau) ? { ...x, genre: nat.get(x.reseau) === 'soufflage' ? 'bouche-soufflage' : ['reprise', 'extraction'].includes(nat.get(x.reseau)) ? 'bouche-extraction' : x.genre } : x));
    const inc = inventaire.filter(x => x.inclus !== false), alertes = [];
    const cta = inc.find(x => x.genre === 'cta'), caisson = inc.find(x => x.genre === 'ventilateur'), bS = inc.filter(x => x.genre === 'bouche-soufflage'), bE = inc.filter(x => x.genre === 'bouche-extraction');
    const e = {};
    if (cta) { e.producteur = /simple flux|air neuf seul/.test(norm(cta.designation)) && !bE.length ? 'cta-sf' : /melange|recycl/.test(norm(cta.designation)) ? 'cta-melange' : 'cta-df'; e.titreInstallation = cta.designation.slice(0, 60); }
    else if (caisson) { e.producteur = /insuffl/.test(norm(caisson.designation)) ? 'insufflation' : 'extraction'; e.titreInstallation = caisson.designation.slice(0, 60); }
    else { e.producteur = bS.length ? 'cta-df' : 'extraction'; alertes.push('Aucune CTA ni caisson reconnu : choisissez le producteur dans le schéma.'); }
    const df = ['cta-df', 'cta-melange'].includes(e.producteur);
    let d = 0;
    e.zones = [...bS.map(x => [x, 'soufflage']), ...bE.map(x => [x, df ? 'reprise' : 'extraction'])].map(([x, reseau]) => {
      const n = Math.max(1, Math.round(nombre(x.qte) || 1)), q = nombre(x.Q), t = norm(x.designation);
      if (!(q > 0)) alertes.push(`${x.designation} : débit non trouvé, 100 m³/h par bouche à vérifier.`);
      d += 10;
      return { rep: x.designation.slice(0, 40), reseau, type: reseau === 'soufflage' ? (/helic/.test(t) ? 'helico' : /grille/.test(t) ? 'grille' : 'plafond') : 'extraction', n, Q: Math.round((q > 0 ? (q < 2000 && n > 1 ? q * n : q) : 100 * n)), distance: d, L: 6, zeta: 3 };
    });
    if (!e.zones.length) alertes.push('Aucune bouche reconnue : ajoutez les zones dans le schéma.');
    return { entrees: e, alertes };
  }

  /* ---------- Vers l'alimentation électrique ---------- */
  // Lignes d'équipements (format de Electricite.equipementsEtude) ; un équipement par unité jusqu'à 10, regroupé au-delà
  const ELEC = {
    'pac-air': ['pac', 'tri', 'bus'], 'pac-eau': ['pac', 'tri', 'bus'], 'pac-rev': ['pac', 'tri', 'bus'], 'gf-air': ['pac', 'tri', 'bus'],
    'chaudiere-cond': ['generateur', 'mono', 'mod'], 'chaudiere-gaz': ['generateur', 'mono', 'mod'], 'chaudiere-fioul': ['generateur', 'mono', 'mod'], 'chaudiere-bois': ['generateur', 'tri', 'mod'], echangeur: null,
    cta: ['cta', 'tri', 'bus'], 'bouche-soufflage': null, 'bouche-extraction': null, ventilo: ['ventilo', 'mono', 'regul'], aerotherme: ['aerotherme', 'mono', 'tor'], split: ['split', 'mono', 'regul'], ecs: null, radiateurs: null, plancher: null, radiant: null, plafond: null,
    pompe: ['pompe', 'mono', 'tor'], vanne3v: ['vanne', '24V', 'v010'], vanne2v: ['vanne', '24V', 'v010'], ventilateur: ['ventilateur', 'tri', 'var'], desenfumage: ['ventilateur', 'tri', 'torRetour'], vase: null, regulation: null,
  };
  const PELEC = { pac: P => (P > 0 ? Math.round(P / 3 * 10) / 10 : ''), generateur: P => (P > 0 ? Math.max(0.2, Math.round(P * 0.003 * 10) / 10) : 0.3), cta: () => '', ventilo: () => 0.1, aerotherme: () => 0.3, split: P => (P > 0 ? Math.round(P / 3.5 * 100) / 100 : ''), pompe: () => '', vanne: () => 0.01, ventilateur: () => '' };
  const PREFIXES = { pac: 'PAC', generateur: 'G', cta: 'CTA', ventilo: 'VC', aerotherme: 'AT', split: 'SP', pompe: 'P', vanne: 'VM', ventilateur: 'V' };
  function versElec(inventaire) {
    const out = [];
    inventaire.filter(x => x.inclus !== false && ELEC[x.genre]).forEach((x, i) => {
      const [type, tension, regulation] = ELEC[x.genre], q = Math.max(1, Math.round(nombre(x.qte) || 1)), P = nombre(x.P);
      const Pe = (PELEC[type] || (() => ''))(Number.isFinite(P) ? P : 0);
      const base = { type, tension, regulation, designation: x.designation.slice(0, 60), depart: type === 'ventilateur' ? 'variateur' : undefined };
      // Repère : celui du CCTP, sinon préfixe du type numéroté (VC-01, VC-02…)
      const pre = x.repere || PREFIXES[type] || 'EQ';
      if (q <= 10) for (let k = 1; k <= q; k++) out.push({ src: `inv:${x.id || i}:${k}`, rep: x.repere && q === 1 ? x.repere : `${pre}-${String(k).padStart(2, '0')}`, ...base, P: Pe });
      else out.push({ src: `inv:${x.id || i}`, rep: `${pre} ×${q}`, ...base, designation: `${base.designation} (×${q})`, P: Pe === '' ? '' : Math.round(Pe * q * 100) / 100 });
    });
    return out;
  }

  return { NATURES, NATURE, natureReseau, estReseau, reseauxCctp, fusionnerReseaux, REGLES, GENRES, classer, puissance, regime, debitAir, depuisCctp, depuisDpgf, depuisDpgfTexte, fusionner, versSchema, versSchemaAir, versElec, norm };
})();
if (typeof module !== 'undefined') module.exports = InventaireCVC;
