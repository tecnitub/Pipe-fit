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
    // « Ventilation du local technique CTA / sous-station » : la ventilation d'un local, ni une CTA ni une production
    [/^ventilations? (?:du |des |de la )?(?:locale?s?|locaux)\b/, 'auxiliaire', 'ventilateur', 'Ventilation'],
    // Avant les PAC (« échangeur … rejet PAC », « circuit pompe rejet PAC ») : l'accessoire n'est pas la PAC
    [/echangeur[^.]*(?:nappe|captage|forage|geotherm|piscine|process)|(?:nappe|captage)[^.]*echangeur/, 'auxiliaire', 'echangeur-aux', 'Échangeur (nappe, process)'],
    [/^(?:circuits? (?:de )?pompes?|pompes? (?:de |du )?(?:rejet|circulation|distribution|relevage|charge))/, 'auxiliaire', 'pompe', 'Pompe'],
    // Thermofrigopompe : PAC eau / eau qui produit le chaud et le froid en même temps (récupération totale)
    [/thermo-?frigo-?pompe|\btfp\b/, 'producteur', 'pac-eau', 'PAC eau / eau'],
    [/pompes? a chaleur[^.]*(?:reversible)|pac reversible|reversible[^.]*pompe a chaleur/, 'producteur', 'pac-rev', 'PAC réversible'],
    [/pompes? a chaleur[^.]*eau ?\/ ?eau|pac eau ?\/ ?eau|pac geothermi|geothermi/, 'producteur', 'pac-eau', 'PAC eau / eau'],
    [/pompes? a chaleur|\bpac\b/, 'producteur', 'pac-air', 'PAC air / eau'],
    [/groupes? (?:de production )?(?:froid|d'eau glacee)|refroidisseur|\bchiller\b|production d'eau glacee/, 'producteur', 'gf-air', 'Groupe froid'],
    [/chaudiere[^.]*(?:bois|granule|biomasse|plaquette)/, 'producteur', 'chaudiere-bois', 'Chaudière bois'],
    [/chaudiere[^.]*fioul/, 'producteur', 'chaudiere-fioul', 'Chaudière fioul'],
    [/chaudiere[^.]*condensation|condensation[^.]*chaudiere/, 'producteur', 'chaudiere-cond', 'Chaudière à condensation'],
    [/chaudiere/, 'producteur', 'chaudiere-gaz', 'Chaudière gaz'],
    [/sous[- ]station|reseau de chaleur|echangeur[^.]*(?:primaire|reseau)/, 'producteur', 'echangeur', 'Sous-station / échangeur'],
    [/ballons? tampon|reservoir tampon/, 'auxiliaire', 'tampon', 'Ballon tampon'],
    [/centrales? de traitement d'air|\bcta\b|centrales? (?:d'air )?(?:de (?:ventilation|vmc) )?double flux|\bvmc double flux|caissons? double flux/, 'emetteur', 'cta', 'CTA'],
    [/ventilo[- ]?convecteur|cassette/, 'emetteur', 'ventilo', 'Ventilo-convecteurs'],
    [/aerotherme|aero-?chauffeur/, 'emetteur', 'aerotherme', 'Aérothermes'],
    [/plancher (?:chauffant|rafraichissant|reversible)/, 'emetteur', 'plancher', 'Plancher chauffant'],
    [/radiateur/, 'emetteur', 'radiateurs', 'Radiateurs'],
    [/panneaux? rayonnant|tubes? radiant|plafond rayonnant chauffant|cassette rayonnante/, 'emetteur', 'radiant', 'Panneaux rayonnants'],
    [/poutres? (?:froide|climatique)|plafonds? (?:froid|rafraichissant)/, 'emetteur', 'plafond', 'Poutres / plafonds froids'],
    [/ballons?\b|preparateur|chauffe-?eau|cumulus|production d'eau chaude|eau chaude sanitaire|\becs\b/, 'emetteur', 'ecs', 'Production d\'ECS'],
    [/\bsplits?\b|unites? (?:interieures?|exterieures?)|groupes? de condensation|detente directe|\bdrv\b|\bvrv\b|\bvrf\b|multi-?split/, 'emetteur', 'split', 'Splits / DRV'],
    [/circulateur|pompes?\b/, 'auxiliaire', 'pompe', 'Pompe'],
    [/vannes? (?:de regulation )?(?:3|trois) voies|\bv3v\b/, 'auxiliaire', 'vanne3v', 'Vanne 3 voies'],
    [/vannes? (?:de regulation )?(?:2|deux) voies|\bv2v\b/, 'auxiliaire', 'vanne2v', 'Vanne 2 voies'],
    // Émetteurs aérauliques (avant la ventilation : « bouche VMC » est une bouche)
    [/(?:bouches?|grilles?|diffuseurs?)[^.]*(?:extraction|reprise|vmc|hygro)|(?:extraction|reprise)[^.]*(?:bouches?|grilles?)/, 'emetteur', 'bouche-extraction', 'Bouches d\'extraction / reprise'],
    [/(?:bouches?|grilles?)[^.]*soufflage|diffuseurs?|soufflage[^.]*(?:bouches?|grilles?)/, 'emetteur', 'bouche-soufflage', 'Bouches de soufflage'],
    [/desenfumage/, 'auxiliaire', 'desenfumage', 'Désenfumage'],
    [/\bvmc\b|caisson d'(?:extraction|insufflation)|extracteur|tourelle/, 'auxiliaire', 'ventilateur', 'Ventilation'],
    [/vase d'expansion/, 'auxiliaire', 'vase', 'Vase d\'expansion'],
    [/regulation|automate|\bgtb\b|\bgtc\b|sonde|armoire electrique|pilotage/, 'auxiliaire', 'regulation', 'Régulation, armoire'],
  ];
  // Lignes qui ne sont pas des équipements (même si elles en citent un) : tuyauteries, calorifuge, essais, études…
  // Mots entiers (« plans » ne doit pas écarter « plancher chauffant »)
  const EXCLU = /^(?:neutralisations?|rebouchages?|carottages?|tuyauteries?|tubes?|reseaux?|equilibrages?|releves?|reperages?|etiquet\w*|plots?|rincages?|desinfections?|chlorations?|prestations?|sujetions?|frais|reservations?|socles?|massifs?|calorifug\w*|isolation|fourreaux?|supports?|supportage|essais?|mise en service|etudes?|plans?|doe|dossier|nettoyage|depose|demontage|reperage|peinture|formation|garantie|maintenance|raccordements?|alimentation electrique|cablage|liaisons?|percements?|manutention|charges? frigorifiques?|chemins? de cables?|pieces? d'adaptation|ensemble des|trappes?|cadres?|bacs?|plenums?|manchettes?|a partir de|conteneurs?|moyens? de levage|repli|operations? de reception)\b/;
  // Accessoires d'un équipement (« Accessoires Pompe à chaleur », « Supportage CTA », « Batterie électrique CTA »…) : jamais
  // l'équipement lui-même ; la régulation et l'armoire restent des auxiliaires
  const ACCESSOIRE = /^(?:accessoires?|mitigeurs?|filtres?|pots? a boue|desemboueurs?|separateurs?|degazeurs?|purgeurs?|soupapes?|disconnecteurs?|manometres?|thermometres?|armoires?(?: electriques?)?|regulations?|gtc|gtb|pilotage|bouclage|equipements? externes?|commande deportee|batteries?|pieges? a son|registres?|clapets?|remplissage|vannes?(?! (?:de regulation |motorisees? )?(?:a )?(?:2|3|4|deux|trois|quatre) voies)|raccordement|by-?pass|clarificateur|compteurs?|grilles? de rejet)\b/;
  // Variantes, options, moins-values : chiffrées à part, pas l'installation de base
  const VARIANTE = /\b(?:variantes?|options?|moins[- ]?values?|plus[- ]?values?|pse|prestations? supplementaires?)\b/;
  const GENRES = Object.fromEntries(REGLES.map(r => [r[2], { categorie: r[1], libelle: r[3] }]));
  // Prestations de régulation (« Configuration des points CTA », « Analyse fonctionnelle », « Bouton de relance
  // confort ») : de la régulation, jamais l'équipement qu'elles citent
  const REGUL_PREST = /^(?:configuration|parametrage|analyse fonctionnelle|cablage|programmation|asservissement|boutons?\b|relance|mise en reseau|integration|points? (?:gtb|gtc|de regulation)|supervision|telegestion|(?:reports?|renvois?) (?:de |des |du )?defauts?)/;
  function classer(texte) {
    const t = norm(texte).replace(/^(?:(?:moins|plus)[- ]?values?\s*:?\s*)/, '').replace(/^(?:fourniture,? (?:et |& )?(?:pose|mise en (?:oeuvre|œuvre|place)) (?:de |d'|du |des )?(?:la |le |l'|les )?(?:l'ensemble (?:de |des |du )?)?)/, '');
    if (!t || EXCLU.test(t)) return null;
    if (REGUL_PREST.test(t)) return { categorie: 'auxiliaire', genre: 'regulation' };
    // Accessoire d'un terminal (« Grille de diffusion … ventilo-convecteur en allège », « Plenum … cassette ») : pas un terminal
    if (/^(?:grilles?|plenums?|habillages?|carrosseries?|socles?|pieds?|consoles?|kits?)\b.*\b(?:ventilo|convecteurs?|radiateurs?|cassettes?|terminaux|unites? interieures?)\b/.test(t)) return null;
    if (ACCESSOIRE.test(t)) return /regulation|automate|gtc|gtb|armoire/.test(t) ? { categorie: 'auxiliaire', genre: 'regulation' } : null;
    const r = REGLES.find(([re]) => re.test(t));
    return r ? { categorie: r[1], genre: r[2] } : null;
  }
  // Puissance (kW) et régime (« 45/35 °C ») cités dans un texte
  const puissance = texte => { const m = /(\d+(?:[.,]\d+)?)\s*kw(?:c|f|th)?\b/i.exec(String(texte || '')); return m ? nombre(m[1]) : NaN; };
  // Débit d'air cité (m³/h)
  const debitAir = texte => { const m = /(\d[\d\s]{0,6}(?:[.,]\d+)?)\s*m(?:3|³)\s*\/\s*h/i.exec(String(texte || '')); return m ? nombre(m[1]) : NaN; };
  const regime = texte => { const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*°?\s*c\b/i.exec(String(texte || '')); return m ? `${m[1]}/${m[2]}` : ''; };

  /* ---------- Caractéristiques techniques lues dans le texte (CCTP, ligne du DPGF) ---------- */
  // Puissances : chaque « N kW » prend le sens des mots qui le précèdent dans sa phrase — électrique (absorbée, moteur,
  // batterie électrique), froid (frigorifique, rafraîchissement), chaud (calorifique, chauffage) ; sinon puissance seule
  const uniteAuLibelle = texte => String(texte || '').replace(/\(\s*(k?W|m3\/h|m³\/h|l|litres?|pa|mce)\s*\)\s*:\s*(\d[\d  ]*(?:[.,]\d+)?)/gi, (_, u, v) => `: ${v.trim()} ${u}`);
  function puissances(texte) {
    // « 2200W » compte aussi (en kW)
    // « 95,0kKW » (texte reconnu par OCR) : un kilowatt
    // Unité au libellé d'une ligne de tableau (« Puissance frigorifique nominale (kW) : 18,0 ») : écrite après la valeur
    const t = uniteAuLibelle(texte).replace(/(\d)\s?k[kK]W\b/g, '$1 kW'), out = {}, re = /(\d{1,3}(?:[  ]\d{3})+(?![.,]\d)|\d+(?:[.,]\d+)?)(?:\s*(?:à|-)\s*(\d+(?:[.,]\d+)?))?\s*(k?)w(c|f|th|e)?\b/gi;
    let m;
    while ((m = re.exec(t))) {
      if (!m[3] && !/^\d{3,5}$/.test(m[1].replace(/[  ]/g, ''))) continue;
      const v = Math.max(nombre(m[1]), m[2] ? nombre(m[2]) : 0) / (m[3] ? 1 : 1000);
      // Mots qui précèdent dans la même phrase / le même membre (« Puissance froid : », « batterie électrique de »)
      const avant = norm(t.slice(Math.max(0, m.index - 80), m.index)).split(/[.;|•]\s|,\s|\s-\s|\n/).pop();
      // Charge du local ou donnée d'entrée (« Déperditions = 2.8 kW », « Apports totaux », « 230 W dont 155 W latent » par occupant) :
      // pas la puissance d'un équipement
      if (/deperditions?|apports?|metabolisme|occupants?\b|\boccupation|par personne|\(\s*\d+\s*p\b|\bdont\s*$/.test(avant) || /^\s*dont\b/.test(norm(t.slice(m.index + m[0].length, m.index + m[0].length + 8)))) continue;
      const suf0 = String(m[4] || '').toLowerCase(), apres = norm(t.slice(m.index + m[0].length, m.index + m[0].length + 25));
      // Qualificatif écrit juste après (« 69 kW froid », « 12 kW électrique »)
      const suf = suf0 || (/^\s*(?:\([^)]*\)\s*)?(?:froid|frigorifique)/.test(apres) ? 'f' : /^\s*(?:\([^)]*\)\s*)?(?:electrique|absorbee|elec)\b/.test(apres) ? 'e' : '');
      const k = suf === 'e' || /absorb|electri|moteur|ventilateur|consomm|\bp1\b|resistance|appoint|\belec\b/.test(avant) ? 'Pel'
        : suf === 'f' || /froid|frigorifique|refroidissement|rafraichissement|eau glacee|climatisation|\bclim\b|sensible|latente/.test(avant) ? 'Pfr'
          : /chaud|calorifique|chauffage|\bp ?calo\b|thermique|restitu|condensation/.test(avant) ? 'Pch' : 'P';
      if (Number.isFinite(v) && v > 0 && out[k] === undefined) out[k] = v;
    }
    return out;
  }
  const nbr = s => nombre(String(s).replace(/\s/g, ''));
  const FRIGO = /\br[ -]?(32|410a|454b|290|134a|513a|1234ze|1234yf|744|407c|452b|448a|449a|600a)\b/;
  function caracteristiques(texte) {
    const t = uniteAuLibelle(texte), x = norm(t), c = puissances(t);
    // Débit d'air annoncé « débit … » (le maxi d'une plage « 1490 / 2560 m³/h »), sinon le premier cité
    // Seuil réglementaire (« détection de fumée (débit sup. à 10 000 m3/h) ») : pas le débit de l'appareil
    let m = [...x.matchAll(/debit[^0-9]{0,40}?(\d[\d\s]{0,6}(?:[.,]\d+)?)(?:\s*(?:\/|a|-)\s*(\d[\d\s]{0,6}))?\s*m(?:3|³)\s*\/\s*h/g)].find(r => !/\b(?:sup\w*|inf\w*|au-?dela|plus de|moins de|jusqu'a)\b|[<>≥≤]/.test(r[0].replace(/\d.*$/, ''))) || null;
    if (m) c.Q = Math.max(nbr(m[1]), m[2] ? nbr(m[2]) : 0); else { const q = debitAir(t); if (Number.isFinite(q)) c.Q = q; }
    if (c.Q === undefined) { m = /(?:\bas ?\/ ?ar|\bas\b|\bar\b|soufflage|reprise|extraction)\s*:?\s*(\d[\d\s]{1,6}(?:[.,]\d+)?)\s*m(?:3|³)\b/.exec(x); if (m) c.Q = nbr(m[1]); }
    m = /pression (?:disponible|statique(?: disponible| externe)?|utile|externe|totale disponible)[^0-9]{0,25}(\d{2,4})\s*pa\b/.exec(x); if (m) c.Pdispo = +m[1];
    m = /(?:hmt|hauteur manometrique)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(mce|kpa|m\b)/.exec(x) || /(\d+(?:[.,]\d+)?)\s*(m ?ce)\b/.exec(x); if (m) c.HMT = m[2] === 'kpa' ? Math.round(nombre(m[1]) / 9.81 * 10) / 10 : nombre(m[1]);
    const regs = [...t.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})\s*°?\s*c\b/gi)].map(r => [+r[1], +r[2]]);
    const fr = regs.find(([a, b]) => a < b && a <= 15), ch = regs.find(([a, b]) => a > b && a >= 25);
    if (fr) c.regimeFroid = `${fr[0]}/${fr[1]}`;
    if (ch) c.regimeChaud = `${ch[0]}/${ch[1]}`;
    m = FRIGO.exec(x); if (m) c.frigorigene = `R${m[1].toUpperCase()}`;
    m = /puissance (?:acoustique|sonore)[^0-9]{0,30}(\d{2,3})(?:\s*\/\s*(\d{2,3}))?\s*db/.exec(x); if (m) c.Lw = +(m[2] || m[1]);
    m = /(?:pression|niveau) (?:de pression )?(?:acoustique|sonore)[^0-9]{0,30}(\d{2,3})(?:\s*\/\s*(\d{2,3}))?\s*db/.exec(x); if (m) c.Lp = +(m[2] || m[1]);
    ['scop', 'seer', 'cop', 'eer'].forEach(k => { const r = new RegExp(`\\b${k}\\b[^0-9a-z]{0,6}(\\d(?:[.,]\\d{1,2})?)`).exec(x); if (r && nombre(r[1]) > 1 && nombre(r[1]) < 10) c[k.toUpperCase()] = nombre(r[1]); });
    m = /(?:efficacite|rendement)[^%]{0,40}?(\d{2})\s*%/.exec(x); if (m && +m[1] >= 50) c.rendement = +m[1];
    if (/filtr/.test(x)) { const f = [...new Set([...t.matchAll(/\b(ePM(?:1|2[.,]5|10)\s*\d{2}\s*%|[GMF][4-9])\b/g)].map(r => r[1].replace(/\s+/g, ' ')))]; if (f.length) c.filtres = f.slice(0, 4).join(', '); }
    if (/\b400\s*v\b|triphase|\btri\b/.test(x)) c.tension = '400 V'; else if (/\b230\s*v\b|monophase|\bmono\b/.test(x)) c.tension = '230 V';
    // Volume : « 900 litres », « ballon … 150L », « capacité 200 L » (pas « inox 304L »)
    // « 30 litres d'ECS à 60 °C / douche » : un besoin, pas la capacité
    m = /(\d{2,5})\s*litres?\b(?![^.;,]{0,30}(?:\/|\bpar\b)\s*(?:douches?|personnes?|jours?|lits?|repas|occupants?|usagers?))/.exec(x) || /(?:capacite|volume|contenance|ballon|stockage|cuve|tampon)[^0-9]{0,25}(\d{2,5})\s*l\b(?!\s*\/)/.exec(x) || /(?:vase|expansion)[^0-9]{0,60}?(\d{2,5})\s*l\b(?!\s*\/)/.exec(x); if (m) c.volume = +m[1];
    return c;
  }
  /* ---------- Détails d'installation lus dans le texte (montage, pompe, récupération, batteries, rôle, marque, local…) ---------- */
  // designation : titre de l'article ou de la ligne (le rôle « d'appoint » s'y lit sans ambiguïté) ; texte : corps complet
  const MARQUES_REG = [['siemens', 'siemens'], ['schneider', 'schneider'], ['sauter', 'sauter'], ['distech', 'distech'], ['trend', 'trend'], ['\\bwit\\b', 'wit']];
  function details(texte, designation = '') {
    const t = String(texte || ''), x = norm(t), titre = norm(designation), d = {};
    // Rôle d'un générateur : titre (« Chaudière d'appoint ») d'abord, sinon formule explicite du texte (« en appoint »)
    const role = s => (/\bthermo-?frigo-?pompe|\ben recuperation\b/.test(s) ? 'recuperation' : /\bappoint\b/.test(s) ? 'appoint' : /\breleve\b/.test(s) ? 'releve' : /\bsecours\b/.test(s) ? 'secours' : /\ben base\b|\bde base\b|generateur principal/.test(s) ? 'base' : '');
    d.role = role(titre) || role((x.match(/\b(?:en|assure l'|fonctionne en|utilisee? en|prevue? en) ?(?:appoint|releve|secours|base|recuperation)\b[^.]*/) || [''])[0]);
    if (!d.role) delete d.role;
    // Montage hydraulique d'un circuit ou d'un émetteur
    if (/\binjection\b/.test(x)) d.montage = /injection[^.]{0,30}(?:2|deux) voies|(?:2|deux) voies[^.]{0,20}injection/.test(x) ? 'injection2' : 'injection3';
    else if (/\bdecharge\b/.test(x)) d.montage = 'decharge';
    else if (/bouteille (?:de (?:decouplage )?)?(?:du |de )?circuit|circuit[^.]{0,30}bouteille/.test(x)) d.montage = 'bouteille';
    else if (/echangeur (?:a plaques )?(?:de |du )?circuit|circuit[^.]{0,30}(?:separe|isole) par (?:un )?echangeur/.test(x)) d.montage = 'echangeur';
    else if (/vannes? (?:de regulation )?(?:motorisees? )?(?:a )?(?:4|quatre) voies|\bv4v\b/.test(x)) d.montage = '4v';
    else if (/vannes? (?:de regulation )?(?:motorisees? )?(?:a )?(?:2|deux) voies|\bv2v\b|debit variable/.test(x)) d.montage = '2v';
    else if (/vannes? (?:de regulation )?(?:motorisees? )?(?:a )?(?:3|trois) voies|\bv3v\b|melangeuse/.test(x)) d.montage = '3v';
    // Découplage production / distribution
    if (/bouteille[^.]{0,20}3 piquages/.test(x)) d.decouplage = 'bouteille3';
    else if (/ballon[^.]{0,25}(?:de )?decouplage|decouplage[^.]{0,30}ballon/.test(x)) d.decouplage = 'ballon';
    else if (/bouteille (?:de )?(?:decouplage|casse-?pression)|casse-?pression/.test(x)) d.decouplage = 'oui';
    else if (/echangeur (?:a plaques )?(?:de )?(?:decouplage|separation)/.test(x)) d.decouplage = 'echangeur';
    else if (/sans (?:bouteille|decouplage)|raccordement direct/.test(x)) d.decouplage = 'non';
    // Pompe du générateur : module ou kit hydraulique du fabricant, sinon pompe déportée
    if (/module hydraulique|kit hydraulique|hydrokit|pompes? (?:de circulation |primaire )?integrees?|circulateurs? integres?|avec pompe/.test(x) && !/sans (?:module|kit) hydraulique/.test(x)) d.pompe = 'integree';
    else if (/pompes? (?:primaires? )?(?:deportees?|separees?)|sans (?:module|kit) hydraulique/.test(x)) d.pompe = 'deportee';
    // Récupération d'énergie (groupe froid, thermofrigopompe) et récupérateur de chaleur (CTA)
    if (/thermo-?frigo-?pompe|\btfp\b|recuperation totale|condenseur de recuperation|100 ?% de la chaleur/.test(x)) d.recup = 'totale';
    else if (/desurchauffeur|recuperation (?:partielle |d'energie |de chaleur |des calories )?(?:sur|au|du) (?:le |la )?(?:groupe|condenseur|refroidisseur|pac)|recuperation de chaleur[^.]{0,40}(?:groupe|condenseur|eau glacee)/.test(x)) d.recup = 'desurchauffeur';
    if (/sans recuperat/.test(x)) d.recuperateur = 'aucun';
    else if (/\broue\b|rotati[fv]/.test(x)) d.recuperateur = 'roue';
    else if (/glycol|boucle (?:a eau )?(?:de recuperation|glycolee)|batteries? a eau glycolee/.test(x)) d.recuperateur = 'glycol';
    else if (/(?:echangeur|recuperateur)[^.]{0,30}(?:plaques|contre-?courant|flux croises)|plaques a contre-?courant/.test(x)) d.recuperateur = 'plaques';
    // Batteries d'une CTA : eau chaude, eau glacée, change-over, électrique (chauffage, préchauffage antigel, appoint)
    const bat = {};
    if (/change.?over|batteries? reversibles?/.test(x)) bat.co = true;
    // « Batterie de chauffage » d'une CTA à batterie électrique (sans eau citée) : la batterie électrique elle-même
    const beSeule = /batteries? (?:chaudes? )?electriques?/.test(x) && !/batteries? (?:a eau|eau chaude|hydrauliques?|chaude a eau)|raccordee? au reseau/.test(x);
    if (/batteries? (?:a |d')?(?:eau chaude(?! sanitaire)|chaude a eau|chaudes?(?! electrique)|de chauffage(?: a eau)?|hydrauliques? chaude)/.test(x) && !/batteries? chaudes? electriques?/.test(x) && !(beSeule && !/batteries? (?:a |d')?(?:eau chaude|chaude a eau|de chauffage a eau)/.test(x))) bat.chaude = true;
    if (/batteries? (?:a |d')?(?:eau glacee|eau froide|froides?(?! electrique)|de refroidissement)|batteries? chaudes? et froides?/.test(x)) bat.froide = true;
    const be = /batteries? (?:chaudes? )?electriques?|resistances? electriques?/.exec(x);
    if (be) {
      const autour = x.slice(Math.max(0, be.index - 40), be.index + 80);
      bat.elec = /prechauff|antigel|hors.?gel/.test(autour) ? 'prechauffage' : /appoint|post.?chauff|rechauff|terminale/.test(autour) ? 'appoint' : bat.chaude || bat.co ? 'appoint' : 'chaude';
      const p = /batteries? (?:chaudes? )?electriques?[^.;]{0,50}?(\d+(?:[.,]\d+)?)\s*kw/.exec(x) || /(\d+(?:[.,]\d+)?)\s*kw[^.;]{0,15}batteries? electriques?/.exec(x);
      if (p) d.PelBe = nombre(p[1]);
    }
    if (Object.keys(bat).length) d.batteries = bat;
    // Terminaux : 2 ou 4 tubes
    if (/\b4 tubes\b/.test(x)) d.tubes = '4t'; else if (/\b2 tubes\b/.test(x)) d.tubes = '2t';
    if (/\b2 fils\b/.test(x)) d.fils2 = true;
    if (/pompes? double|pompes? jumel|double tete/.test(x)) d.double = true;
    if (/cassette/.test(x)) d.forme = 'cassette'; else if (/gainable/.test(x)) d.forme = 'gainable';
    // Ballon : fonction
    if (/stockage (?:d'energie|thermique|de chaleur|d'eau chaude primaire)|hydro-?accumul/.test(x)) d.ballon = 'stockage';
    else if (/ballon[^.]{0,30}decouplage|decouplage[^.]{0,30}ballon/.test(x)) d.ballon = 'decouplage';
    else if (/tampon/.test(x)) d.ballon = 'tampon';
    else if (/sanitaire|\becs\b/.test(x)) d.ballon = 'ecs';
    // Sous-station : réseau de chaleur, régime primaire (« primaire 90/70 »)
    if (/sous-?station|reseau de chaleur|reseau urbain|chauffage urbain/.test(x)) d.sousStation = true;
    const rp = /primaire[^.]{0,40}?(\d{2,3})\s*\/\s*(\d{2,3})\s*°?\s*c?/.exec(x); if (rp && +rp[1] > +rp[2]) d.regimePrim = `${rp[1]}/${rp[2]}`;
    // Marque, référence, « ou équivalent » ; une marque citée en tête de phrase (« Automate Siemens ») compte aussi
    const mq = /\b[Mm]arques?\s*:?\s*([A-Z][\w&'-]+(?:\s(?!ou\b|type\b|ref)[A-Z][\w&'-]+)?)/.exec(t);
    if (mq) d.marque = mq[1].trim();
    // « Marque et type : 1 x ACME … » : le nombre d'appareils n'est pas la référence
    // Plusieurs « type … » au texte (« registre … de type RX », « Type = ACME Modèle DF 100 ») : d'abord celui écrit en
    // libellé (« Type = », « Modèle : »), puis « modèle » ou « référence », enfin le premier « type » ; la marque en tête retirée
    // Phrase ou puce qui commence par un accessoire (« - Volet tunnel … de type … », « Un registre … de type … ») : la
    // référence de l'accessoire, après celle de l'équipement
    const ACC_AVANT = /^\s*(?:(?:le|la|les|un|une|des|du|d'un|d'une)\s+)?(?:volets?|grilles?|registres?|clapets?|bouches?|pieges?|conduits?|gaines?|filtres?|vannes?|silencieux|manchettes?|plots?|supports?)\b/;
    const REF = /\b([Tt]ype|[Mm]od[eè]le|[Rr][ée]f[ée]rence|[Gg]amme)(\s*[:=])?\s*(?:\d{1,3}\s*x\s+(?:[A-Z][\w&'-]+\s+){0,2}?)?([A-Z0-9][\w./+-]*(?:\s(?!ou\b)(?!\d+(?:[.,]\d+)?\s*(?:bars?|kw|w|l|m3|mm|v|°)\b)[A-Z0-9][\w./+-]*){0,2})/g;
    // « Marque/Type » : en-tête de tableau, pas une référence
    const tousRefs = []; for (let m; (m = REF.exec(t));) { tousRefs.push(m); REF.lastIndex = m.index + 1; } // chevauchants (« Type = ACME Modèle … »)
    const refs = tousRefs.filter(r => t[r.index - 1] !== '/' && !/^(?:de|du|des)$/i.test(r[3]) && !/\bMod\b|\bType\b|\bR[ée]f\b/.test(r[3])).map(r => Object.assign(r, { 1: r[3], rang: !/[A-Za-z]/.test(r[3]) ? 4 : r[2] ? 0 : /^[mr]/i.test(r[1]) ? 1 : ACC_AVANT.test(norm(t.slice(Math.max(0, r.index - 120), r.index).split(/[.;:•\n]|\s[-–]\s|^[-–]\s|,\s+(?=[A-Z])/).pop())) ? 3 : 2 }));
    const ref = refs.sort((a, b) => a.rang - b.rang || a.index - b.index)[0];
    if (ref) {
      d.reference = ref[1].trim();
      const marques = [d.marque, ...[...t.matchAll(/\b(?:fabrication|marque)\s+(?:de\s+)?([A-Z][\w&'-]+)/g)].map(m => m[1])].filter(Boolean).map(m => norm(m));
      const mots = d.reference.split(' ');
      if (mots.length > 1 && marques.includes(norm(mots[0]))) d.reference = mots.slice(1).join(' ');
    }
    // Nom de gamme sans chiffre suivi du modèle (« ACME AéroMax® AX 8 ») : le modèle
    if (d.reference && !/\d/.test(d.reference)) { const suite = /^\S*[\s®™]*([A-Z]{1,5}\s?\d[\w./+-]*)/.exec(t.slice(ref.index + ref[0].length)); if (suite) d.reference = suite[1]; }
    if (/ou (?:techniquement |strictement )?equivalent/.test(x)) d.equivalent = true;
    // Local, pièce : « Local : … », « implantée en toiture », « dans la chaufferie »
    const loc = /\b(?:local|locaux|pi[eè]ces?|emplacement|implantation|localisation|zones? desservies?)\s*:\s*([^.;\n]{3,50})/i.exec(t) || /\b(?:en|dans (?:la|le|les)|sur (?:la|le))\s+(chaufferie|toiture(?:[- ]terrasse)?|terrasse|sous-station|local technique|locaux techniques|faux[- ]plafonds?|combles|sous-sol|vide sanitaire|plenum)\b/i.exec(t);
    if (loc) d.local = loc[1].trim().replace(/\s+/g, ' ');
    // Régulation : marque de l'automate, supervision (GTB) et bus des équipements
    if (/regulation|automate|\bgtb\b|\bgtc\b|supervision|\bbacnet|modbus|\bknx\b|\blon\b/.test(x)) {
      const r = {};
      const m = MARQUES_REG.find(([re]) => new RegExp(re).test(x)); if (m) r.marque = m[1];
      if (/\bgtb\b|\bgtc\b|supervision/.test(x)) { const g = /bacnet(?! ?ms)|modbus tcp|\bknx\b|\blon(?:works)?\b/.exec(x); if (g) r.gtb = /bacnet/.test(g[0]) ? 'BACnet/IP' : /modbus/.test(g[0]) ? 'Modbus TCP' : /knx/.test(g[0]) ? 'KNX' : 'LON'; }
      const b = /modbus rtu|rs ?485|bacnet ms ?\/? ?tp|m-?bus\b/.exec(x); if (b) r.bus = /bacnet/.test(b[0]) ? 'BACnet MS/TP' : /m-?bus/.test(b[0]) ? 'M-Bus' : 'Modbus RTU';
      if (/regulateurs? (?:pre-?programmes?|preconfigures?)|synco/.test(x)) r.techno = 'synco'; else if (/automate/.test(x)) r.techno = 'automate';
      if (Object.keys(r).length) d.regulation = r;
    }
    return d;
  }

  const f1 = v => String(Math.round(v * 100) / 100).replace('.', ',');
  // Résumé lisible : « 3 500 m³/h · 250 Pa · 0,82 kW élec. · R454B · froid 7/12 °C »
  function caracTexte(c) {
    if (!c) return '';
    const sep = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return [Number.isFinite(c.Q) && `${sep(c.Q)} m³/h`, Number.isFinite(c.Pdispo) && `${c.Pdispo} Pa dispo`, Number.isFinite(c.HMT) && `HMT ${f1(c.HMT)} mCE`,
      Number.isFinite(c.Pch) && `${f1(c.Pch)} kW chaud`, Number.isFinite(c.Pfr) && `${f1(c.Pfr)} kW froid`, Number.isFinite(c.Pel) && `${f1(c.Pel)} kW élec.`,
      c.regimeChaud && `chaud ${c.regimeChaud} °C`, c.regimeFroid && `froid ${c.regimeFroid} °C`, c.frigorigene, Number.isFinite(c.SCOP) && `SCOP ${f1(c.SCOP)}`, Number.isFinite(c.COP) && `COP ${f1(c.COP)}`,
      Number.isFinite(c.EER) && `EER ${f1(c.EER)}`, Number.isFinite(c.SEER) && `SEER ${f1(c.SEER)}`, Number.isFinite(c.rendement) && `récupération ${c.rendement} %`, c.filtres && `filtres ${c.filtres}`,
      Number.isFinite(c.Lw) && `Lw ${c.Lw} dB(A)`, Number.isFinite(c.Lp) && `Lp ${c.Lp} dB(A)`, c.tension, Number.isFinite(c.volume) && `${c.volume} L`].filter(Boolean).join(' · ');
  }
  // Puissances de l'équipement : chaud (P, puissance thermique utilisée par le schéma), froid, électrique
  // Pompe, ventilateur, vanne, régulation : une puissance sans qualificatif (« Puissance = 600 W ») est électrique
  const puissancesItem = (c, genre) => {
    const gf = /^gf/.test(genre || ''), elec = /^(?:pompe|ventilateur|desenfumage|vanne|regulation)/.test(genre || '');
    const P = elec ? NaN : Number.isFinite(c.Pch) ? c.Pch : Number.isFinite(c.P) && !gf && !Number.isFinite(c.Pfr) ? c.P : NaN;
    return { P, Pfr: elec ? NaN : Number.isFinite(c.Pfr) ? c.Pfr : gf && Number.isFinite(c.P) ? c.P : NaN, Pel: Number.isFinite(c.Pel) ? c.Pel : elec && Number.isFinite(c.P) ? c.P : NaN };
  };

  // CTA à batterie électrique seule : la puissance sans qualificatif (« Puissance antigivre 9 kW ») est celle de la batterie
  // électrique, pas une puissance de chauffage à eau
  function batterieElectrique(genre, det, carac, pw) {
    const b = (det || {}).batteries || {};
    // « Batterie électrique 12,4 kW » lue comme puissance électrique : celle de la batterie, pas des ventilateurs
    if (genre === 'cta' && b.elec && Number.isFinite(det.PelBe) && Number.isFinite(pw.Pel) && Math.abs(pw.Pel - det.PelBe) <= 0.01 * det.PelBe) pw.Pel = NaN;
    if (genre !== 'cta' || !b.elec || b.chaude || b.co || !Number.isFinite(pw.P)) return;
    if (!Number.isFinite(det.PelBe)) det.PelBe = pw.P;
    pw.P = NaN;
  }

  // Alimentation d'un émetteur : par quel fluide il est alimenté (texte de l'article, chapitres) — eau (batterie à eau,
  // raccordé à la PAC), change-over, eau chaude, eau glacée ; ou électrique / solaire (ballon ECS autonome, CTA à batterie
  // électrique seule) : ceux-là ne sont pas des circuits de la production
  function alimentation(texte, genre) {
    // « Moteur EC » (à commutation électronique) : pas l'eau chaude (EC)
    const x = norm(texte).replace(/\b(?:moteurs?|ventilateurs?|technologie|ventilation|moto-?ventilateurs?)( a)? ec\b/g, ' ');
    const eau = /batteries? (?:a eau|hydrauliques?|eau chaude|eau glacee|chaude a eau|froide a eau|change.?over)|raccorde\w* (?:a|au|sur) (?:la |le |l'|une |un )?(?:pac|pompe a chaleur|chaudiere|groupe|reseau|production|sous.?station)|accessoires? hydrauliques?|vannes? (?:2|3|deux|trois) voies|serpentin|echangeur (?:a plaques )?primaire|circuit primaire/;
    if (genre === 'ecs') {
      if (/solaire/.test(x) && !/raccorde\w* (?:a|au|sur) (?:la |le |l'|une |un )?(?:pac|pompe a chaleur|chaudiere|reseau|production)/.test(x)) return 'solaire';
      if (eau.test(x)) return 'eau';
      return /electrique|thermodynamique|instantane|resistance|chauffe.?eau/.test(x) ? 'electrique' : '';
    }
    // Désenfumage, bouches : jamais raccordés à l'eau (le texte parle des locaux et des autres réseaux)
    if (['desenfumage', 'bouche-soufflage', 'bouche-extraction'].includes(genre)) return '';
    const fr = /eau glacee|\beg\b|batteries? froides?|\b[67] ?\/ ?1[12]\b|rafraichissement/.test(x), ch = /eau chaude(?! sanitaire)|\bec\b|batteries? chaudes?|\b(?:35|40|45|50|55|60|70|80|90) ?\/ ?\d{2} ?°?c/.test(x);
    if (/change.?over|eau chaude ?\/ ?eau glacee|chauffage ?\/ ?(?:climatisation|rafraichissement)|2 tubes reversible/.test(x) || (fr && ch)) return 'change-over';
    if (fr) return 'eau-glacee';
    if (ch) return 'chauffage';
    if (eau.test(x)) return 'eau';
    return genre === 'cta' && /batteries? electriques?|resistances? electriques?/.test(x) ? 'electrique' : '';
  }

  /* ---------- Réseaux (circuits hydrauliques, réseaux aérauliques) ---------- */
  // Un titre (chapitre du DPGF, article du CCTP) ou une ligne qui désigne un réseau : mot de réseau + nature reconnue
  const MOT_RESEAU = /\b(?:reseaux?|circuits?|distribution|departs?|antennes?|colonnes?|boucles?|bouclage|tuyauteries?|canalisations?|gaines?|conduits?|collecteurs?|nourrices?|alimentations? en eau|evacuations?|adduction)\b/;
  const NATURES = [
    // Plomberie et évacuations : reconnues pour ne pas être prises pour du chauffage, écartées des schémas CVC
    ['plomberie', 'Plomberie (eau froide, évacuations)', /eaux? (?:usees|vannes|pluviales)|evacuations?|\b(?:eu|ev|ep|eug|efa)\b|eau froide sanitaire|\bef\b|eau de ville|adduction|incendie|\bria\b|\bgaz\b|condensats? (?:cta|de|des|pvc|clim)|reseaux? condensats?/, false],
    ['captage', 'Eau de nappe / captage (primaire de la PAC)', /nappe|captage|forage|geotherm|sondes? geothermiques?/, true],
    ['ecs', 'Eau chaude sanitaire', /eau chaude sanitaire|\becs\b|bouclage|\bbecs\b|\bpremix\b/, true],
    ['desenfumage', 'Désenfumage', /desenfumage/, false],
    ['soufflage', 'Soufflage', /soufflage|insufflation|air traite|air souffle/, false],
    ['reprise', 'Reprise', /reprise|air repris/, false],
    ['extraction', 'Extraction', /extraction|\bvmc\b|air vicie/, false],
    ['air-neuf', 'Air neuf / rejet', /air neuf|prise d'air|rejet/, false],
    ['vapeur', 'Vapeur et condensats', /vapeur/, true],
    ['change-over', 'Eau chaude / eau glacée (change-over)', /change.?over|2 tubes reversibles?|reversible|chauffage ?\/ ?climatisation|eau chaude ?\/ ?eau glacee|chaud ?\/ ?froid/, true],
    ['eau-glacee', 'Eau glacée', /eau glacee|eau froide (?:de )?(?:climatisation|cta)|\beg\b|eau de refroidissement|\bfroid\b|rafraichissement|7 ?\/ ?12|6 ?\/ ?12/, true],
    ['chauffage', 'Chauffage (eau chaude)', /chauffage|\bec\b|eau chaude|radiateurs?|plancher chauffant|aerothermes?|ventilo|calorifique|\d{2} ?\/ ?\d{2} ?°?c/, true],
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
  // Ni une phrase du descriptif (« La nature des canalisations sera laissée au choix… »), ni un équipement (« Pompe de
  // bouclage »), ni un calorifuge (« Gaine souple isolante anti-condensation »)
  const PAS_RESEAU = /^(?:pompes?|circulateurs?|ballons?|vases?|centrales?|caissons?|extracteurs?|chaudieres?|groupes?|sieges?)\b|\b(?:sera|seront|devra|devront|doit|doivent)\b|^(?:calorifug\w*|isolation|isolants?|gaines? (?:souples? )?isolantes?|neutralisation|depose|rincage|desinfection)\b|anti-?condensation/;
  const estReseau = texte => { const x = norm(texte).replace(/^[\d.\s-]+/, ''); return x.length <= 100 && MOT_RESEAU.test(x.split(' ').slice(0, 6).join(' ')) && !!natureReseau(x) && !/^(?:essais?|calorifug|isolation|depose|mise en service|nettoyage)/.test(x) && !PAS_RESEAU.test(x) && !ACCESSOIRE.test(x) && !VARIANTE.test(x); };
  // Titre de chapitre de réseau : mot de réseau dans les premiers mots (« Distribution tuyauterie », « Réseau d'extraction »)
  const titreReseau = texte => { const x = norm(texte).replace(/^[\d.\s-]+/, ''); return MOT_RESEAU.test(x.split(' ').slice(0, 3).join(' ')) && !PAS_RESEAU.test(x) && !ACCESSOIRE.test(x) && !VARIANTE.test(x) && !/^(?:essais?|calorifug|isolation|depose)/.test(x); };
  const idReseau = nom => norm(nom).replace(/^[\d.\s-]+/, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
  // Longueur et diamètre des tuyauteries / gaines d'un réseau (lignes « ml » du DPGF)
  const estTube = (des, unite) => /^(?:ml|m)$/.test(unite) || /\b(?:tubes?|tuyau|tuyauteries?|canalisations?|gaines?|conduits?)\b/.test(norm(des));
  const dnDe = des => { const x = norm(des); const m = /\bdn ?(\d{2,3})\b/.exec(x) || /\b(\d{2,3}(?:[.,]\d)?) ?x ?\d(?:[.,]\d+)?\b/.exec(x) || /ø ?(\d{2,4})/.exec(String(des || '').toLowerCase()); return m ? nombre(m[1]) : NaN; };
  function nouveauReseau(nom, source, texte = '') {
    // La nature du titre prime (« Réseau d'extraction / rejet » dont le texte parle aussi de reprise)
    const nature = natureReseau(nom) || natureReseau(`${nom} ${texte}`);
    const r = { id: idReseau(nom), nom: String(nom).replace(/^[\d.\s-]+/, '').trim().slice(0, 80), nature, hydro: !!(NATURE[nature] || {}).hydro, regime: regime(`${nom} ${texte}`), L: 0, dnMax: NaN, sources: [source] };
    // Montage du circuit cité au titre ou au texte (injection, décharge, vanne 2 ou 3 voies…)
    const m = details(`${nom}. ${texte}`).montage; if (m) r.montage = m;
    return r;
  }
  // Rattachement d'un équipement à un réseau du CCTP : article parent (« 4.2 Réseau radiateurs » pour « 4.2.3 Radiateurs »)
  // Article parent (le plus proche) d'un numéro : « III.2 » pour « III.2.2 »
  const parentDe = (num, titres) => { const p = String(num).split('.'); for (let k = p.length - 1; k >= 1; k--) { const t = titres.get(p.slice(0, k).join('.')); if (t) return t; } return ''; };
  function reseauxCctp(analyse) {
    const tous = analyse.articlesDetail || analyse.articles || [], titres = new Map(tous.map(a => [a.num, a.titre]));
    // Même identifiant que le DPGF (« réseau @ chapitre ») : deux « Réseau de soufflage » de chapitres différents restent séparés
    // Nature lue au titre, sinon au texte quand il n'en cite qu'une (un texte qui parle de nappe et de distribution ne tranche pas)
    const natureSure = a => natureReseau(a.titre) || (() => { const x = norm(a.texte || ''), n = NATURES.filter(([, , re]) => re.test(x)); return n.length === 1 && !/primaire[^.]*secondaire|secondaire[^.]*primaire/.test(x) ? n[0][0] : ''; })();
    const enVariante = a => { const p = String(a.num).split('.'); for (let k = p.length - 1; k >= 1; k--) if (VARIANTE.test(norm(titres.get(p.slice(0, k).join('.')) || ''))) return true; return false; };
    return tous.filter(a => !a.general && titreReseau(a.titre) && natureSure(a) && !enVariante(a) && !/^(?:essais?|calorifug|isolation|depose|mise en service|nettoyage|rincage|desinfection|neutralisation)/.test(norm(a.titre))).map(a => {
      const r = { ...nouveauReseau(a.titre, `CCTP art. ${a.num}`, a.texte || ''), nature: natureSure(a) }, parent = parentDe(a.num, titres);
      r.hydro = !!(NATURE[r.nature] || {}).hydro;
      // Puissance du circuit citée dans l'article (« plancher chauffant … puissance 25 kW ») : à défaut de celle des émetteurs
      const pw = puissances(a.texte || ''), Pc = Number.isFinite(pw.Pch) ? pw.Pch : Number.isFinite(pw.P) ? pw.P : NaN;
      if (r.hydro && Pc > 0) r.P = Pc;
      // Chapitre de plomberie sanitaire : eau chaude = ECS, eau froide = plomberie, jamais du chauffage
      if (/plomberie|sanitaire/.test(norm((analyse.chapitres || {})[String(a.num).split('.')[0]] || ''))) { r.nature = natureSanitaire(a.titre, r.nature); r.hydro = !!(NATURE[r.nature] || {}).hydro; }
      return { ...r, id: parent ? `${r.id} @ ${idReseau(parent)}` : r.id, chapitre: parent ? String(parent).trim().slice(0, 80) : '', article: a.num };
    }).filter((r, _, l) => !l.some(z => z !== r && String(z.article).startsWith(`${r.article}.`))); // article qui regroupe d'autres réseaux : un chapitre
  }
  const reseauDeArticle = (num, reseaux) => reseaux.filter(r => r.article && (num === r.article || String(num).startsWith(`${r.article}.`))).sort((a, b) => b.article.length - a.article.length)[0] || null;

  /* ---------- CCTP ---------- */
  // equipements : résultat de CctpLecture.analyser(lignes).equipements
  // reseaux : reseauxCctp(analyse) (facultatif) — l'équipement prend le réseau de son article parent
  // articles : analyse.articles (facultatif) — variantes reconnues au titre du chapitre, sous-articles réunis à leur équipement
  const PAR_PREFIXE = { CTA: { categorie: 'emetteur', genre: 'cta' }, EXT: { categorie: 'auxiliaire', genre: 'ventilateur' }, VMC: { categorie: 'auxiliaire', genre: 'ventilateur' },
    SPL: { categorie: 'emetteur', genre: 'split' }, DSF: { categorie: 'auxiliaire', genre: 'desenfumage' }, GF: { categorie: 'producteur', genre: 'gf-air' }, CH: { categorie: 'producteur', genre: 'chaudiere-gaz' } };
  function depuisCctp(equipements, reseaux = [], articles = []) {
    const titres = new Map((articles || []).map(a => [a.num, a.titre]));
    const ancetres = num => { const p = String(num).split('.'), out = []; for (let k = p.length - 1; k >= 1; k--) { const t = titres.get(p.slice(0, k).join('.')); if (t) out.push(t); } return out; };
    // Texte des articles enfants (accessoires hydrauliques, régulation…) : dit comment l'équipement est alimenté
    const enfants = num => (articles || []).filter(a => String(a.num).startsWith(`${num}.`)).map(a => `${a.titre} ${a.texte || ''}`).join(' ');
    const out = [];
    // Genre de l'équipement lu ; aucun pour un titre de réseau ou un article d'accessoire ou de prestation
    const classerEq = x => {
      const c = (x.enumere && classer(x.nom || x.objet || '')) || classer(`${x.designation} ${x.caract || ''}`) || (x.objet ? classer(x.objet) : null) || PAR_PREFIXE[x.prefixe] || null;
      if (!c || (titreReseau(x.designation) && c.genre !== 'pompe')) return null;
      // Article d'un accessoire ou d'une prestation (« Batteries CTA », « Pièges à sons ») : pas l'équipement qu'il cite
      if (!x.enumere && !x.objet && (ACCESSOIRE.test(norm(x.designation)) || EXCLU.test(norm(x.designation))) && !/regulation|automate|gtb|gtc/.test(norm(x.designation))) return null;
      return c;
    };
    const genreDe = x => (classerEq(x) || {}).genre;
    const genres = (equipements || []).map(genreDe);
    // Plusieurs sous-articles du même genre (« Ballons à semi-accumulation », « Chauffe-eau de petite capacité » sous
    // « Production d'eau chaude sanitaire ») : des équipements distincts, pas le détail de l'article qui les regroupe ;
    // comptés par branche (« 6.3.1 », « 6.3.1.3 » et « 6.3.1.5 » détaillent un seul équipement)
    const sousArticles = (num, genre) => new Set((equipements || []).filter((y, k) => genres[k] === genre && !y.enumere && String(y.article).startsWith(`${num}.`)).map(y => String(y.article).slice(String(num).length + 1).split('.')[0])).size;
    (equipements || []).forEach(x => {
      // Réseau décrit (« Distribution ballon ECS jusqu'aux équipements ») : pas un équipement
      // Titre muet (« Compensation Cuisine », « Extraction hotte ») : le type lu par CctpLecture dans le texte
      // Titre général (« Émission de chauffage des locaux ») : l'équipement nommé au texte (« panneaux rayonnants »)
      // Équipement énuméré au texte : son nom seul (« Pompe double … — circuit alimentant les panneaux rayonnants » est une pompe)
      const c = classerEq(x);
      if (!c) return;
      // « Ventilation du local … » : un ventilateur seulement si le texte en décrit un (pas une ventilation naturelle par
      // grilles, une prestation hors lot ni un raccordement sur l'extracteur d'un autre article)
      if (c.genre === 'ventilateur' && /^ventilations? (?:du |des |de la )?(?:locale?s?|locaux)\b/.test(norm(x.designation))) {
        const tx = norm(x.texte || '').replace(/’/g, "'");
        if (!/extracteurs?|caissons?|ventilateurs?|tourelles?|\bvmc\b/.test(tx) || /ventilee?s? naturellement|ventilation naturelle|hors lot|raccorde\w* (?:sur|a|au) (?:l'|le |un )?extracteur/.test(tx)) return;
      }
      const texte = `${x.designation}. ${x.texte || x.caract || ''} ${x.prescrit || ''}`, r = reseauDeArticle(x.article, reseaux);
      const variante = /^(?:variantes?|options?|moins[- ]?values?|plus[- ]?values?|pse)\b/.test(norm(x.designation)) || ancetres(x.article).some(t => VARIANTE.test(norm(t)));
      const carac = caracteristiques(texte), pw = puissancesItem(carac, c.genre);
      const det = details(texte, x.designation);
      batterieElectrique(c.genre, det, carac, pw);
      // Équipement énuméré au texte : circuit nommé par la phrase qui l'annonce (« Le circuit alimentant les panneaux … »)
      if (x.circuit && c.genre === 'pompe') det.circuit = x.circuit;
      const e = { ...c, ...(x.enumere ? { enumere: true } : {}), designation: x.designation, qte: Math.max(1, nombre(x.quantite) || 1), ...pw, regime: regime(texte) || (r ? r.regime : ''), Q: Number.isFinite(carac.Q) ? carac.Q : NaN, repere: x.repere || '', prescrit: x.prescrit || '', carac, details: det, reseau: r ? r.id : '', sources: [`CCTP art. ${x.article}`], article: x.article, _texte: texte };
      if (det.local) e.local = det.local;
      // Colonne d'un tableau de caractéristiques : sa zone (« RDC Zone Sud »)
      if (x.zone) { e.zone = x.zone; if (!e.local) e.local = x.zone; }
      if (r && r.montage && !det.montage) det.montage = r.montage;
      if (x.quantiteLue && Number.isFinite(nombre(x.quantite))) e.qteCctp = nombre(x.quantite);
      if (variante) e.variante = true;
      const gros = c.categorie === 'producteur' || ['cta', 'ventilateur', 'desenfumage', 'ecs', 'split'].includes(c.genre);
      // Sous-article d'un gros équipement (« III.1.3.1 Centrale de traitement d'air » sous « III.1.3 CTA salle de
      // restauration ») : le même équipement, décrit plus en détail — prescription, puissances, débit et caractéristiques complétés
      const pere = gros && out.find(o => o.genre === c.genre && !!o.variante === !!e.variante && !e.repere && !o.enumere && !x.enumere && String(x.article).startsWith(`${o.article}.`) && sousArticles(o.article, c.genre) < 2);
      if (pere) {
        if (e.prescrit && !pere.prescrit.includes(e.prescrit)) pere.prescrit = [pere.prescrit, e.prescrit].filter(Boolean).join(' ; ');
        // Sous-article qui nomme l'équipement (« Centrale de ventilation double flux ») : ses valeurs priment sur celles du
        // texte général de l'article (« … soit 3900 m3/h d'air recyclé » d'une note de dimensionnement)
        const nomme = (classer(x.designation) || {}).genre === c.genre;
        ['P', 'Q', 'Pfr', 'Pel'].forEach(k => { if (Number.isFinite(e[k]) && (!Number.isFinite(pere[k]) || nomme)) pere[k] = e[k]; });
        Object.entries(carac).forEach(([k, v]) => { if (pere.carac[k] === undefined) pere.carac[k] = v; });
        Object.entries(det).forEach(([k, v]) => { if (pere.details[k] === undefined) pere.details[k] = v; });
        if (!pere.local && det.local) pere.local = det.local;
        pere.regime = pere.regime || e.regime;
        pere._texte += ` ${texte}`;
        pere.sources.push(...e.sources);
        return;
      }
      if (gros && !variante) e.principal = true;
      if (gros) { const ch = ancetres(x.article)[0]; if (ch) e.chapitre = String(ch).slice(0, 80); }
      out.push(e);
    });
    // L'article qui regroupe ces équipements distincts : un chapitre, pas un équipement de plus
    for (let k = out.length - 1; k >= 0; k--) { const o = out[k]; if (!o.repere && !o.enumere && !(o.qteCctp > 1) && sousArticles(o.article, o.genre) >= 2 && out.filter(e => e.genre === o.genre && String(e.article).startsWith(`${o.article}.`)).length >= 2) out.splice(k, 1); }
    // Article d'émetteurs ou d'auxiliaires détaillé par des sous-articles du même genre (« Ventilo-convecteurs » puis
    // « Ventilo-convecteur 2 tubes / 2 fils ») : les sous-articles sont les équipements, l'article leur laisse sa prescription
    for (let k = out.length - 1; k >= 0; k--) {
      const o = out[k], gros = o.categorie === 'producteur' || ['cta', 'ventilateur', 'desenfumage', 'ecs', 'split'].includes(o.genre);
      const fils = out.filter(e => e !== o && e.genre === o.genre && !!e.variante === !!o.variante && String(e.article).startsWith(`${o.article}.`));
      if (gros || o.repere || o.enumere || o.qteCctp > 1 || !fils.length) continue;
      fils.forEach(e => { if (!e.prescrit) e.prescrit = o.prescrit; if (!e.regime) e.regime = o.regime; if (!e.reseau) e.reseau = o.reseau; Object.entries(o.details || {}).forEach(([c, v]) => { if (e.details[c] === undefined) e.details[c] = v; }); });
      out.splice(k, 1);
    }
    out.forEach(e => {
      e.alim = alimentation(`${e._texte} ${enfants(e.article)} ${['ecs', 'split'].includes(e.genre) ? ancetres(e.article).join(' ') : ''}`, e.genre);
      // Émetteur électrique nommé au titre (« Aérotherme électrique : local … ») : pas un émetteur à eau
      if (['radiateurs', 'aerotherme', 'radiant'].includes(e.genre) && /electrique/.test(norm(e.designation)) && !/eau chaude|batterie a eau/.test(norm(e.designation))) { e.alim = 'electrique'; if (!Number.isFinite(e.Pel) && Number.isFinite(e.P)) { e.Pel = e.P; e.P = NaN; } }
      // Ballon électrique : la « puissance » citée est électrique
      if (e.genre === 'ecs' && e.alim === 'electrique' && !Number.isFinite(e.Pel) && Number.isFinite(e.carac.P)) { e.Pel = e.carac.P; e.P = NaN; }
    });
    // Articles de régulation (automate, GTB, supervision) sans équipement lu : la marque et le protocole servent à la régulation
    (articles || []).filter(a => !a.general && /regulation|automate|\bgtb\b|\bgtc\b|supervision/.test(norm(a.titre)) && !out.some(e => e.genre === 'regulation' && e.sources.includes(`CCTP art. ${a.num}`))).forEach(a => {
      const det = details(`${a.titre}. ${a.texte || ''}`, a.titre);
      if (!det.regulation) return;
      out.push({ categorie: 'auxiliaire', genre: 'regulation', designation: a.titre, qte: 1, P: NaN, Pfr: NaN, Pel: NaN, Q: NaN, regime: '', repere: '', prescrit: det.marque ? `marque ${det.marque}` : '', carac: {}, details: det, reseau: '', alim: '', sources: [`CCTP art. ${a.num}`], article: a.num, _texte: a.texte || '' });
    });
    // Intitulés identiques (« Centrale double flux » dans deux chapitres) : nommés par leur chapitre
    const doubles = out.filter(e => e.chapitre && out.some(o => o !== e && norm(o.designation) === norm(e.designation)));
    doubles.forEach(e => { e.designation = `${e.designation} — ${e.chapitre}`; });
    return out.map(({ article: _, _texte: __, enumere: ___, ...e }) => e);
  }

  /* ---------- DPGF ---------- */
  // Unité normalisée : « ens  », « Ens. », « ensemble » → ens ; « U » → u ; « ff », « forfait » → ft ; « PM » → pm
  const uniteDe = v => { const u = norm(v).replace(/\.$/, ''); return { ensemble: 'ens', ensembles: 'ens', ff: 'ft', forfait: 'ft', fft: 'ft', unite: 'u', 'u.': 'u', mètre: 'm', metre: 'm', 'm.l': 'ml', ml: 'ml' }[u] || u; };
  // Réseau d'un chapitre de plomberie sanitaire : eau chaude = ECS, eau froide = EF (plomberie), jamais du chauffage
  const natureSanitaire = (t, n) => { const x = norm(t); return /eau froide|\bef\b/.test(x) ? 'plomberie' : /eau chaude|\bec\b|\becs\b/.test(x) ? 'ecs' : n; };
  // Fluide d'un titre ou d'une ligne : EC = eau chaude de chauffage, EG = eau glacée (ECS : sanitaire, pas le chauffage)
  // Les deux cités (« production de chaud / froid ») : rien de tranché
  const fluideDe = t => { const x = norm(t), f = /\beg\b|eau glacee|eau froide de (?:climatisation|cta)|\bfroid\b|rafraichissement/.test(x), c = /\bec\b|chauffage|eau chaude(?! sanitaire)|\bchaud\b/.test(x) && !/\becs\b|sanitaire/.test(x); return f && !c ? 'froid' : c && !f ? 'chaud' : ''; };
  // Repère d'équipement cité (« Pompe double P2 », « Extracteur V1 », « [CTA 1] ») ; pas une référence (« type EX-04 »)
  const repereDe = t => { const m = /(?:^|[\s[(])(?<!type\s)(P|V|VE|VC|CTA|EXT|AT|PAC|TFP|GF|CH|BT|BTE|BTG|SPL|UE|UI|VMC|CE|CI)\s?-?(\d{1,3})\b(?!\s*(?:kw|w|m3|m³|l\b|mm|bar))/i.exec(String(t || '')); return m ? `${m[1].toUpperCase()}${/-/.test(m[0]) || /\s\d/.test(m[0].trim()) ? '-' : ''}${m[2]}` : ''; };
  const SYN = { designation: ['designation', 'libelle', 'description', 'designation des ouvrages', 'nature des ouvrages', 'ouvrages', 'intitule', 'prestations'], qte: ['quantite', 'qte', 'qt', 'q', 'quantites', 'quant', 'qtes', 'qte s', 'nombre', 'nb'], unite: ['u', 'unite', 'un', 'unit', 'unites'], num: ['n', 'no', 'num', 'numero', 'n prix', 'article', 'art', 'poste', 'code', 'ref', 'item', 'repere'], marque: ['marque', 'fabricant'] };
  // En-tête de désignation écrite autrement (« Désignation des travaux », « Quantitatif de référence », « Libellé des
  // prestations ») : reconnue aux mots qu'elle contient
  const DESIGNATION = /\b(?:designations?|libelles?|descriptions?|descriptif|ouvrages?|intitules?|prestations?|quantitatif|nature des travaux|travaux)\b/;
  const cle = v => norm(v).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Numéro écrit en tête de la désignation (pas de colonne de n°) : « III.1.1. Production », « III-02.2 - Centrale »,
  // « CHAPITRE IV - … », « I – 03.1 Branchement », « 4.3 Production » ; rendu sous la forme commune (« III.2.2 »)
  const NUM_TETE = /^\s*(chapitre\s+|article\s+)?((?:[IVX]{1,5}|\d{1,2})(?:\s?[.\-–]\s?\d{1,2}){0,4})(\s?[.\-–:)])?\s+(?=[A-Za-zÀ-ÿ'«"(])(.*)$/i;
  const numeroCanon = n => String(n || '').trim().replace(/\s*[.\-–—]\s*/g, '.').replace(/^\.+|\.+$/g, '').split('.').map(p => (/^\d+$/.test(p) ? String(+p) : p.toUpperCase())).join('.');
  function numeroEnTete(des) {
    const m = NUM_TETE.exec(String(des || ''));
    if (!m) return null;
    const parties = numeroCanon(m[2]).split('.'), romain = /^[IVX]+$/i.test(parties[0]);
    // Un nombre seul (« 1 pompe », « 2 fils ») n'est pas un numéro ; un chiffre romain seul l'est s'il est suivi d'un point ou
    // d'un tiret (« IV. PLOMBERIE ») ; le titre commence par une majuscule
    if (!m[1] && parties.length < 2 && !(romain && m[3])) return null;
    if (!m[1] && !/^[A-ZÀ-Ý'«"(]/.test(m[4])) return null;
    if (romain && !/^[IVX]+$/.test(parties[0])) return null; // romain en majuscules seulement (« vi » est un mot)
    return { num: parties.join('.'), reste: m[4].replace(/^[-–:\s]+/, '').trim() };
  }
  // Puces en tête d'une désignation (« * Fourniture … », « - débit 60 m3/h », « • … », « '- Ø 100 »)
  const PUCE = /^\s*'?\s*(?:[*•▪●➢]|[-–](?!\d))\s*/;
  // Ligne de caractéristique d'un ouvrage écrit sur plusieurs lignes (« Puissance = 600 W », « Débit 9 m3/h », « Tension
  // = Mono 230 V », « De fabrication … », « Type … ») : suite de la désignation, pas un nouvel ouvrage
  const CARAC_LIGNE = /^(?:puissances?\b|p ?calo|p ?(?:abs|elec)|debits?\b|pressions?\b|hmt\b|hauteur\b|tension\b|intensite\b|capacite\b|volume\b|contenance\b|regime\b|rendement\b|batteries?\b|types?\b|marques?\b|de (?:marque|fabrication)\b|fabrication\b|modeles?\b|references?\b|ou (?:techniquement |strictement )?equivalent|equivalent\b|avec\b|y compris\b|compris\b|dim(?:ensions?)?\b|niveau\b|cop\b|scop\b|eer\b|seer\b|fluide\b)|^[a-z ]{2,30}\s*[=:]\s*\d/;
  // Colonne de désignation : celle de l'en-tête, ou sa voisine qui porte le plus de textes (en-tête décalé d'une colonne,
  // cellules fusionnées)
  function colonneDesignation(rows, entete, map) {
    const pris = new Set([map.qte, map.unite, map.num].filter(v => v !== undefined));
    const textes = j => rows.slice(entete + 1, entete + 400).filter(r => { const v = (r || [])[j]; return typeof v === 'string' && /[a-zà-ÿ]{3}/i.test(v); }).length;
    let best = map.designation, n = textes(best);
    [map.designation - 2, map.designation - 1, map.designation + 1].filter(j => j >= 0 && !pris.has(j)).forEach(j => { const k = textes(j); if (k > n * 1.5 + 2) { best = j; n = k; } });
    return best;
  }
  // Lignes d'une feuille (tableau de tableaux) : en-tête reconnue, puis ouvrages (désignation et quantité)
  function depuisDpgf(rows) {
    let entete = -1, map = {};
    for (let i = 0; i < Math.min(40, rows.length) && entete < 0; i++) {
      const m = {};
      (rows[i] || []).forEach((c, j) => { const k = cle(c); Object.entries(SYN).forEach(([f, syn]) => { if (m[f] === undefined && syn.includes(k)) m[f] = j; }); });
      // Désignation reconnue à ses mots, quantité à son abréviation (« Qtés », « Q »), cellules courtes seulement
      if (m.designation === undefined) (rows[i] || []).forEach((c, j) => { const k = cle(c); if (m.designation === undefined && k.length < 40 && DESIGNATION.test(k) && j !== m.qte) m.designation = j; });
      if (m.designation !== undefined && m.qte !== undefined) { entete = i; map = m; }
    }
    if (entete < 0) return { items: [], erreur: 'En-tête du DPGF non reconnue (colonnes « Désignation » et « Quantité »).' };
    map.designation = colonneDesignation(rows, entete, map);
    const items = [], reseaux = new Map();
    // Contextes ouverts par les titres de chapitres (lignes sans quantité), refermés par un titre de même niveau ou plus haut :
    // réseau en cours, variante / option / moins-value, chapitre d'un gros équipement (« Pompe à chaleur eau / eau »)
    let ctx = null, ctxVar = null, ctxEq = null, derniere = null;
    const titres = {}; // titre du chapitre par niveau : nomme les réseaux de même intitulé dans des chapitres différents
    // Niveau d'un n° : nombre de parties (« III.1.1 » : 3, « 4.3 » : 2)
    const profondeur = n => (String(n || '').trim() ? String(n).split('.').filter(Boolean).length : 0);
    const sanitaire = () => Object.values(titres).some(t => /plomberie|sanitaire/.test(norm(t)));
    // Un même intitulé (« Réseau de soufflage / air neuf ») dans deux chapitres = deux réseaux, nommés par leur chapitre
    const ajouterReseau = (nom, num) => {
      const p = profondeur(num), parent = num && p > 1 ? String(titres[p - 1] || '').replace(/^[\d.\s-]+/, '').trim() : '', id = `${idReseau(nom)}${parent ? ` @ ${idReseau(parent)}` : ''}`;
      const r = reseaux.get(id) || { ...nouveauReseau(nom, `DPGF${num ? ` ${num}` : ''}`), id, chapEq: ctxEq ? ctxEq.titre : '', chapitre: parent,
        contexte: [...Object.keys(titres).sort((a, b) => a - b).map(k => titres[k]), sousTitre].filter(t => t && t !== nom).join(' ').slice(0, 200) };
      if (sanitaire() && !reseaux.has(id)) { r.nature = natureSanitaire(nom, r.nature); r.hydro = !!(NATURE[r.nature] || {}).hydro; }
      // Circuit sans nature (« Circuit n°1 Salle … ») sous un chapitre de chauffage ou d'eau glacée : de ce fluide
      if (!reseaux.has(id) && !r.nature && /^(?:circuits?|departs?|boucles?|distribution)\b/.test(norm(nom)) && !/\btubes?\b|acier|cuivre|pehd|multicouche|calorifug|tel que decrit/.test(norm(nom))) {
        const fl = Object.keys(titres).sort((a, b) => b - a).map(k => fluideDe(titres[k])).find(Boolean);
        if (fl) { r.nature = fl === 'froid' ? 'eau-glacee' : 'chauffage'; r.hydro = true; }
      }
      reseaux.set(id, r); return r;
    };
    const GROS = ['producteur'], GROS_GENRES = ['cta', 'ventilateur', 'ecs', 'split', 'desenfumage'];
    const lignes = rows.slice(entete + 1), numCol = r => (map.num !== undefined ? String((r || [])[map.num] ?? '').trim() : '');
    // Pas de colonne de n° (ou vide) : n° écrits en tête des titres (« III.1.1. Production de chauffage »)
    const enTete = lignes.filter(r => numCol(r)).length < 3 && lignes.filter(r => numeroEnTete((r || [])[map.designation])).length >= 2;
    const numDe = r => (enTete ? ((numeroEnTete((r || [])[map.designation]) || {}).num || '') : numCol(r));
    // Format « n° d'article sur les titres seulement » (« 4-3-1 ») : les ouvrages chiffrés n'ont pas de n° ; une désignation
    // peut tenir sur plusieurs lignes (ligne sans quantité puis ligne chiffrée) ou porter des variantes (« Taille 200 »)
    const chiffrees = lignes.filter(r => nombre((r || [])[map.qte]) > 0);
    const sansNum = (map.num !== undefined || enTete) && chiffrees.filter(r => !numDe(r)).length > chiffrees.filter(r => numDe(r)).length;
    let attente = null, sousTitre = '', numCourant = '', fin = false, depose = false;
    const DEPOSE = /^(?:depose|neutralisation|demontage|evacuation des? (?:equipements?|appareils?|materiels?))/;
    const libellesCircuits = {};
    lignes.forEach(r => {
      if (fin) return;
      let des = String((r || [])[map.designation] ?? '').trim();
      const q = nombre((r || [])[map.qte]), unite = uniteDe((r || [])[map.unite]);
      // N° à tirets (« 4-3-1 ») : écrit à points, comme les articles du CCTP ; n° en tête de la désignation retiré du titre
      const nt = enTete ? numeroEnTete(des) : null;
      const num = nt ? nt.num : numDe(r).replace(/^(\d+(?:\s*-\s*\d+)+)\.?$/, n => n.replace(/\s*-\s*/g, '.'));
      if (nt) des = nt.reste;
      // Puce : « - débit 60 m3/h » détaille l'ouvrage annoncé au-dessus (« * Bouches de soufflage … »)
      const puce = PUCE.test(des), tiret = /^\s*'?\s*[-–](?!\d)/.test(des);
      des = des.replace(PUCE, '').trim();
      if (!des) return;
      let x = norm(des);
      // Totaux et sous-totaux (« 4-3-1 TFP - Total €HT ») : ni ouvrage ni titre ; le récapitulatif final répète les chapitres
      if (!(q > 0) && /\btotal\b|sous-?total|\breport\b|montant (?:total|ht|ttc)|^t\.?v\.?a\.?\b|net a payer/.test(x)) return;
      if (/^r[eé]capitulati(?:f|on)|^recap\b/.test(x) && items.length) { fin = true; return; }
      const prof = profondeur(num);
      if (num) { numCourant = num; sousTitre = ''; }
      if (sansNum && !num && !(q > 0) && !/^(?:ml|m|u|ens|ft)$/.test(unite) && !titreReseau(des) && !estReseau(des) && !VARIANTE.test(x)) {
        // Désignation sans quantité : début d'un ouvrage sur plusieurs lignes, ou parent de variantes (« … : ») ; celle
        // qui précède, restée seule, était un sous-titre (« Ballon tampon primaire EG »)
        // Suite : minuscule après une ligne non terminée, ou ligne de caractéristique (« Puissance = 600 W »)
        // ou remarque (« Point à valider avant toute commande. ») au milieu de la description d'un équipement
        if (attente && !attente.utilise && ((/^[a-zà-ÿ(-]/.test(des) && !/[.:]\s*$/.test(attente.brut)) || CARAC_LIGNE.test(x) || (/^[A-Z][A-Z&'.-]{2,}\s/.test(des) && /[a-zà-ÿ]{3}/.test(des) && attente.texte.length < 80)
          || (/\.\s*$/.test(des) && attente.suites > 0 && !classer(des) && classer(attente.texte)))) {
          attente.brut = des; attente.texte = `${attente.texte} ${des.replace(/\s*:\s*$/, '')}`; attente.parent = attente.parent || /:\s*$/.test(des) || /tel que decrit|comprenant|ci-?dessous/.test(x); attente.suites = (attente.suites || 0) + 1;
          return;
        }
        if (attente && !attente.utilise) sousTitre = attente.texte;
        depose = DEPOSE.test(x);
        attente = { brut: des, texte: des.replace(/\s*:\s*$/, ''), parent: /:\s*$/.test(des) || /tel que decrit|suivant (?:le )?descriptif|comprenant|ci-?dessous|suivants?\s*$/.test(x), utilise: false };
        return;
      }
      let cParent = null, enfant = false;
      if (sansNum && !num && attente && q > 0) {
        const t = des.replace(/^[-–•\s]+/, ''), cl = classer(t), ca = classer(attente.texte);
        // Déclinaison du parent (taille, diamètre, débit, ligne à tiret sous « * … ») ; dernière ligne de caractéristiques
        // (« Pression = 2,0 mCE | U | 1 ») : l'ouvrage du parent
        const variante = /^(?:tailles?|types?\b|t\s?\d|dn\s?\d|ø|diam|mod[eè]les?\b|l\s?\d|ht\s?\d|dim\b|puissance\s?\d|debit\s?(?:de\s?)?\d|\d)/i.test(t) || (tiret && !cl);
        // Fin d'un ouvrage écrit sur plusieurs lignes : suite en minuscule d'une ligne non terminée (« des aérochauffeurs et
        // coffret ») ou dernière caractéristique (« Pcalo : 60 kW, y compris … ») ; « … composition suivant CCTP » aussi
        const suiteMin = /^[a-zà-ÿ]/.test(t) && !/[.:;]\s*$/.test(attente.brut) && !attente.parent;
        const fin = CARAC_LIGNE.test(norm(t)) || (attente.suites > 0 && /\bcomposition\b|suivant (?:le )?cctp|tel(?:le)?s? que decrit/.test(norm(t)));
        // Après les déclinaisons d'un ouvrage (« Type … 300W », « Type … 500W »), une ligne qui n'en est pas une
        // (« Flexibles d'alimentation suivant CCTP ») est un ouvrage à part
        const autre = attente.utilise && !attente.parent && !variante && !suiteMin && !CARAC_LIGNE.test(norm(t));
        if (autre) attente = null;
        else if (variante || !cl || suiteMin || fin) {
          // Suite de la désignation en minuscule (« accessoires tel que décrit | ens | 1 » sous « Ballon tampon type … avec tous ses ») :
          // c'est l'ouvrage du parent, pas un accessoire ni une prestation
          const suite = !variante && /^[a-zà-ÿ]/.test(t) && !attente.parent;
          const prest = !suite && !fin && (EXCLU.test(norm(t)) || ACCESSOIRE.test(norm(t)) || REGUL_PREST.test(norm(t)));
          // Genre du chapitre (« Thermofrigopompe » + « Taille 200 ») ; pas pour la robinetterie, les tubes, les raccords d'un
          // chapitre de réseau sanitaire (« Eau chaude sanitaire » n'est pas un ballon)
          const chap = (() => {
            if (/robinet|vannes?|purge|tubes?|gaines?|raccords?|siphons?|rebouchage|percements?|sujetions?|colliers?|calorifug/.test(norm(attente.texte))) return null;
            const k = Object.keys(titres).sort((a, b) => b - a)[0], cc = k ? classer(titres[k]) : null;
            if (cc && cc.genre === 'ecs' && !/ballon|preparateur|chauffe|cumulus/.test(norm(titres[k]))) return null;
            return cc && (cc.categorie === 'producteur' || GROS_GENRES.includes(cc.genre)) ? cc : null;
          })();
          des = `${attente.texte} ${t}`; x = norm(des); cParent = prest ? classer(t) : ca || chap; enfant = true; attente.utilise = true;
          if (!attente.parent && !variante) attente = null;
        } else {
          // Ouvrage complet à lui seul : la désignation en attente était un sous-titre (« Ballon tampon primaire EC »)
          if (!attente.utilise) sousTitre = attente.texte;
          attente = null;
        }
      } else if (num || !(q > 0)) attente = null;
      if (!(q > 0) && !/^(?:ml|m|u|ens|ft)$/.test(unite)) {
        // Ligne sans n° en minuscule (« en gaine circulaire galva … ») : suite du titre précédent, pas un nouveau titre
        if (!num && /^[a-zà-ÿ]/.test(des)) return;
        if (num) { depose = DEPOSE.test(x); titres[prof] = des; Object.keys(titres).forEach(k => { if (+k > prof) delete titres[k]; }); }
        derniere = null;
        const ferme = c => c && (num ? prof <= c.prof : true);
        if (ferme(ctxVar)) ctxVar = null;
        if (VARIANTE.test(x)) { ctxVar = { prof: num ? prof : 99 }; return; }
        if (ctxEq && (num ? prof <= ctxEq.prof : false)) ctxEq = null;
        const ce = classer(des);
        if (ce && (GROS.includes(ce.categorie) || GROS_GENRES.includes(ce.genre)) && !ctxEq) ctxEq = { titre: des.replace(/\s*:\s*$/, ''), prof: num ? prof : 99, genre: ce.genre };
        // Titre de réseau : ouvre un contexte (sa nature pourra venir de ses lignes) ; un sous-titre de même famille le garde
        if (titreReseau(des) || estReseau(des)) {
          // « Départ / retour en ø76,1 » sous « Circuit n°1 … » : la tuyauterie du circuit, pas un autre réseau
          const sous = ctx && ((num && prof > ctx.prof && (!natureReseau(des) || natureReseau(des) === reseaux.get(ctx.id).nature)) || (!num && !natureReseau(des) && /\bdeparts?\s*\/\s*retours?\b|ø|\bdn\s?\d/.test(x)));
          if (!sous) { const res = ajouterReseau(des, num); ctx = { id: res.id, prof: num ? prof : 99 }; }
        } else if (ctx && (num ? prof <= ctx.prof : !/robinetterie|tuyauterie|accessoires?|calorifug|emetteurs?|equipements?|appareillage|regulation|supportage|collecteurs?|antennes?/.test(x))) ctx = null;
        return;
      }
      if (!(q > 0) && !VARIANTE.test(x)) return;
      const variante = !!ctxVar || VARIANTE.test(x), res = ctx ? reseaux.get(ctx.id) : null;
      // Tuyauteries et gaines (au mètre) : jamais un équipement ; longueur et plus gros diamètre du réseau en cours,
      // rangées dans un sous-réseau quand leur nature diffère (primaire nappe / secondaire chauffage dans un même chapitre)
      if (/^(?:ml|m)$/.test(unite)) {
        if (variante) return;
        let cible = res || (estReseau(des) || titreReseau(des) ? ajouterReseau(des, num) : null);
        const nl = sanitaire() ? natureSanitaire(des, natureReseau(des)) : natureReseau(des), hydroL = !!(NATURE[nl] || {}).hydro;
        // Chapitre « Distribution tuyauterie » sans nature : chaque nature de ligne va au réseau de même nature du même
        // gros équipement (circuit de pompe déjà vu), sinon à un sous-réseau ; les réseaux d'air ne se découpent pas
        // Ligne sans nature dans un chapitre découpé : avec la précédente (« Circuit primaire : de l'échangeur à la PAC »)
        if (cible && !nl && !cible.nature && derniere) cible = derniere;
        if (cible && nl && nl !== cible.nature && (hydroL || !cible.nature) && (cible.hydro || !cible.nature)) {
          const voisin = [...reseaux.values()].find(z => z !== cible && z.nature === nl && z.chapEq && z.chapEq === cible.chapEq);
          if (voisin) cible = voisin;
          else if (!cible.nature && !cible.L && !items.some(y => y.reseau === cible.id)) Object.assign(cible, { nature: nl, hydro: hydroL });
          else { const id = `${cible.id} ${nl}`; if (!reseaux.has(id)) reseaux.set(id, { ...nouveauReseau(`${cible.nom} — ${(NATURE[nl] || {}).libelle || nl}`, cible.sources[0]), id, nature: nl, hydro: hydroL, chapEq: cible.chapEq }); cible = reseaux.get(id); }
        }
        if (cible && cible !== res) derniere = cible;
        if (cible && /^(?:ml|m)$/.test(unite)) { cible.L += q; const dn = dnDe(des); if (Number.isFinite(dn) && !(cible.dnMax >= dn)) cible.dnMax = dn; }
        return;
      }
      // Variante ou suite d'une désignation : le genre de son parent (« Vanne d'isolement » + « DN 50 (CTA) » reste une vanne)
      let c = enfant ? cParent : classer(des);
      // Cassette, console, gainable d'un chapitre de détente directe (VRF, DRV, groupe de condensation) : unité intérieure
      if (c && c.genre === 'ventilo' && /\b(?:vrf|vrv|drv)\b|detente directe|refrigerant variable|splits?\b|groupes? de condensation/.test(norm(Object.values(titres).join(' ')))) c = { categorie: 'emetteur', genre: 'split' };
      // Bouche, grille ou diffuseur linéaire : sa propre mention (« soufflage », « reprise ») d'abord, sinon son réseau
      if ((!c || /^bouche/.test(c.genre)) && res && !res.hydro && /bouches?|grilles?|diffuseurs?|anemostats?|buses?|tron[cç]ons? de soufflage/.test(x)) {
        const n = /soufflage|insufflation/.test(x) ? 'soufflage' : /reprise|extraction/.test(x) ? 'reprise' : res.nature;
        c = n === 'soufflage' ? { categorie: 'emetteur', genre: 'bouche-soufflage' } : ['reprise', 'extraction'].includes(n) ? { categorie: 'emetteur', genre: 'bouche-extraction' } : c;
      }
      // Bouche, grille ou diffuseur hors d'un réseau d'air reconnu (ou pris pour de la régulation : « … registre de
      // régulation ») : soufflage ou reprise d'après sa ligne ou le sous-titre au-dessus (« Soufflage », « Reprise »)
      if ((!c || c.genre === 'regulation') && /^(?:bouches?|grilles?|diffuseurs?|anemostats?)\b/.test(x) && !/coupe-?feu|pare-?pluie|prise d'air|rejet|exterieure?s?\b|ventilo/.test(x)) {
        const sens = `${x} ${norm(sousTitre)}`;
        if (/reprise|extraction|transfert/.test(sens)) c = { categorie: 'emetteur', genre: 'bouche-extraction' };
        else if (/soufflage|insufflation|diffusion/.test(sens) || c) c = { categorie: 'emetteur', genre: 'bouche-soufflage' };
      }
      // Ligne « Réseau … » chiffrée au forfait : le réseau lui-même
      if (!c && !variante && /^(?:ens|ft|forfait)$/.test(unite) && titreReseau(des) && natureReseau(des)) { ajouterReseau(des, num); return; }
      // Libellé de circuit d'une vanne ou d'un accessoire (« DN 50 (CTA / ventilo EC) ») : nomme les circuits secondaires
      const lc = /\(([^()]*?(?:\bEC\b|\bEG\b|chauffage|eau glac[ée]e|radiateurs?|ventilo|CTA|plancher|ECS)[^()]*)\)/i.exec(des);
      if (lc && c && c.genre !== 'pompe' || lc && !c) { const k = numCourant || '-', lib = lc[1].replace(/\s+/g, ' ').trim(); const l = (libellesCircuits[k] = libellesCircuits[k] || []); if (!l.some(y => motsDe(y) === motsDe(lib))) l.push(lib); }
      if (!c) return;
      // Dépose, neutralisation de l'existant (« * Dépose et évacuation : » puis « - ballon ECS électrique ») : pas un équipement
      if (depose) return;
      // Gros équipement : la désignation du chapitre est souvent plus parlante (« Pompe à chaleur EAU / EAU R454B »)
      const gros = GROS.includes(c.categorie) || GROS_GENRES.includes(c.genre);
      const marque0 = /\bde marque\s+(?!ou\b)([A-Za-z0-9][\w&'-]*(?:\s(?!ou\b)[A-Z0-9][\w&'-]*)?)/i.exec(des), marque = marque0 && !/^(?:marque|ou)$/i.test(marque0[1]) ? marque0 : null, marqueCol = map.marque !== undefined ? String((r || [])[map.marque] ?? '').trim() : '';
      // « Fourniture et pose … » sans détail chiffré : l'intitulé du chapitre est plus parlant ; avec (« … capacité 15 litres ») : la ligne
      const libelle = gros && ctxEq && /^fourniture/.test(x) && !/\d/.test(x) ? `${ctxEq.titre}${marque ? ` (marque ${marque[1]})` : ''}` : des.replace(/\s*:\s*$/, '');
      const carac = caracteristiques(des), chapitres = [...Object.keys(titres).sort((a, b) => a - b).map(k => titres[k]), sousTitre].filter(Boolean).join(' '), contexte = `${chapitres} ${des}`;
      // Détails de la ligne, complétés par ceux de ses chapitres (« Circuit plancher en injection ») sans en prendre le rôle
      // (montage, découplage, sous-station ; la récupération d'un chapitre « thermofrigopompe » pour la production seulement)
      const dc = details(chapitres), garde = ['montage', 'decouplage', 'sousStation', 'regimePrim', ...(c.categorie === 'producteur' ? ['recup'] : [])];
      const det = { ...Object.fromEntries(Object.entries(dc).filter(([k]) => garde.includes(k))), ...details(des, des) };
      if (c.categorie !== 'producteur') delete det.role;
      if (res && res.montage && !det.montage) det.montage = res.montage;
      // Fluide du chapitre le plus proche (« Ballon tampon primaire EG » : froid ; « … EC » : chauffage)
      const fl = [sousTitre, ...Object.keys(titres).sort((a, b) => b - a).map(k => titres[k]), des].map(fluideDe).find(Boolean) || (c.genre === 'tampon' ? (/froid|glace/.test(x) ? 'froid' : /chaud|chauffage/.test(x) ? 'chaud' : '') : '');
      if (fl) det.fluide = fl;
      // Pompe du primaire (production → ballon, collecteur) : pas une pompe de circuit ; ballon tampon du primaire ou à
      // 4 piquages, entre production et départs : découplage
      const cx = norm(`${chapitres} ${des}`);
      if (c.genre === 'pompe' && /primaire/.test(cx) && !/secondaire/.test(cx)) det.primaire = true;
      if (c.genre === 'pompe' && /plomberie|sanitaire|eaux? (?:de )?pluie|pluviales?|surpress|relevage|eaux? usees|arrosage|incendie/.test(cx)) det.sanitaire = true;
      if (c.genre === 'tampon' && (/4 piquages/.test(x) || /primaire/.test(cx))) det.ballon = 'decouplage';
      // Pompe sous un titre « Circuit primaire » : du primaire ; sous « Circuit n°1 Salle … » : le circuit qu'elle dessert
      if (c.genre === 'pompe' && res && /\bprimaire\b/.test(norm(res.nom)) && !/secondaire/.test(norm(res.nom))) det.primaire = true;
      if (c.genre === 'pompe' && res && /^circuits?\b/.test(norm(res.nom)) && !det.primaire && !det.circuit) det.circuit = res.nom;
      // Repère cité dans la ligne (« Pompe double P2 », « Extracteur V1 ») ou dans le titre du chapitre (« [CTA 1] »)
      const rp = repereDe(des) || (ctxEq && gros && ctxEq.genre === c.genre ? repereDe(ctxEq.titre) : '');
      // Émetteur électrique (« Radiateur … électrique 1000W », « aérotherme électrique ») : pas un émetteur à eau
      const elecSeul = ['radiateurs', 'aerotherme', 'radiant'].includes(c.genre) && /electrique/.test(norm(des)) && !/eau chaude|batterie a eau/.test(norm(des));
      const pw = puissancesItem(carac, c.genre);
      batterieElectrique(c.genre, det, carac, pw);
      if (elecSeul && !Number.isFinite(pw.Pel)) { pw.Pel = Number.isFinite(pw.P) ? pw.P : NaN; pw.P = NaN; }
      items.push({ ...c, designation: libelle, qte: q, unite, ...pw, carac, alim: elecSeul ? 'electrique' : alimentation(contexte, c.genre), regime: regime(des) || (res ? res.regime : ''), Q: Number.isFinite(carac.Q) ? carac.Q : NaN, repere: rp, prescrit: [marque ? `marque ${marque[1]}` : '', marqueCol && !(marque && norm(marqueCol) === norm(marque[1])) ? `marque prévue au DPGF : ${marqueCol}` : ''].filter(Boolean).join(', '), reseau: res && !variante ? res.id : '',
        chapitre: ctxEq && gros ? ctxEq.titre : '', principal: gros && !variante, ...(variante ? { variante: true } : {}), sources: [`DPGF${num || (sansNum && numCourant) ? ` ${num || numCourant}` : ''}`],
        details: det, chapitreDpgf: chapitres.slice(0, 160), _chap: numCourant || '-', ...(det.local ? { local: det.local } : {}) });
    });
    // Réseaux vides (titres seuls, sans tuyauterie ni équipement) ou sans nature : écartés
    [...reseaux.values()].filter(r => (!r.nature || !r.L) && !items.some(x => x.reseau === r.id)).forEach(r => reseaux.delete(r.id));
    // Pompes d'un chapitre (« Pompes et vannes circuits secondaires ») : autant que de libellés de circuits des vannes du même
    // chapitre → chaque pompe prend le sien, dans l'ordre (à vérifier)
    const pompesCh = k => items.filter(x => x.genre === 'pompe' && x._chap === k && !x.details.primaire && !x.details.sanitaire);
    [...new Set(items.filter(x => x.genre === 'pompe').map(x => x._chap))].forEach(k => {
      const p = pompesCh(k);
      if (!p.length) return;
      // Libellés du chapitre, sinon des chapitres frères (« 5.5.1 Pompes », « 5.5.2 Vannes »), sans doublon
      let l = libellesCircuits[k] || [];
      if (l.length !== p.length && k.includes('.')) { const par = k.split('.').slice(0, -1).join('.'); l = []; Object.entries(libellesCircuits).filter(([kk]) => kk === par || kk.startsWith(`${par}.`)).forEach(([, ll]) => ll.forEach(y => { if (!l.some(z => motsDe(z) === motsDe(y))) l.push(y); })); }
      // Plusieurs groupes de vannes (isolement, équilibrage, puis 3 voies…) : le premier groupe nomme les circuits dans l'ordre
      if (l.length > p.length && (libellesCircuits[k] || []).length >= p.length) l = (libellesCircuits[k] || []).slice(0, p.length);
      if (p.length === l.length) p.forEach((x, i) => { x.details.circuit = l[i]; });
    });
    items.forEach(x => { delete x._chap; });
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

  // Classeur entier : DPGF découpé en feuilles (par zone, tranche ferme / conditionnelle, PSE) ; page de garde et
  // récapitulatif écartés. Une seule feuille d'ouvrages : celle-là ; plusieurs : leurs ouvrages réunis, chacun avec sa zone
  // (nom de la feuille), ceux d'une feuille de variantes ou de PSE non retenus par défaut
  const FEUILLE_HORS = /r[ée]cap|page de garde|^\s*pdg\s*$|sommaire|^\s*garde\s*$/i;
  const FEUILLE_VARIANTE = /\b(?:pse|variantes?|options?|moins[- ]?values?)\b/i;
  function depuisFeuilles(feuilles) {
    const lues = (feuilles || []).map(f => ({ nom: String(f.name || '').trim(), r: depuisDpgf(f.rows || []) }));
    const utiles = lues.filter(l => l.r.items.length && !FEUILLE_HORS.test(l.nom));
    if (utiles.length <= 1) return (utiles[0] || lues.slice().sort((a, b) => b.r.items.length - a.r.items.length)[0] || { r: { items: [], erreur: 'aucune feuille lisible' } }).r;
    const items = [], reseaux = new Map();
    utiles.forEach(({ nom, r }) => {
      const variante = FEUILLE_VARIANTE.test(nom);
      r.items.forEach(x => items.push({ ...x, designation: `${x.designation} (${nom})`, zone: nom, chapitreDpgf: `${nom} ${x.chapitreDpgf || ''}`.trim(), ...(variante ? { variante: true, principal: false, reseau: '' } : {}) }));
      if (!variante) r.reseaux.forEach(z => { const e = reseaux.get(z.id); if (e) { e.L = Math.round((e.L + z.L) * 10) / 10; if (!(e.dnMax >= z.dnMax)) e.dnMax = z.dnMax; } else reseaux.set(z.id, { ...z }); });
    });
    return { items, reseaux: [...reseaux.values()], feuilles: utiles.map(l => l.nom) };
  }

  /* ---------- Rapprochement CCTP / DPGF ---------- */
  const mots = t => new Set(norm(t).split(/[^a-z0-9]+/).filter(m => m.length >= 3));
  const ressemblance = (a, b) => { const x = mots(a), y = mots(b); if (!x.size || !y.size) return 0; let n = 0; x.forEach(m => { if (y.has(m)) n++; }); return n / Math.min(x.size, y.size); };
  // Numéro d'article (CCTP) ou code de ligne (DPGF) : « III.1.3 », « III.1.3.5.34 »
  const codeDe = x => { const m = (x.sources || []).map(t => /^(?:CCTP art\.|DPGF) (\S+)/.exec(t)).find(Boolean); return m ? m[1] : ''; };
  const sousCode = (a, b) => !!a && !!b && (b === a || b.startsWith(`${a}.`));
  // Caractéristiques d'un article valables pour chacune des lignes qui le détaillent (pas les puissances ni les débits)
  const communs = c => Object.fromEntries(Object.entries(c || {}).filter(([k]) => ['regimeChaud', 'regimeFroid', 'frigorigene', 'tension', 'filtres'].includes(k)));
  function fusionner(cctp, dpgf) {
    const out = cctp.map((x, i) => ({ id: `c${i}`, ...x }));
    // Provenance de chaque équipement : article du CCTP, lignes du DPGF, façon dont ils ont été rapprochés
    const orig = new Map(out.map((o, i) => [o, { c: cctp[i], d: [], lien: '' }]));
    const lier = (o, d, lien, c) => { const p = orig.get(o) || { c: c || null, d: [], lien: '' }; if (d) p.d.push(d); if (lien) p.lien = lien; orig.set(o, p); return o; };
    const garder = (a, b) => (Number.isFinite(a) ? a : b);
    // Batteries nommées par les deux documents, l'un en citant plus (« eau glacée » / « eau chaude + eau glacée ») : toutes
    const unionBatteries = (dc, dd) => { const a = (dc || {}).batteries, b = (dd || {}).batteries; const ka = Object.keys(a || {}), kb = Object.keys(b || {}); return a && b && (ka.every(k => kb.includes(k)) || kb.every(k => ka.includes(k))) ? { batteries: { ...b, ...a, ...Object.fromEntries(Object.entries(b).filter(([k, v]) => v === true && !a[k])) } } : {}; };
    const completer = (m, d, lien) => lier(Object.assign(m, { qteCctp: m.qteCctp, qte: d.qte, P: garder(m.P, d.P), Pfr: garder(m.Pfr, d.Pfr), Pel: garder(m.Pel, d.Pel), Q: garder(m.Q, d.Q), regime: m.regime || d.regime, reseau: m.reseau || d.reseau || '',
      carac: { ...(d.carac || {}), ...(m.carac || {}) }, details: { ...(d.details || {}), ...(m.details || {}), ...unionBatteries(m.details, d.details) }, local: m.local || d.local || '', alim: m.alim || d.alim || '', prescritDpgf: d.prescrit || '', dpgf: true, sources: [...m.sources, ...d.sources] }), d, lien);
    // Numérotation commune (le DPGF reprend les articles du CCTP, cas le plus courant) : une ligne du DPGF va à l'article
    // du CCTP qui la contient, de même genre ; c'est plus sûr que la ressemblance des intitulés
    const commun = dpgf.filter(d => cctp.some(c => sousCode(codeDe(c), codeDe(d)))).length >= 3;
    const pere = d => (commun ? out.filter(o => !o.dpgf && o.genre === d.genre && !!o.variante === !!d.variante && sousCode(codeDe(o), codeDe(d))).sort((a, b) => codeDe(b).length - codeDe(a).length)[0] : null);
    const enfants = new Map();
    if (commun) dpgf.forEach(d => { const p = pere(d); if (p) enfants.set(p, (enfants.get(p) || 0) + 1); });
    const remplaces = new Set();
    // Équipements repérés un par un (CH-01, CH-02) et une ligne « quantité 2 » : chacun reçoit la ligne (quantité répartie)
    const repartir = (freres, d, lien) => freres.forEach(o => lier(Object.assign(o, { P: Number.isFinite(o.P) ? o.P : d.P, reseau: o.reseau || d.reseau || '', details: { ...(d.details || {}), ...(o.details || {}) }, dpgf: true, sources: [...o.sources, ...d.sources] }), { ...d, qteRepartie: 1, qteLigne: d.qte }, lien));
    // Plusieurs modèles décrits au CCTP (ballons de 15, 40 et 300 litres) et lignes du DPGF par capacité, peut-être
    // répétées par zone : chaque ligne va au modèle de même capacité ; déjà apparié, elle le détaille (une ligne de plus)
    const parCapacite = (d, i) => {
      const v = nombre((d.carac || {}).volume);
      if (!(v > 0) || d.variante) return false;
      const cands = out.filter(o => (orig.get(o) || {}).c && !o.detaille && !remplaces.has(o) && o.genre === d.genre && !o.variante);
      const m = cands.filter(o => egal(nombre((o.carac || {}).volume), v));
      const vols = new Set(cands.map(o => nombre((o.carac || {}).volume)).filter(x => x > 0));
      if (vols.size < 2 || m.length !== 1) return false;
      const o = m[0];
      if (!o.dpgf) { completer(o, d, 'capacite'); return true; }
      // Un autre modèle de capacité non dite reste à apparier : il peut être celui-là
      if (cands.some(c => !c.dpgf && !(nombre((c.carac || {}).volume) > 0))) return false;
      out.push(lier({ id: `d${i}`, ...d, prescrit: o.prescrit || d.prescrit || '', prescritDpgf: d.prescrit || '', alim: d.alim || o.alim || '', carac: { ...communs(o.carac), ...(d.carac || {}) }, details: { ...(d.details || {}), ...(o.details || {}) }, sources: [...o.sources.filter(t => /^CCTP/.test(t)), ...d.sources], dpgf: true, detaille: true }, d, 'capacite', (orig.get(o) || {}).c));
      return true;
    };
    dpgf.forEach((d, i) => {
      if (parCapacite(d, i)) return;
      if (commun && codeDe(d)) {
        const p = pere(d), freres = p ? out.filter(o => !o.dpgf && o.genre === d.genre && o.repere && codeDe(o) === codeDe(p)) : [];
        if (freres.length > 1 && freres.length === d.qte) { repartir(freres, d, 'numero'); return; }
        // Plusieurs équipements de même genre dans l'article (trois pompes énumérées) : chaque ligne du DPGF prend le sien,
        // de même débit ou puissance, sinon le suivant dans l'ordre
        const lies = out.filter(o => (orig.get(o) || {}).c && !o.detaille && !remplaces.has(o) && o.genre === d.genre && !!o.variante === !!d.variante && sousCode(codeDe(o), codeDe(d)));
        const lg = Math.max(0, ...lies.map(o => codeDe(o).length)), groupe = lies.filter(o => codeDe(o).length === lg), memes = groupe.filter(o => !o.dpgf);
        // Tous déjà appariés (même équipement chiffré dans plusieurs zones) : la ligne détaille l'article le plus ressemblant,
        // dont elle prend les détails (montage, batteries) comme la ligne appariée
        // Même capacité (« capacité 40 litres » / ballon de 40 litres) : le même modèle
        const vol = l => { const v = nombre((d.carac || {}).volume); return Number.isFinite(v) && v > 0 ? l.filter(m => egal(nombre((m.carac || {}).volume), v)) : []; };
        if (groupe.length > 1 && !memes.length) {
          const o = vol(groupe).length === 1 ? vol(groupe)[0] : groupe.map(m => [m, ressemblance(`${m.designation} ${(m.details || {}).reference || ''}`, d.designation)]).sort((a, b) => b[1] - a[1])[0][0];
          out.push(lier({ id: `d${i}`, ...d, prescrit: o.prescrit || d.prescrit || '', prescritDpgf: d.prescrit || '', carac: { ...communs(o.carac), ...(d.carac || {}) }, details: { ...(d.details || {}), ...(o.details || {}) }, sources: [...o.sources.filter(t => /^CCTP/.test(t)), ...d.sources], dpgf: true, detaille: true }, d, 'numero', (orig.get(o) || {}).c));
          return;
        }
        if (groupe.length > 1) {
          // Repère cité par la ligne (« Extracteur V2 type … ») : cet équipement
          const parRepere = memes.find(m => m.repere && new RegExp(`(?:^|[^A-Za-z0-9])${m.repere.replace(/[^A-Za-z0-9]/g, '[^A-Za-z0-9]?')}(?![A-Za-z0-9])`).test(d.designation));
          // Niveau commun (« RDC Zone Sud » au CCTP, feuille « Zone RDC » au DPGF) : un équipement de ce niveau
          const niv = v => (norm(v).replace(/\s+/g, '').match(/rdc|r\+\d|r-\d|soussol|ss\d/g) || []);
          const nd = niv(`${d.zone || ''} ${d.local || ''}`), parNiveau = nd.length ? memes.find(m => niv(`${m.zone || ''} ${m.local || ''}`).some(n => nd.includes(n))) : null;
          const o = parRepere || vol(memes)[0] || memes.find(m => Number.isFinite(m.Q) && Number.isFinite(d.Q) && egal(m.Q, d.Q)) || memes.find(m => Number.isFinite(m.Pel) && Number.isFinite(d.Pel) && egal(m.Pel, d.Pel)) || parNiveau || memes[0];
          completer(o, d, 'numero'); return;
        }
        // Une seule ligne : le même équipement. Plusieurs (« Unité extérieure » + « Unité intérieure », deux ballons) :
        // les lignes du DPGF détaillent l'article, qui est remplacé par elles (sa prescription reprise)
        if (p && enfants.get(p) === 1) { completer(p, d, 'numero'); return; }
        if (p) {
          remplaces.add(p);
          out.push(lier({ id: `d${i}`, ...d, prescrit: p.prescrit || d.prescrit || '', prescritDpgf: d.prescrit || '', reseau: d.reseau || p.reseau || '', alim: d.alim || p.alim || '', carac: { ...communs(p.carac), ...(d.carac || {}) },
            details: { ...(p.details || {}), ...(d.details || {}) }, local: d.local || p.local || '', sources: [...p.sources, ...d.sources], dpgf: true, detaille: true }, d, 'numero', (orig.get(p) || {}).c));
          return;
        }
        out.push(lier({ id: `d${i}`, ...d, dpgf: true }, d, ''));
        return;
      }
      if (d.variante) { out.push(lier({ id: `d${i}`, ...d, dpgf: true }, d, '')); return; }
      const memes = out.filter(o => o.genre === d.genre && !o.dpgf && !o.variante);
      // Même numéro d'article des deux côtés (sans numérotation commune à tout le dossier)
      const memeNum = codeDe(d) ? memes.filter(o => codeDe(o) === codeDe(d)) : [];
      if (memeNum.length === 1) { completer(memeNum[0], d, 'numero'); return; }
      // Équipements repérés un par un dans le CCTP (CH-01, CH-02) et une ligne « quantité 2 » au DPGF : la même chose
      const reperes = memes.filter(o => o.repere);
      if (reperes.length > 1 && reperes.length === d.qte && reperes.every(o => ressemblance(o.designation, d.designation) >= 0.5 || dpgf.filter(x => x.genre === d.genre).length === 1)) { repartir(reperes, d, 'designation'); return; }
      // Même genre : la ligne la plus ressemblante (ou la seule de ce genre de chaque côté)
      const seule = memes.length === 1 && dpgf.filter(x => x.genre === d.genre).length === 1;
      const o = memes.map(m => [m, ressemblance(m.designation, d.designation)]).sort((a, b) => b[1] - a[1]).find(([, sc]) => sc >= 0.5 || seule);
      if (o) { completer(o[0], d, o[1] >= 0.5 ? 'designation' : 'genre'); return; }
      // Sinon le chapitre : titre du chapitre du DPGF qui ressemble à l'article du CCTP ou à son chapitre
      const chap = d.chapitreDpgf || d.chapitre || '';
      const oc = chap && memes.map(m => [m, Math.max(ressemblance(m.designation, chap), ressemblance(m.chapitre || '', chap))]).sort((a, b) => b[1] - a[1]).find(([, sc]) => sc >= 0.5);
      if (oc) completer(oc[0], d, 'chapitre');
      else out.push(lier({ id: `d${i}`, ...d, dpgf: true }, d, ''));
    });
    remplaces.forEach(p => out.splice(out.indexOf(p), 1));
    // Gros équipements d'abord (production, CTA, caissons, ECS), puis émetteurs et auxiliaires ; variantes non retenues
    const rang = x => (x.variante ? 9 : x.categorie === 'producteur' ? 0 : ['cta', 'ventilateur', 'desenfumage', 'ecs', 'split'].includes(x.genre) ? 1 : x.categorie === 'emetteur' ? 2 : 3);
    const vide = v => (Number.isFinite(v) ? v : '');
    return out.map(o => {
      const { dpgf: _, chapitreDpgf: __, ...x } = o, p = orig.get(o) || { c: null, d: [], lien: '' };
      const y = { ...x, principal: x.principal || rang(x) <= 1, P: vide(x.P), Pfr: vide(x.Pfr), Pel: vide(x.Pel), Q: vide(x.Q), inclus: !x.variante };
      const r = provenance(p.c, p.d, p.lien);
      y.champs = r.champs; y.rapprochement = r.lien;
      if (r.conflits.length) y.conflits = r.conflits;
      if (!y.local && r.champs.local) y.local = r.champs.local.v;
      return y;
    }).map((x, k) => [x, k]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(([x]) => x);
  }

  /* ---------- Provenance des valeurs : source, confiance, conflits entre le CCTP et le DPGF ---------- */
  // [clé, libellé, unité] des valeurs suivies ; les nombres sont comparés à 3 % près
  const CHAMPS = [['qte', 'Quantité', ''], ['P', 'Puissance chaud', 'kW'], ['Pfr', 'Puissance froid', 'kW'], ['Pel', 'Puissance électrique', 'kW'], ['Q', 'Débit d\'air', 'm³/h'],
    ['regime', 'Régime', '°C'], ['regimeChaud', 'Régime chaud', '°C'], ['regimeFroid', 'Régime froid', '°C'], ['COP', 'COP', ''], ['SCOP', 'SCOP', ''], ['EER', 'EER', ''], ['SEER', 'SEER', ''], ['rendement', 'Rendement / efficacité', '%'],
    ['volume', 'Volume', 'L'], ['tension', 'Tension', ''], ['frigorigene', 'Fluide frigorigène', ''], ['Pdispo', 'Pression disponible', 'Pa'], ['HMT', 'HMT', 'mCE'],
    ['marque', 'Marque', ''], ['reference', 'Référence', ''], ['local', 'Local / pièce', ''], ['reseau', 'Réseau de rattachement', ''], ['montage', 'Montage / régulation', ''], ['alim', 'Alimentation', ''],
    ['pompe', 'Pompe du générateur', ''], ['recup', 'Récupération d\'énergie', ''], ['recuperateur', 'Récupérateur de chaleur', ''], ['batteries', 'Batteries', ''], ['PelBe', 'Batterie électrique', 'kW'],
    ['role', 'Rôle du générateur', ''], ['circuit', 'Circuit desservi', ''], ['ballon', 'Fonction du ballon', ''], ['regulation', 'Régulation / GTB', '']];
  const LIB_CHAMP = Object.fromEntries(CHAMPS.map(([k, l, u]) => [k, { libelle: l, unite: u }]));
  const texteBatteries = b => [b.chaude && 'eau chaude', b.froide && 'eau glacée', b.co && 'change-over', b.elec && `électrique (${b.elec})`].filter(Boolean).join(' + ');
  // Valeurs d'un côté (article du CCTP ou ligne du DPGF) : { clé: [valeur, sûre] } — « sûre » : valeur nommée (« puissance
  // calorifique 90 kW ») ; une puissance sans qualificatif, une alimentation ou un réseau déduits sont moins sûrs
  function valeursDe(x, cote) {
    if (!x) return {};
    const c = x.carac || {}, d = x.details || {}, v = {};
    const met = (k, val, sur = true) => { if (val !== undefined && val !== null && val !== '' && !(typeof val === 'number' && !Number.isFinite(val))) v[k] = [val, sur]; };
    if (cote === 'dpgf') met('qte', nombre(x.qteRepartie || x.qte));
    else if (x.quantiteLue || Number.isFinite(x.qteCctp)) met('qte', Number.isFinite(x.qteCctp) ? x.qteCctp : nombre(x.qte));
    met('P', nombre(x.P), Number.isFinite(c.Pch)); met('Pfr', nombre(x.Pfr), Number.isFinite(c.Pfr)); met('Pel', nombre(x.Pel), Number.isFinite(c.Pel)); met('Q', nombre(x.Q));
    met('regime', x.regime);
    ['regimeChaud', 'regimeFroid', 'COP', 'SCOP', 'EER', 'SEER', 'rendement', 'volume', 'tension', 'frigorigene', 'Pdispo', 'HMT'].forEach(k => met(k, c[k]));
    met('marque', d.marque || (/marque\s+([A-Za-z][\w&'-]+)/.exec(x.prescrit || '') || [])[1]);
    met('reference', d.reference); met('local', d.local || x.local); met('reseau', x.reseau, false); met('montage', d.montage); met('alim', x.alim, false);
    met('pompe', d.pompe); met('recup', d.recup); met('recuperateur', d.recuperateur); if (d.batteries) met('batteries', texteBatteries(d.batteries)); met('PelBe', d.PelBe);
    met('role', d.role); met('circuit', d.circuit, false); met('ballon', d.ballon); if (d.regulation) met('regulation', [d.regulation.marque, d.regulation.gtb, d.regulation.bus].filter(Boolean).join(' · '));
    return v;
  }
  // Valeurs compatibles : un « ballon tampon » au DPGF et un « ballon tampon de découplage » au CCTP ne se contredisent pas
  const GENERIQUES = { ballon: ['tampon'], montage: ['3v'] };
  // Marque ou référence écrite plus ou moins longue d'un document à l'autre (« ACME » / « Acme AéroMax ») : la même
  const compacte = v => norm(v).replace(/[^a-z0-9]/g, '');
  const motsRef = v => norm(v).split(/[^a-z0-9]+/).filter(m => m.length >= 4 && /[a-z]/.test(m) && !/^(?:type|modele|serie|gamme|compact|confort|plus|standard|equivalent)$/.test(m));
  const compatibles = (k, a, b) => egal(a, b) || (GENERIQUES[k] || []).some(g => a === g || b === g)
    // Batteries : un document qui en nomme moins que l'autre (« électrique » / « change-over + électrique ») ne le contredit pas
    || (k === 'batteries' && (() => { const p = v => String(v).split(' + ').map(t => t.replace(/\s*\(.*\)$/, '')), pa = p(a), pb = p(b); return pa.every(t => pb.includes(t)) || pb.every(t => pa.includes(t)); })())
    // Référence écrite avec ou sans la marque et la variante (« ACME EasyFan Micro » / « EasyFAN Compact ») : un mot commun
    || (k === 'reference' && motsRef(a).some(m => motsRef(b).includes(m)))
    // Gamme d'un côté (« CLASSIQUE »), n° de modèle de l'autre (« Type 19 ») : pas comparables
    || (k === 'reference' && [a, b].some(v => /^\d+$/.test(compacte(v))) && [a, b].some(v => !/\d/.test(v)))
    || (['marque', 'reference'].includes(k) && compacte(a).length >= 3 && compacte(b).length >= 3 && (compacte(a).startsWith(compacte(b)) || compacte(b).startsWith(compacte(a)) || compacte(a).slice(0, 4) === compacte(b).slice(0, 4)));
  const egal = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 0.03 * Math.max(Math.abs(a), Math.abs(b)) : norm(a).replace(/[^a-z0-9]/g, '') === norm(b).replace(/[^a-z0-9]/g, ''));
  // champs : { clé: { v, source, confiance: 'haute' | 'moyenne' | 'faible', autre?: { v, source } } } ; conflits : valeurs différentes
  // lien : façon dont l'article du CCTP et la ligne du DPGF ont été rapprochés (numero, designation, chapitre, genre)
  function provenance(c, ds, lien = '') {
    const srcC = c ? `CCTP art. ${c.article || codeDe(c) || '?'}` : '', vc = valeursDe(c, 'cctp');
    const d = (ds || [])[0] || null, srcD = d ? (codeDe(d) ? `DPGF ligne ${codeDe(d)}` : 'DPGF') : '', vd = valeursDe(d, 'dpgf');
    const champs = {}, conflits = [];
    // Rapprochement faible (par le seul genre ou le chapitre) : les valeurs d'un seul document sont moins sûres
    const faibleLien = ['genre', 'chapitre'].includes(lien);
    CHAMPS.forEach(([k, libelle, unite]) => {
      const a = vc[k], b = vd[k];
      if (!a && !b) return;
      if (a && b) {
        if (compatibles(k, a[0], b[0])) { champs[k] = { v: egal(a[0], b[0]) || !(GENERIQUES[k] || []).includes(a[0]) ? a[0] : b[0], source: `${srcC} · ${srcD}`, confiance: 'haute' }; return; }
        // Désaccord : la quantité du DPGF (c'est elle qui est chiffrée), la prescription du CCTP pour le reste
        const [garde, srcG, autre, srcA] = k === 'qte' ? [b[0], srcD, a[0], srcC] : [a[0], srcC, b[0], srcD];
        champs[k] = { v: garde, source: srcG, confiance: 'faible', autre: { v: autre, source: srcA } };
        conflits.push({ champ: k, libelle, unite, cctp: a[0], dpgf: b[0], sourceCctp: srcC, sourceDpgf: srcD });
        return;
      }
      const [val, sur] = a || b;
      champs[k] = { v: val, source: a ? srcC : srcD, confiance: !sur || (faibleLien && c && d) ? 'faible' : 'moyenne' };
    });
    return { champs, conflits, lien: c && d ? lien || 'numero' : c ? 'cctp' : 'dpgf' };
  }
  // Valeur affichable d'un champ (« 90 kW », « 45/35 °C », « change-over »)
  const valeurChamp = (k, v) => { const u = (LIB_CHAMP[k] || {}).unite || ''; return `${typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v}${u && (typeof v === 'number' || u === '°C') ? ` ${u}` : ''}`; };
  // Valeurs à vérifier d'un équipement : conflits et valeurs reprises avec une faible confiance (le réseau et l'alimentation,
  // déduits du chapitre, se corrigent dans les colonnes du tableau)
  const aVerifier = x => Object.entries((x && x.champs) || {}).filter(([k, c]) => c.confiance === 'faible' && !['reseau', 'alim'].includes(k)).map(([k, c]) => ({ champ: k, libelle: (LIB_CHAMP[k] || { libelle: k }).libelle,
    texte: c.autre ? `${valeurChamp(k, c.v)} (${c.source}) ≠ ${valeurChamp(k, c.autre.v)} (${c.autre.source})` : `${valeurChamp(k, c.v)} (${c.source})`, conflit: !!c.autre }));

  // Réseaux du CCTP et du DPGF réunis (même nom, ou même nature et noms ressemblants) ; les équipements suivent
  function fusionnerReseaux(rc, rd, inventaire = []) {
    const out = (rc || []).map(r => ({ ...r }));
    const renomme = new Map();
    (rd || []).forEach(d => {
      // Même identifiant, sinon même nature, noms ressemblants et même chapitre (quand les deux en ont un)
      const memeChap = r => !r.chapitre || !d.chapitre || ressemblance(r.chapitre, d.chapitre) >= 0.5;
      const m = out.find(r => r.id === d.id) || out.find(r => r.nature === d.nature && ressemblance(r.nom, d.nom) >= 0.6 && memeChap(r));
      if (m) { Object.assign(m, { L: m.L || d.L, dnMax: Number.isFinite(m.dnMax) ? m.dnMax : d.dnMax, regime: m.regime || d.regime, sources: [...m.sources, ...d.sources] }); renomme.set(d.id, m.id); }
      else out.push({ ...d });
    });
    inventaire.forEach(x => { if (x.reseau && renomme.has(x.reseau)) x.reseau = renomme.get(x.reseau); });
    return out;
  }

  /* ---------- Écarts entre le CCTP et le DPGF ---------- */
  // Questions à poser pendant la consultation : équipement décrit au CCTP sans ligne au DPGF (non chiffré), ligne du DPGF
  // sans article au CCTP (non décrit), quantité ou marque différente
  const marquesDe = t => [...String(t || '').matchAll(/marque(?: prévue au DPGF :)?\s+([A-Za-z][\w&'-]+(?:\s[A-Z][\w&'-]+)?)/g)].map(m => norm(m[1]).replace(/[^a-z0-9]/g, '')).filter(m => m.length > 1);
  function ecarts(inventaire, lus = { cctp: true, dpgf: true }) {
    const out = [];
    const art = x => ((x.sources || []).find(t => /^CCTP/.test(t)) || '').replace('CCTP art. ', 'art. ');
    const lig = x => ((x.sources || []).find(t => /^DPGF/.test(t)) || '').replace('DPGF ', 'ligne ');
    inventaire.filter(x => !x.variante && x.inclus !== false).forEach(x => {
      const c = (x.sources || []).some(t => /^CCTP/.test(t)), d = (x.sources || []).some(t => /^DPGF/.test(t)), important = x.principal || x.categorie === 'producteur';
      if (lus.dpgf && c && !d && (important || x.categorie === 'emetteur')) out.push({ type: 'absent-dpgf', designation: x.designation, texte: `Décrit au CCTP (${art(x)}) mais sans ligne au DPGF : à chiffrer quand même, ou à faire préciser (fourni par un autre lot ?).` });
      if (lus.cctp && d && !c && important) out.push({ type: 'absent-cctp', designation: x.designation, texte: `Chiffré au DPGF (${lig(x)}) mais non décrit au CCTP : caractéristiques et marque attendues à demander.` });
      if (c && d && Number.isFinite(x.qteCctp) && Number.isFinite(nombre(x.qte)) && x.qteCctp !== nombre(x.qte)) out.push({ type: 'quantite', designation: x.designation, texte: `Quantité : ${x.qteCctp} au CCTP (${art(x)}), ${x.qte} au DPGF (${lig(x)}).` });
      // Marque du DPGF : sa colonne « Marque » d'abord (« marque prévue au DPGF »), sinon celle écrite dans la désignation
      const col = /marque prévue au DPGF : (.+)$/.exec(x.prescritDpgf || ''), mc = marquesDe(x.prescrit), md = col ? [norm(col[1]).replace(/[^a-z0-9]/g, '')] : marquesDe(x.prescritDpgf);
      if (mc.length && md.length && !md.some(m => mc.some(k => k.includes(m) || m.includes(k)))) out.push({ type: 'marque', designation: x.designation, texte: `Marque : « ${x.prescrit} » au CCTP, « ${col ? col[1] : x.prescritDpgf} » au DPGF.` });
      // Valeurs différentes d'un document à l'autre (puissance, débit, régime, volume, montage…) ; la quantité et la marque
      // sont relevées ci-dessus, le réseau et l'alimentation ne sont que déduits
      (x.conflits || []).filter(k => !['qte', 'reseau', 'alim', 'circuit'].includes(k.champ) && !(k.champ === 'marque' && out.some(e => e.type === 'marque' && e.designation === x.designation))).forEach(k => out.push({ type: k.champ === 'marque' ? 'marque' : 'valeur', champ: k.champ, designation: x.designation,
        texte: `${k.libelle} : ${valeurChamp(k.champ, k.cctp)} au CCTP (${k.sourceCctp.replace('CCTP ', '')}), ${valeurChamp(k.champ, k.dpgf)} au DPGF (${k.sourceDpgf.replace('DPGF ', '')}).` }));
    });
    return out;
  }
  const LIB_ECART = { 'absent-dpgf': 'Absent du DPGF', 'absent-cctp': 'Absent du CCTP', quantite: 'Quantité différente', marque: 'Marque différente', valeur: 'Valeur différente' };
  const ecartsTexte = l => l.map((e, i) => `${i + 1}. ${e.designation} — ${LIB_ECART[e.type]} : ${e.texte}`).join('\n');

  /* ---------- Corrections mémorisées ---------- */
  // Une correction faite dans le tableau (genre changé, ligne écartée, nature d'un réseau) devient une règle, appliquée
  // aux dossiers suivants : la clé est la désignation sans nombres ni dimensions (« tronçon soufflage dbb rr z »)
  const cleRegle = t => norm(t).replace(/\([^)]*\)/g, ' ').replace(/[^a-z ]+/g, ' ').split(' ').filter(m => m.length > 1 && !['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'pour', 'avec', 'compris', 'type', 'marque'].includes(m)).slice(0, 6).join(' ');
  function appliquerRegles(items, reseaux, regles = []) {
    const R = new Map((regles || []).map(r => [`${r.objet}|${r.cle}`, r]));
    (items || []).forEach(x => {
      const r = R.get(`equipement|${cleRegle(x.designation)}`);
      if (!r) return;
      if (r.genre && GENRES[r.genre]) Object.assign(x, { genre: r.genre, categorie: GENRES[r.genre].categorie });
      if (r.inclus === false) x.inclus = false;
      x.appris = true;
    });
    (reseaux || []).forEach(z => {
      const r = R.get(`reseau|${cleRegle(z.nom)}`);
      if (r && r.nature && NATURE[r.nature]) Object.assign(z, { nature: r.nature, hydro: NATURE[r.nature].hydro, appris: true });
    });
    return { items, reseaux };
  }
  // Règles tirées des différences entre la lecture automatique (x.auto) et le tableau enregistré ; fusionnées avec les anciennes
  function apprendre(items, reseaux, regles = []) {
    const out = new Map((regles || []).map(r => [`${r.objet}|${r.cle}`, r])), date = new Date().toISOString().slice(0, 10);
    (items || []).forEach(x => {
      const a = x.auto, cle = cleRegle(a ? a.designation : x.designation);
      if (!a || !cle) return;
      const r = {};
      if (x.genre !== a.genre) r.genre = x.genre;
      if (x.inclus === false && a.inclus !== false && !x.variante) r.inclus = false;
      if (Object.keys(r).length) out.set(`equipement|${cle}`, { objet: 'equipement', cle, ...r, exemple: a.designation.slice(0, 80), date });
    });
    (reseaux || []).forEach(z => { const a = z.auto, cle = cleRegle(a ? a.nom : z.nom); if (a && cle && z.nature && z.nature !== a.nature) out.set(`reseau|${cle}`, { objet: 'reseau', cle, nature: z.nature, exemple: a.nom.slice(0, 80), date }); });
    return [...out.values()].slice(-500);
  }

  /* ---------- Tableau d'équipements (annexe, carnet, tableau du CCTP) ---------- */
  // Lignes d'un tableau (Excel, ou PDF : cellules séparées par des tabulations) : en-tête reconnue (repère, désignation,
  // local, débit, puissance…), puis un équipement par repère avec son local, son débit et ses puissances
  const COL_ANNEXE = [['repere', /^(?:rep(?:ere)?\.?|tag|n° ?(?:d'?)?(?:equipement|appareil)|code equipement|reference equipement|id)$/], ['designation', /designation|equipement|appareil|description|libelle|^type$|^nature$/],
    ['local', /local|zone|piece|desserte|batiment|niveau|emplacement|secteur/], ['Q', /debit|m3 ?\/ ?h|m³ ?\/ ?h|soufflage|air neuf/], ['Pfr', /(?:puissance|p\.?) ?(?:froid|frigo)/],
    ['Pel', /(?:puissance|p\.?) ?(?:elec|absorbee)|kw ?e\b/], ['P', /(?:puissance|p\.?) ?(?:chaud|calo|thermique)|^puissance|^p ?\(?kw|kw$/], ['marque', /marque|fabricant/], ['modele', /modele|reference|gamme|serie/], ['qte', /^(?:qte|quantite|nombre|nb)$/]];
  const REPERE_ANNEXE = /^[A-Z]{1,5}[-_. ]?\d{1,3}[A-Z]?(?:[-_.]\d{1,2})?$/;
  const PAR_PREFIXE_ANNEXE = { PAC: 'pac-air', GF: 'gf-air', CH: 'chaudiere-gaz', CTA: 'cta', VC: 'ventilo', VCV: 'ventilo', CAS: 'ventilo', AT: 'aerotherme', AER: 'aerotherme', RAD: 'radiateurs', R: 'radiateurs', UE: 'split', UI: 'split', SPL: 'split', VMC: 'ventilateur', EXT: 'ventilateur', CE: 'ventilateur', CI: 'ventilateur', TE: 'ventilateur', BAL: 'ecs', BECS: 'ecs', P: 'pompe', PO: 'pompe', CI2: 'pompe', DSF: 'desenfumage' };
  function tableauEquipements(rows, source = 'Annexe') {
    const out = [];
    let map = null;
    (rows || []).forEach(r => {
      const cells = (r || []).map(c => String(c ?? '').trim());
      if (!cells.some(Boolean)) return;
      const tetes = cells.map(c => norm(c));
      const m = {};
      COL_ANNEXE.forEach(([k, re]) => { const i = tetes.findIndex((t, j) => t && t.length < 40 && re.test(t) && !Object.values(m).includes(j)); if (i >= 0) m[k] = i; });
      // Nouvelle en-tête : au moins un repère ou une désignation, et deux autres colonnes reconnues
      if ((m.repere !== undefined || m.designation !== undefined) && Object.keys(m).length >= 3 && !cells.some(c => REPERE_ANNEXE.test(c))) { map = m; return; }
      if (!map) return;
      const v = k => (map[k] === undefined ? '' : cells[map[k]] || '');
      const rep = v('repere').toUpperCase().replace(/[_. ]/, '-'), des = v('designation');
      if (!REPERE_ANNEXE.test(v('repere')) && !(des && nombre(v('qte')) > 0)) return;
      const pre = (/^([A-Z]+)/.exec(rep) || [])[1];
      const c = classer(`${des} ${v('modele')}`) || (PAR_PREFIXE_ANNEXE[pre] ? { categorie: GENRES[PAR_PREFIXE_ANNEXE[pre]].categorie, genre: PAR_PREFIXE_ANNEXE[pre] } : null);
      if (!c) return;
      const n = k => { const x = nbr(v(k)); return Number.isFinite(x) ? x : NaN; };
      out.push({ ...c, designation: des || rep, repere: REPERE_ANNEXE.test(v('repere')) ? rep : '', local: v('local'), qte: n('qte') > 0 ? n('qte') : 1, Q: n('Q'), P: n('P'), Pfr: n('Pfr'), Pel: n('Pel'),
        prescrit: [v('marque') && `marque ${v('marque')}`, v('modele') && `type ${v('modele')}`].filter(Boolean).join(', '), carac: {}, sources: [source], annexe: true });
    });
    return out;
  }
  // Équipements du tableau réunis à l'inventaire : un équipement de l'inventaire (« Ventilo-convecteurs ×6 ») est détaillé
  // repère par repère (VC-01 bureau 1, VC-02…) ; repère déjà connu : débit, puissance et local complétés ; sinon ajouté
  function fusionnerAnnexe(inventaire, annexe) {
    const inv = (inventaire || []).slice(), garder = (a, b) => (Number.isFinite(nombre(a)) && a !== '' ? a : Number.isFinite(b) ? b : a);
    const parGenre = new Map();
    (annexe || []).forEach(a => {
      // « CTA-1 » et « CTA-01 » : le même repère
      const cleRep = r => String(r).toUpperCase().replace(/[-_ .]/g, '').replace(/([A-Z])0+(\d)/, '$1$2');
      const memeRep = a.repere && inv.find(x => x.repere && cleRep(x.repere) === cleRep(a.repere));
      if (memeRep) { Object.assign(memeRep, { Q: garder(memeRep.Q, a.Q), P: garder(memeRep.P, a.P), Pfr: garder(memeRep.Pfr, a.Pfr), Pel: garder(memeRep.Pel, a.Pel), local: memeRep.local || a.local, sources: [...memeRep.sources, ...a.sources] }); return; }
      if (!parGenre.has(a.genre)) parGenre.set(a.genre, []);
      parGenre.get(a.genre).push(a);
    });
    parGenre.forEach((liste, genre) => {
      const cand = inv.filter(x => x.genre === genre && !x.variante && !x.repere);
      const detailles = new Set();
      liste.forEach(a => {
        const base = cand.length === 1 ? cand[0] : cand.map(x => [x, ressemblance(`${x.designation} ${x.chapitre || ''}`, `${a.designation} ${a.local}`)]).sort((p, q) => q[1] - p[1]).filter(([, s]) => s >= 0.4).map(([x]) => x)[0];
        const v = { id: `a${inv.length}`, ...(base ? { ...base, designation: a.designation && a.designation !== a.repere ? a.designation : base.designation, carac: { ...communs(base.carac) } } : { inclus: true }), ...a,
          prescrit: a.prescrit || (base ? base.prescrit : ''), reseau: base ? base.reseau || '' : '', alim: base ? base.alim : '', principal: base ? base.principal : !!a.principal,
          P: garder(a.P, base ? nombre(base.P) : NaN), Pfr: garder(a.Pfr, base ? nombre(base.Pfr) : NaN), Pel: a.Pel, Q: garder(a.Q, NaN), sources: [...(base ? base.sources : []), ...a.sources] };
        ['P', 'Pfr', 'Pel', 'Q'].forEach(k => { if (!Number.isFinite(nombre(v[k])) || v[k] === '') v[k] = ''; });
        inv.splice(base ? inv.indexOf(base) + 1 + [...detailles].filter(d => d.base === base).length : inv.length, 0, v);
        if (base) detailles.add({ base, v });
      });
      // L'équipement détaillé repère par repère laisse la place à ses repères
      new Set([...detailles].map(d => d.base)).forEach(b => inv.splice(inv.indexOf(b), 1));
    });
    return inv;
  }

  /* ---------- Équipements rattachés aux réseaux de la production ---------- */
  // Émetteur hydraulique sans réseau : rattaché au réseau de distribution de la production quand son texte dit comment
  // il est alimenté (change-over, eau glacée, batterie à eau, « raccordée à la PAC ») ou qu'il est décrit dans le même
  // chapitre que la production (III.1.3 CTA sous III.1 avec la PAC III.1.1). Ballons ECS électriques ou solaires : hors schéma
  const HYDRO_EM = ['cta', 'ventilo', 'aerotherme', 'radiateurs', 'plancher', 'radiant', 'plafond', 'ecs'];
  function rattacher(inventaire, reseaux = []) {
    const parId = new Map((reseaux || []).map(r => [r.id, r]));
    const distrib = (reseaux || []).filter(r => r.hydro && !estPrimaire(r) && ['change-over', 'chauffage', 'eau-glacee'].includes(r.nature));
    const chapProd = inventaire.filter(x => x.categorie === 'producteur' && x.inclus !== false && !x.variante).map(x => codeDe(x).split('.').slice(0, 2).join('.')).filter(c => c.includes('.'));
    // Article de réseau du CCTP qui contient la ligne (même numérotation que le DPGF) : rattachement par le numéro
    const parArticle = x => { const codes = (x.sources || []).map(t => (/^(?:CCTP art\.|DPGF) (\S+)/.exec(t) || [])[1]).filter(Boolean); return (reseaux || []).filter(r => r.article && r.hydro && codes.some(c => sousCode(r.article, c))).sort((a, b) => b.article.length - a.article.length)[0]; };
    inventaire.forEach(x => {
      if (!HYDRO_EM.includes(x.genre) || x.variante) return;
      delete x.horsSchema;
      const ra = (!x.reseau || !(parId.get(x.reseau) || {}).hydro) && x.genre !== 'ecs' ? parArticle(x) : null;
      if (ra) { x.reseau = ra.id; x.rattache = 'numero'; if (ra.montage && !(x.details || {}).montage) x.details = { ...(x.details || {}), montage: ra.montage }; return; }
      if (x.genre === 'ecs' && ['electrique', 'solaire'].includes(x.alim)) { x.horsSchema = x.alim === 'solaire' ? 'ECS solaire (hors production)' : 'ECS électrique'; return; }
      if (['radiateurs', 'aerotherme', 'radiant'].includes(x.genre) && x.alim === 'electrique') { x.horsSchema = 'Émetteur électrique'; return; }
      const r = parId.get(x.reseau);
      if (r && r.hydro) return;
      const memeChap = chapProd.some(c => codeDe(x).startsWith(`${c}.`));
      // CTA à batterie électrique seule, ou sans batterie à eau reconnue hors du chapitre de la production : pas un circuit
      if (x.genre === 'cta' && (x.alim === 'electrique' || (!x.alim && !memeChap && distrib.length))) { x.horsSchema = x.alim === 'electrique' ? 'CTA à batterie électrique' : 'CTA sans batterie à eau reconnue (rattachez-la à un réseau si elle en a une)'; return; }
      if (x.alim === 'electrique' || !distrib.length) return;
      if (!x.alim && !memeChap) return;
      const ordre = { 'change-over': ['change-over', 'chauffage', 'eau-glacee'], chauffage: ['chauffage', 'change-over'], 'eau-glacee': ['eau-glacee', 'change-over'] }[x.alim]
        || (x.genre === 'ecs' ? ['chauffage', 'change-over'] : ['change-over', 'chauffage', 'eau-glacee']);
      for (const n of ordre) {
        // Réseau nommé pour un autre émetteur (« Circuit radiateurs ») : pas pour une CTA, un ballon ou des cassettes
        const l = distrib.filter(z => z.nature === n && (() => { const g = (classer(z.nom) || {}).genre; return !g || !HYDRO_EM.includes(g) || g === x.genre; })());
        if (!l.length) continue;
        const cible = l.length === 1 ? l[0] : l.map(z => [z, ressemblance(`${z.nom} ${z.chapitre || ''}`, `${x.designation} ${x.chapitre || ''}`)]).sort((a, b) => b[1] - a[1])[0][0];
        x.reseau = cible.id;
        x.rattache = x.alim ? 'texte' : 'chapitre';
        return;
      }
    });
    return inventaire;
  }
  // Puissance thermique d'un émetteur pour le fluide du circuit : froid pour l'eau glacée, chaud sinon (l'autre à défaut)
  const pTherm = (x, froid) => { const c = nombre(x.P), f = nombre(x.Pfr); return froid ? (Number.isFinite(f) ? f : c) : (Number.isFinite(c) ? c : f); };

  /* ---------- Vers le schéma de principe ---------- */
  // Tronçon primaire : réseau entre la production et le ballon tampon ou le collecteur (« Collecteur primaire … »,
  // « EC : circuit en tube acier » sous « Circuit primaire chauffage »)
  const motsDe = t => norm(t).replace(/[^a-z0-9]+/g, ' ').trim();
  // Émetteur d'un réseau d'après son nom : terminaux d'abord (« distribution ventilo-convecteurs … et CTA » = ventilos)
  // (le premier émetteur cité l'emporte : « Départ CTA et ventilo » = CTA, « distribution ventilo … et CTA » = ventilos)
  const genreReseau = nom => {
    const t = norm(nom), cands = [[/ventilo|cassette/, 'ventilo'], [/radiateur/, 'radiateurs'], [/plancher/, 'plancher'], [/\bcta\b|centrale/, 'cta']].map(([re, g]) => [t.search(re), g]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]);
    return cands.length ? cands[0][1] : (classer(nom) || {}).genre;
  };
  const estPrimaire = r => {
    const nom = motsDe(r.nom), tout = motsDe(`${r.nom} ${r.chapitre || ''} ${r.contexte || ''}`);
    // Collecteur, nourrice, tronçon « entre … et le ballon / la bouteille / le collecteur » : toujours la production
    if (/\b(?:collecteurs?|nourrices?)\b|\bentre\b.*\b(?:ballons?|bouteilles?|collecteurs?)\b/.test(nom)) return true;
    // « primaire » (au nom ou au chapitre), sauf un réseau de distribution, un départ ou un circuit secondaire nommé
    return /\bprimaires?\b/.test(tout) && !/distribution|secondaires?|\bdeparts?\b/.test(nom);
  };
  // Fluide d'un émetteur : réseau, texte (EC / EG), batterie (ventilo 2 tubes / 2 fils : eau froide, chauffage électrique)
  function emetteurDe(x, schema, parId) {
    const d = x.details || {}, r = parId.get(x.reseau), nat = r ? r.nature : '';
    if (nat === 'change-over') return true;
    if (nat === 'eau-glacee') return schema === 'froid';
    if (nat === 'chauffage' || nat === 'ecs') return schema === 'chaud';
    if (x.genre === 'ecs' || ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(x.genre)) return schema === 'chaud';
    if (x.genre === 'plafond') return schema === 'froid';
    const fl = d.fluide || fluideDe(x.designation);
    if (d.fils2 || (d.tubes === '2t' && (d.batteries || {}).elec)) return schema === 'froid';
    if (x.alim === 'change-over') return true;
    if (x.alim === 'eau-glacee' || fl === 'froid') return schema === 'froid';
    if (x.alim === 'chauffage' || fl === 'chaud') return schema === 'chaud';
    return schema === 'froid' ? nombre(x.Pfr) > 0 : nombre(x.P) > 0 || !(nombre(x.Pfr) > 0);
  }
  // Pompes secondaires (« Pompe double P2 - 9,9 m3/h 14,3 mCE ») : chacune sur son circuit — celui de son réseau, celui que
  // nomme le libellé des vannes du même chapitre (« DN 50 (CTA / ventilo EC) »), sinon un circuit créé pour elle ; la
  // pompe (débit, HMT) va dans « pompesFab » (courbe d'un point, à compléter par la fiche du fabricant)
  function pompesCircuits(e, inc, schema, Sc, alertes, parId = new Map()) {
    // Fluide d'un circuit : celui de son réseau (EC, EG, change-over : les deux)
    const fluideCircuit = z => { const n = (parId.get(z.reseau) || {}).nature; return n === 'eau-glacee' ? 'froid' : ['chauffage', 'ecs'].includes(n) ? 'chaud' : ''; };
    const motsCles = t => motsDe(t).replace(/\b(?:ec|eg|eau|chaude|glacee|circuits?|de|du|des|et|distribution|depart|departs|ou|change|over)\b/g, ' ').replace(/convecteurs?/g, 'convecteur').replace(/radiateurs?/g, 'radiateur').replace(/\s+/g, ' ').trim();
    const pompes = inc.filter(x => x.genre === 'pompe' && !x.variante && !(x.details || {}).primaire && !(x.details || {}).sanitaire && (nombre(x.Q) > 0 || (x.details || {}).circuit));
    const avecPompe = new Set();
    pompes.forEach(x => {
      const d = x.details || {}, lib = d.circuit || '', fl = fluideDe(lib || x.designation);
      if (schema && fl && fl !== schema) return;
      if (schema === 'froid' && !fl) return;
      let c = e.circuits.find(z => z.reseau && z.reseau === x.reseau && !avecPompe.has(z));
      // Circuit nommé comme le libellé (sans les mots de fluide), du même fluide (EC → chaud, EG → froid)
      if (!c && lib) c = e.circuits.filter(z => !avecPompe.has(z) && (!fl || !fluideCircuit(z) || fluideCircuit(z) === fl)).map(z => [z, ressemblance(motsCles(`${z.rep} ${(parId.get(z.reseau) || {}).nom || ''}`), motsCles(lib))]).filter(([, sc]) => sc >= 0.5).sort((a, b) => b[1] - a[1] || (fluideCircuit(b[0]) ? 1 : 0) - (fluideCircuit(a[0]) ? 1 : 0)).map(([z]) => z)[0];
      if (!c) {
        const t = norm(lib || x.designation), emet = /radiateur/.test(t) ? 'radiateurs' : /plancher/.test(t) ? 'plancher' : /ventilo|cassette/.test(t) ? 'ventilo' : /\bcta\b|centrale/.test(t) ? 'cta' : /\becs\b|ballon/.test(t) ? 'ecs' : schema === 'froid' ? 'ventilo' : 'radiateurs';
        c = { rep: (lib ? `Circuit ${lib}` : `Circuit ${x.repere || x.designation.split(' - ')[0]}`).slice(0, 40), emetteur: emet, P: '', regime: '', regulation: montageCircuit('', emet, Sc), L: 50 };
        e.circuits.push(c);
        alertes.push(`${c.rep} : circuit créé d'après la pompe ${x.repere || x.designation.split(' - ')[0]}${lib ? ' et le libellé des vannes du chapitre' : ''} ; puissance et longueur à saisir.`);
      }
      avecPompe.add(c);
      const Q = nombre(x.Q), H = nombre((x.carac || {}).HMT);
      (e.pompesFab = e.pompesFab || []).push({ circuit: c.rep, ref: `${x.designation.split(' - ')[0].slice(0, 50)}${d.double ? ' (jumelée)' : ''}`, courbe: Q > 0 && H > 0 ? `${f1(Q)}:${f1(H)}` : '' });
    });
  }
  // Clé de Schema.REGIMES d'un régime « 60/40 » (sinon « perso » et ses températures)
  const regimeSchema = (reg, Sc) => { const [d, r] = String(reg || '').split('/').map(Number); const k = Object.entries(Sc.REGIMES).find(([, v]) => v[1] === d && v[2] === r); return k ? { reseau: k[0] } : d > 0 ? { reseau: 'perso', Tdep: d, Tret: r } : {}; };
  // Schémas de principe de l'inventaire : un seul en général ; deux (froid + chaud) quand la production sépare les fluides
  // — thermofrigopompe (chaud et froid produits ensemble : schéma froid à récupération totale + schéma chaud qui la
  // reprend, comme le modèle « thermofrigopompe »), ou productions chaud et froid distinctes. Circuits EC au chaud, EG
  // au froid ; change-over : dans les deux (chaque production doit pouvoir le servir, la saison choisit laquelle)
  function versSchemas(inventaire, Sc, reseaux = []) {
    const inc = (inventaire || []).filter(x => x.inclus !== false && !x.variante), prod = inc.filter(x => x.categorie === 'producteur'), det = x => x.details || {};
    const autres = inc.filter(x => x.categorie !== 'producteur');
    const tfp = prod.find(x => det(x).recup === 'totale' && nombre(x.P) > 0 && nombre(x.Pfr) > 0);
    const froids = prod.filter(x => x !== tfp && usageGen(x.genre, Sc) === 'froid'), chauds = prod.filter(x => x !== tfp && usageGen(x.genre, Sc) !== 'froid');
    if (!tfp && !(froids.length && chauds.length)) { const r = versSchema(inventaire, Sc, reseaux); return { schemas: [{ cle: 'pid', titre: r.entrees.titreInstallation || 'd\'après le CCTP / DPGF', entrees: r.entrees, alertes: r.alertes, commentaire: '' }] }; }
    const optsF = { fluides: ['eau-glacee', 'change-over'], schema: 'froid' }, optsC = { fluides: ['chauffage', 'ecs', 'change-over'], schema: 'chaud' };
    const nettoyer = x => ({ ...x, details: { ...det(x) } });
    let invF, invC, commentaireF, commentaireC;
    if (tfp) {
      const c = tfp.carac || {}, rf = c.regimeFroid || '7/12', rc = c.regimeChaud || tfp.regime || '45/40', rev = tfp.genre === 'pac-rev' || /reversible/.test(norm(tfp.designation));
      const gf = { ...nettoyer(tfp), genre: rev ? 'pac-rev' : 'gf-air', P: '', regime: rf, alim: 'eau-glacee' }; delete gf.details.role;
      invF = [gf, ...froids, ...autres];
      const appoint = chauds.filter(x => !/^pac/.test(x.genre) || det(x).role);
      const pacChaud = { ...nettoyer(tfp), genre: 'pac-air', Pfr: '', regime: rc, alim: 'chauffage' }; delete pacChaud.details.recup; pacChaud.details.role = 'base';
      invC = [...(appoint.length ? appoint.map(x => ({ ...nettoyer(x), regime: x.regime || rc })) : [pacChaud]), ...autres];
      commentaireF = `Thermofrigopompe ${tfp.repere ? `${tfp.repere} ` : ''}(${tfp.designation.replace(/\s+P(?:chaud|froid)\b.*$/i, '').slice(0, 70)}) : production simultanée de chaud et de froid. Modélisée comme le modèle « thermofrigopompe » : ce schéma froid (${f1(nombre(tfp.Pfr))} kW, ${rf} °C) avec récupération totale au condenseur (${rc} °C), reprise par le schéma chaud. Circuits change-over présents dans les deux schémas.`;
      commentaireC = `Schéma chaud de la thermofrigopompe : la chaleur récupérée vient du schéma froid (« Récupération de chaleur d'un groupe froid »). ${appoint.length ? `Générateur d'appoint du dossier : ${appoint.map(x => x.designation.slice(0, 40)).join(', ')}.` : `Aucun appoint au dossier : la thermofrigopompe en mode pompe à chaleur seule (${f1(nombre(tfp.P))} kW, ${rc} °C) est le générateur de base — à ajuster si elle ne fonctionne qu'en récupération.`} Circuits change-over présents dans les deux schémas.`;
    } else {
      invF = [...froids, ...autres]; invC = [...chauds, ...froids.filter(x => det(x).recup), ...autres];
      commentaireF = 'Production de froid du dossier : schéma eau glacée (circuits EG et change-over).';
      commentaireC = 'Production de chaleur du dossier : schéma eau chaude (circuits EC, ECS et change-over).';
    }
    const F = versSchema(invF, Sc, reseaux, optsF), C = versSchema(invC, Sc, reseaux, optsC);
    if (tfp) {
      const c = tfp.carac || {}, rc = c.regimeChaud || '45/40';
      Object.assign(F.entrees, { Pgen: nombre(tfp.Pfr), recupGf: 'totale', regimeRecup: rc, ...(nombre(c.EER) > 1 ? { eerRecup: nombre(c.EER) } : {}) }, regimeSchema(c.regimeFroid || '7/12', Sc));
      if (F.entrees.reseau !== 'perso') { delete F.entrees.Tdep; delete F.entrees.Tret; }
      C.entrees.recupDe = '@froid';
      Object.assign(C.entrees, regimeSchema(rc, Sc));
      if (C.entrees.reseau !== 'perso') { delete C.entrees.Tdep; delete C.entrees.Tret; }
      F.entrees.titreInstallation = `Thermofrigopompe — eau glacée`; C.entrees.titreInstallation = 'Thermofrigopompe — chauffage';
    }
    return { schemas: [{ cle: 'froid', titre: F.entrees.titreInstallation || 'Production de froid', entrees: F.entrees, alertes: F.alertes, commentaire: commentaireF },
      { cle: 'chaud', titre: C.entrees.titreInstallation || 'Production de chaleur', entrees: C.entrees, alertes: C.alertes, commentaire: commentaireC }] };
  }
  // Montage d'un circuit (Schema.REGULATIONS) d'après le montage lu ; ECS : départ direct ; vanne 4 voies des terminaux :
  // circuit à débit constant (mélange 3 voies)
  function montageCircuit(m, emet, Sc) {
    if (emet === 'ecs') return m === 'echangeur' ? 'echangeur' : 'direct';
    if (m === '4v') return '3v';
    if (m && (!Sc.REGULATIONS || Sc.REGULATIONS[m])) return m;
    return emet === 'ventilo' ? '2v' : '3v';
  }
  // Usage d'un générateur (chaud, froid, mixte) d'après le schéma
  const usageGen = (g, Sc) => ((Sc.GENERATEURS || {})[g] || [])[1] || (/^gf/.test(g) ? 'froid' : 'chaud');
  // Générateurs de la production du schéma : même usage que le principal (ou mixte) ; groupe froid avec récupération de
  // chaleur dans un schéma chaud (rôle « récupération »). Détaillés ligne par ligne si la production est hétérogène
  // (types différents, rôles cités, récupération)
  function generateursDetailles(prod, principal, Sc) {
    const u = usageGen(principal, Sc), det = x => x.details || {};
    const recup = x => u === 'chaud' && usageGen(x.genre, Sc) === 'froid' && !!det(x).recup;
    const compat = prod.filter(x => !x.variante && (recup(x) || [u, 'mixte'].includes(usageGen(x.genre, Sc)) || u === 'mixte'));
    const hetero = new Set(compat.map(x => x.genre)).size > 1 || compat.some(x => det(x).role && det(x).role !== 'base') || compat.some(recup);
    return hetero ? { compat, recup } : null;
  }
  // Production hétérogène, ballons, découplage, pompes intégrées, récupération, sous-station : champs du schéma
  function completerSchema(e, { inc, prod, principal, reg, Sc, alertes, schema }) {
    const det = x => x.details || {};
    if (principal) {
      const gd = generateursDetailles(prod, principal[0], Sc);
      if (gd) {
        const lignes = [], pac = gd.compat.some(x => /^pac/.test(x.genre));
        gd.compat.forEach(x => {
          const q = Math.max(1, Math.round(nombre(x.qte) || 1)), d = det(x), c = x.carac || {};
          for (let k = 0; k < q && lignes.length < 6; k++) {
            const rc = gd.recup(x);
            const role = rc ? 'recuperation' : d.role || (x.genre === principal[0] ? 'base' : pac && /^chaudiere/.test(x.genre) ? 'appoint' : 'releve');
            // Récupération sur un groupe froid : chaleur rejetée au condenseur (puissance froid × (1 + 1/EER)), partielle au désurchauffeur
            const Pf = nombre(x.Pfr), Prec = rc && Pf > 0 ? Math.round(Pf * (1 + 1 / Math.max(1.5, nombre(c.EER) || 3.5)) * (d.recup === 'totale' ? 1 : 0.15) * 10) / 10 : '';
            const P = rc ? Prec : nombre(x.P) > 0 ? nombre(x.P) : '';
            lignes.push({ rep: x.repere && q === 1 ? x.repere : x.repere ? `${x.repere}-${k + 1}` : '', type: Sc.GENERATEURS[x.genre] ? x.genre : 'chaudiere-cond', P, role, pompe: d.pompe === 'integree' ? 'integree' : '',
              regime: !rc && x.regime && x.regime !== reg && usageGen(x.genre, Sc) !== 'froid' ? x.regime : '', alim: '' });
            if (P === '') alertes.push(`${x.designation} : puissance non trouvée, à saisir dans les générateurs détaillés.`);
          }
        });
        e.generateurs = lignes;
        alertes.push(`Production hétérogène : ${lignes.length} générateur(s) détaillé(s) (${lignes.map(l => `${GENRES[l.type] ? GENRES[l.type].libelle : l.type} en ${({ base: 'base', releve: 'relève', appoint: 'appoint', secours: 'secours', recuperation: 'récupération' })[l.role]}`).join(', ')}) : rôles et puissances à vérifier.`);
        const autres = prod.filter(x => !x.variante && !gd.compat.includes(x));
        if (autres.length) alertes.push(`${autres.map(x => x.designation).join(', ')} : autre fluide que la production principale, à traiter dans un second schéma.`);
        if (gd.compat.every(x => det(x).pompe === 'integree')) e.pompeGen = 'integree';
      } else {
        const p = prod.find(x => x.genre === principal[0]);
        if (p && det(p).pompe === 'integree') e.pompeGen = 'integree';
      }
      const pp = prod.find(x => x.genre === principal[0]) || {};
      // Groupe froid (ou PAC réversible) principal avec désurchauffeur ou récupération totale
      if (/^(gf|pac-rev)/.test(principal[0]) && det(pp).recup) e.recupGf = det(pp).recup;
      if (/^pac-eau/.test(principal[0]) && det(pp).recup === 'totale') alertes.push(`${pp.designation} : thermofrigopompe (chaud et froid produits ensemble) — le froid est à traiter dans un second schéma relié.`);
      // Sous-station (réseau de chaleur) : régime primaire cité
      if (principal[0] === 'echangeur' && det(pp).regimePrim) e.regimePrim = det(pp).regimePrim;
    }
    // Découplage production / distribution : bouteille, échangeur, ballon de découplage, aucun
    const dc = [...prod, ...inc.filter(x => ['tampon', 'regulation'].includes(x.genre))].map(x => det(x).decouplage).find(Boolean);
    if (dc) e.bouteille = dc;
    // Ballons : tampon, stockage, découplage (à la place de la bouteille), ECS sur son circuit
    const ballons = [];
    const uP = principal ? usageGen(principal[0], Sc) : '';
    const secondaires = inc.some(x => x.genre === 'pompe' && !x.variante && !det(x).primaire && !det(x).sanitaire && (det(x).circuit || nombre(x.Q) > 0));
    inc.filter(x => x.genre === 'tampon' || (x.genre === 'ecs' && !x.horsSchema)).forEach(x => {
      const fl = det(x).fluide;
      if (schema && x.genre === 'tampon' && (fl || 'chaud') !== schema) return;
      if (schema && x.genre === 'ecs' && schema === 'froid') return;
      if (x.genre === 'tampon' && fl && uP && uP !== 'mixte' && fl !== uP) { alertes.push(`${x.designation} : ballon ${fl === 'froid' ? 'd\'eau glacée' : 'd\'eau chaude'}, à placer dans le schéma ${fl === 'froid' ? 'froid' : 'chaud'}.`); return; }
      const V = nombre((x.carac || {}).volume);
      // Ballon tampon d'une production à pompes secondaires (circuits pompés derrière lui) : découplage
      const fct = x.genre === 'ecs' ? 'ecs' : ['decouplage', 'stockage'].includes(det(x).ballon) ? det(x).ballon : secondaires && !e.bouteille ? 'decouplage' : 'tampon';
      if (fct === 'decouplage' && (!e.bouteille || e.bouteille === 'ballon')) { e.bouteille = 'ballon'; if (V > 0) e.Vtampon = V; else alertes.push(`${x.designation.slice(0, 70)} : ballon de découplage, volume à saisir (Vtampon).`); return; }
      const c = fct === 'ecs' ? (e.circuits || []).find(z => z._x === x) || (e.circuits || []).find(z => z.emetteur === 'ecs') : null;
      ballons.push({ rep: x.repere || '', fonction: fct, V: V > 0 ? V : '', position: c ? `circuit:${c.rep}` : 'production', piquages: '', sondes: '' });
    });
    if (ballons.length) e.ballons = ballons;
    return e;
  }
  // Entrées du schéma : générateur principal (le genre le plus représenté), nombre et puissance unitaire, un circuit par émetteur
  // opts (schémas séparés chaud / froid, voir versSchemas) : fluides (natures de réseaux reprises), schema ('chaud' |
  // 'froid' : ballons, émetteurs et pompes de ce fluide seulement)
  function versSchema(inventaire, Sc, reseaux = [], opts = {}) {
    const inc = inventaire.filter(x => x.inclus !== false), alertes = [];
    const prod = inc.filter(x => x.categorie === 'producteur');
    const parGenre = {}, det = x => x.details || {};
    // Générateur principal : le plus représenté, hors appoint, relève, secours et récupération quand il y en a d'autres
    const secondaire = x => ['appoint', 'releve', 'secours', 'recuperation'].includes(det(x).role);
    const prodBase = prod.some(x => !secondaire(x)) ? prod.filter(x => !secondaire(x)) : prod;
    prodBase.forEach(x => { parGenre[x.genre] = (parGenre[x.genre] || 0) + (nombre(x.qte) || 1); });
    const principal = Object.entries(parGenre).sort((a, b) => b[1] - a[1])[0];
    prod.filter(x => !prodBase.includes(x)).forEach(x => { if (!parGenre[x.genre]) parGenre[x.genre] = 0; });
    const e = {};
    if (principal) {
      const p = prodBase.find(x => x.genre === principal[0]);
      e.generateur = Sc.GENERATEURS[principal[0]] ? principal[0] : 'chaudiere-cond';
      e.nGen = String(Math.min(6, Math.max(1, principal[1])));
      if (Number.isFinite(nombre(p.P)) && nombre(p.P) > 0) e.Pgen = nombre(p.P);
      e.titreInstallation = p.designation.slice(0, 60);
      if (Object.keys(parGenre).length > 1 && !generateursDetailles(prod, principal[0], Sc)) alertes.push(`Plusieurs types de producteurs (${Object.keys(parGenre).map(g => GENRES[g].libelle).join(', ')}) : le schéma reprend le plus représenté ; ajoutez un second schéma pour les autres.`);
      if (principal[1] > 6) alertes.push(`${principal[1]} générateurs : le schéma est limité à une cascade de 6.`);
    } else alertes.push('Aucun producteur reconnu : choisissez le générateur dans le schéma.');
    // Régime du réseau : celui cité pour le producteur, sinon le plus fréquent
    const reg = (prod.find(x => x.regime) || inc.find(x => x.regime) || {}).regime;
    if (reg) {
      const [d, r] = reg.split('/').map(Number), k = Object.entries(Sc.REGIMES).find(([, v]) => v[1] === d && v[2] === r);
      if (k) e.reseau = k[0]; else { e.reseau = 'perso'; e.Tdep = d; e.Tret = r; }
    } else if (principal && /^gf/.test(principal[0])) e.reseau = 'eg-7-12';
    else if (principal && principal[0] === 'pac-rev') e.reseau = 'co';
    // Production réversible (PAC « chauffage / climatisation », régimes chaud et froid cités) : change-over
    const pp = principal && prod.find(x => x.genre === principal[0]), rev = pp && /^pac/.test(pp.genre) && (pp.genre === 'pac-rev' || pp.alim === 'change-over' || ((pp.carac || {}).regimeChaud && (pp.carac || {}).regimeFroid));
    if (rev) { e.reseau = 'co'; delete e.Tdep; delete e.Tret; }
    // ECS électrique ou solaire : pas un circuit de la production
    inc.filter(x => x.horsSchema).forEach(x => alertes.push(`${x.designation} : ${x.horsSchema}, hors schéma hydraulique${x.horsSchema === 'ECS électrique' ? ' (repris dans l\'alimentation électrique)' : ''}.`));
    const em = inc.filter(x => x.categorie === 'emetteur' && Sc.EMETTEURS[x.genre] && !x.horsSchema && (!opts.schema || emetteurDe(x, opts.schema, new Map((reseaux || []).map(r => [r.id, r])))));
    // Réseaux hydrauliques reconnus (hors plomberie, ECS sanitaire traitée comme un émetteur) : un circuit par réseau,
    // avec ses émetteurs (puissance cumulée), son régime et la longueur de ses tuyauteries
    // Réseaux du fluide de la production : eau chaude (et ECS) pour une chaudière ou une PAC, eau glacée pour un groupe
    // froid, les deux en change-over (PAC réversible)
    const fluide = opts.fluides || (e.reseau === 'co' || rev ? ['chauffage', 'ecs', 'eau-glacee', 'change-over'] : (principal && /^gf/.test(principal[0])) || /^eg/.test(e.reseau || '') ? ['eau-glacee'] : ['chauffage', 'ecs', 'change-over']);
    // Tronçons primaires (production → ballon tampon ou collecteur) : liaison de la production, pas un circuit
    const primaires = (reseaux || []).filter(r => r.hydro && estPrimaire(r));
    if (primaires.length) alertes.push(`Tronçons primaires (liaison de la production, pas des circuits) : ${primaires.map(r => `« ${r.nom} »${r.L ? ` ${Math.round(r.L)} m` : ''}`).join(', ')}.`);
    const parId = new Map((reseaux || []).map(r => [r.id, r])), hydro = (reseaux || []).filter(r => r.hydro && fluide.includes(r.nature) && !primaires.includes(r));
    if (!opts.schema) (reseaux || []).filter(r => r.hydro && r.nature !== 'vapeur' && !fluide.includes(r.nature) && !primaires.includes(r)).forEach(r => alertes.push(`Réseau « ${r.nom} » (${(NATURE[r.nature] || {}).libelle || r.nature}) : autre fluide que la production principale, à traiter dans un second schéma.`));
    // Réseau d'ECS sans ballon alimenté par la production (ballons électriques ou solaires) : pas un circuit
    const circuitsReseaux = hydro.filter(r => r.nature !== 'ecs' || em.some(x => x.reseau === r.id) || !inc.some(x => x.genre === 'ecs' && x.horsSchema)).map(r => {
      const ems = em.filter(x => x.reseau === r.id);
      const dominant = ems.length ? ems.reduce((m, x) => ((nombre(x.qte) || 1) > (nombre(m.qte) || 1) ? x : m), ems[0]).genre : genreReseau(r.nom);
      const emet = Sc.EMETTEURS[dominant] ? dominant : r.nature === 'ecs' ? 'ecs' : r.nature === 'eau-glacee' ? 'ventilo' : 'radiateurs';
      const froid = r.nature === 'eau-glacee' || (r.nature === 'change-over' && ((principal && /^gf/.test(principal[0])) || opts.schema === 'froid'));
      const Ps = ems.map(x => { const P = pTherm(x, froid), q = nombre(x.qte) || 1; return Number.isFinite(P) && P > 0 ? P * q : NaN; });
      const P = Ps.length && Ps.every(Number.isFinite) ? Math.round(Ps.reduce((s, v) => s + v, 0) * 10) / 10 : nombre(r.P) > 0 ? nombre(r.P) : '';
      if (P === '') alertes.push(`Réseau « ${r.nom} » : puissance ${ems.length ? 'de certains émetteurs' : 'des émetteurs'} non trouvée, à saisir dans le schéma.`);
      // Montage du circuit : celui du réseau (« circuit plancher en injection »), sinon celui de ses émetteurs
      const mt = montageCircuit(r.montage || (ems.find(x => det(x).montage) ? det(ems.find(x => det(x).montage)).montage : ''), emet, Sc);
      return { rep: r.nom.slice(0, 40), emetteur: emet, P, regime: r.regime && r.regime !== reg ? r.regime : '', regulation: mt, L: r.L > 0 ? Math.round(r.L) : 50, reseau: r.id };
    });
    // Émetteurs hors réseau reconnu : un circuit chacun ; ceux d'un réseau d'un autre fluide ne sont pas repris ici
    const sansReseau0 = em.filter(x => !x.reseau || !parId.has(x.reseau) || estPrimaire(parId.get(x.reseau)) || (!parId.get(x.reseau).hydro && !['soufflage', 'reprise', 'extraction', 'air-neuf'].includes(parId.get(x.reseau).nature)));
    // Émetteur sans réseau quand un circuit de distribution porte son nom (« Circuits de distribution radiateurs ») : sur ce
    // circuit (sa puissance s'y ajoute), pas un circuit de plus
    const parGenreEm = new Map();
    const sansReseau = sansReseau0.filter(x => {
      const motEm = { ventilo: /ventilo|cassette/, radiateurs: /radiateur/, plancher: /plancher/, aerotherme: /aerotherme/ }[x.genre];
      const c = circuitsReseaux.find(z => z.emetteur === x.genre && (classer(parId.get(z.reseau).nom) || {}).genre === x.genre) || circuitsReseaux.find(z => z.emetteur === x.genre)
        // Circuit dont le réseau nomme l'émetteur (« distribution ventilo-convecteurs … et CTA ») même s'il dessert aussi des CTA
        || (motEm && circuitsReseaux.find(z => motEm.test(norm(parId.get(z.reseau).nom))));
      if (!c) {
        // Plusieurs lignes du même émetteur (ventilos par taille, radiateurs par type) : un seul circuit pour elles
        const g = parGenreEm.get(x.genre);
        if (!g) { parGenreEm.set(x.genre, { x, autres: [] }); return true; }
        g.autres.push(x); return false;
      }
      const P = pTherm(x, opts.schema === 'froid' || parId.get(c.reseau).nature === 'eau-glacee'), q = nombre(x.qte) || 1;
      if (Number.isFinite(P) && P > 0 && (c.P === '' || c._ems)) c.P = Math.round(((c._ems ? c.P : 0) + P * q) * 10) / 10;
      c._ems = true;
      return false;
    });
    e.circuits = [...circuitsReseaux, ...sansReseau.map(x => {
      // Puissance citée = puissance unitaire (« aérotherme 25 kW », quantité 4 → circuit de 100 kW) ; lignes du même émetteur cumulées
      const fr = opts.schema ? opts.schema === 'froid' : fluide.length === 1 && fluide[0] === 'eau-glacee', grp = [x, ...((parGenreEm.get(x.genre) || {}).x === x ? parGenreEm.get(x.genre).autres : [])];
      const Ps = grp.map(y => { const P = pTherm(y, fr); return Number.isFinite(P) && P > 0 ? P * (nombre(y.qte) || 1) : NaN; });
      const q = grp.reduce((t, y) => t + (nombre(y.qte) || 1), 0), total = Ps.every(Number.isFinite) ? Math.round(Ps.reduce((t, v) => t + v, 0) * 10) / 10 : '';
      if (grp.length > 1) return { rep: `${(GENRES[x.genre] || { libelle: x.genre }).libelle} (×${q})`.slice(0, 40), emetteur: x.genre, P: total, regime: x.regime && x.regime !== reg ? x.regime : '', regulation: montageCircuit((x.details || {}).montage, x.genre, Sc), L: 50, _x: x };
      return { rep: `${x.designation.slice(0, 40)}${q > 1 && !/^\d/.test(x.designation) ? ` (×${q})` : ''}`, emetteur: x.genre, P: total, regime: x.regime && x.regime !== reg ? x.regime : '', regulation: montageCircuit(det(x).montage, x.genre, Sc), L: 50, _x: x };
    })];
    completerSchema(e, { inc, prod, principal, reg, Sc, alertes, rev, schema: opts.schema });
    pompesCircuits(e, inc, opts.schema, Sc, alertes, parId);
    e.circuits.forEach(c => { delete c._x; delete c._ems; });
    sansReseau.filter(x => !Number.isFinite(pTherm(x, false))).forEach(x => alertes.push(`${x.designation} : puissance non trouvée, à saisir dans le schéma.`));
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
    // Centrales de traitement d'air : un calcul « CTA » chacune (batteries, récupérateur, débits, puissances lues)
    const ctas = inc.filter(x => x.genre === 'cta').map(versCta);
    return { entrees: e, alertes, ctas };
  }

  /* ---------- Vers le calcul d'une CTA ---------- */
  // Entrées du calcul « Centrale de traitement d'air » (cta.js) : type, débits, récupérateur et son efficacité, batteries à
  // eau (champ « froid » : oui, non, froide, co, aucune) et électrique (« batElec »), puissances saisies, régimes, tension
  function versCta(x) {
    const d = x.details || {}, c = x.carac || {}, b = d.batteries || {}, t = norm(`${x.designation} ${x.chapitre || ''}`), e = {};
    e.type = /simple flux|soufflage seul|air neuf seul|insufflation/.test(t) ? 'simple' : /melange|recycl/.test(t) ? 'melange' : 'double';
    const Q = nombre(x.Q);
    if (Q > 0) { e.Qs = Q; if (e.type !== 'simple') e.Qr = Q; }
    if (e.type === 'double' && d.recuperateur) e.recup = d.recuperateur;
    if (e.type === 'double' && Number.isFinite(c.rendement) && d.recuperateur !== 'aucun') e.eta = c.rendement;
    const froid = b.co ? 'co' : b.chaude && b.froide ? 'oui' : b.chaude ? 'non' : b.froide ? 'froide' : b.elec ? 'aucune'
      : { 'change-over': 'co', 'eau-glacee': 'froide', chauffage: 'non', electrique: 'aucune' }[x.alim];
    if (froid) e.froid = froid;
    const batElec = b.elec || (x.alim === 'electrique' ? 'chaude' : '');
    if (batElec) e.batElec = batElec;
    const P = nombre(x.P), Pfr = nombre(x.Pfr), bc = !['froide', 'aucune'].includes(e.froid || 'oui'), bf = !['non', 'aucune'].includes(e.froid || 'oui');
    // Puissances du CCTP / DPGF : saisies (fiche) plutôt que recalculées depuis les conditions de base
    if ((P > 0 && (bc || batElec === 'chaude')) || (Pfr > 0 && bf)) {
      e.modeP = 'saisie';
      if (P > 0 && (bc || batElec === 'chaude')) e.PchaudS = P;
      if (Pfr > 0 && bf) e.PfroidS = Pfr;
    }
    if (d.PelBe > 0) e.PelBe = d.PelBe; else if (batElec === 'chaude' && nombre(x.Pel) > 0) e.PelBe = nombre(x.Pel);
    if (c.tension) e.tensionCta = c.tension === '400 V' ? 'tri' : 'mono';
    if (Number.isFinite(c.Pdispo)) e.dpReseauS = c.Pdispo;
    const rc = /^(\d+)\/(\d+)$/.exec(c.regimeChaud || ''), rf = /^(\d+)\/(\d+)$/.exec(c.regimeFroid || '');
    if (rc && bc) { e.TcAller = +rc[1]; e.TcRetour = +rc[2]; }
    if (rf && bf) { e.TfAller = +rf[1]; e.TfRetour = +rf[2]; }
    return { titre: `CTA — ${x.repere ? `${x.repere} ` : ''}${x.designation}`.slice(0, 80), entrees: e, sources: x.sources || [], src: x.id || '' };
  }

  /* ---------- Vers le calcul des terminaux ---------- */
  // Appareils du calcul « Terminaux » (terminaux.js), un par unité : type, local, puissances, batterie, vanne, référence
  const TERM_MAX = 60;
  function versTerminaux(inventaire) {
    const inc = (inventaire || []).filter(x => x.inclus !== false && !x.variante), alertes = [], appareils = [], compteur = {};
    const liste = inc.filter(x => ['ventilo', 'split', 'aerotherme', 'plafond', 'radiateurs'].includes(x.genre)), qte = x => Math.max(1, Math.round(nombre(x.qte) || 1));
    // Au-delà de TERM_MAX appareils, une part pour chaque ligne du dossier (au prorata, au moins un) plutôt que les premières
    const total = liste.reduce((s, x) => s + qte(x), 0), quota = new Map(liste.map(x => [x, total > TERM_MAX ? Math.max(1, Math.floor(qte(x) * TERM_MAX / total)) : qte(x)]));
    while ([...quota.values()].reduce((s, v) => s + v, 0) > TERM_MAX) { const [x] = [...quota.entries()].sort((a, b) => b[1] - a[1])[0]; quota.set(x, quota.get(x) - 1); }
    // Places restantes : aux lignes les moins détaillées (en proportion)
    while (total > TERM_MAX && [...quota.values()].reduce((s, v) => s + v, 0) < TERM_MAX) { const [x] = [...quota.entries()].filter(([y, v]) => v < qte(y)).sort((a, b) => a[1] / qte(a[0]) - b[1] / qte(b[0]))[0]; quota.set(x, quota.get(x) + 1); }
    liste.forEach(x => {
      const d = x.details || {}, t = norm(x.designation), q = quota.get(x);
      const type = x.genre === 'split' ? 'split' : x.genre === 'aerotherme' ? (/rideau/.test(t) ? 'rideau' : 'aerotherme') : x.genre === 'plafond' ? 'poutre' : x.genre === 'radiateurs' ? (x.alim === 'electrique' ? 'radElec' : 'radiateur')
        : /cassette/.test(t) || d.forme === 'cassette' ? (d.tubes === '4t' ? 'cassette4' : 'cassette2') : /gainable/.test(t) || d.forme === 'gainable' ? 'gainable' : d.tubes === '4t' ? 'vc4' : 'vc2';
      const P = nombre(x.P), Pfr = nombre(x.Pfr);
      const be = (d.batteries || {}).elec;
      // Radiateur à eau : batterie chaude (jamais 2 tubes) ; radiateur électrique : électrique
      const batterie = type === 'split' ? 'aucune' : x.alim === 'electrique' || type === 'radElec' ? 'elec' : type === 'radiateur' ? 'chaude' : d.tubes === '4t' ? '4t' : d.tubes === '2t' && (d.fils2 || be) ? 'froide+elec' : d.tubes === '2t' || x.alim === 'change-over' ? '2t'
        : x.alim === 'eau-glacee' || (Pfr > 0 && !(P > 0)) ? 'froide' : x.alim === 'chauffage' || ['aerotherme', 'radiateur', 'rideau'].includes(type) || !(Pfr > 0) ? 'chaude' : '2t';
      const vanne = ['radiateur', 'radElec'].includes(type) ? 'aucune' : ['2v', '3v', '4v'].includes(d.montage) ? d.montage : '2v';
      const pre = x.repere ? x.repere.replace(/[-_. ]?\d+$/, '') : { split: 'SPL', aerotherme: 'AT', rideau: 'RA', poutre: 'PF', radiateur: 'R' }[type] || (/cassette/.test(type) ? 'CA' : 'VC');
      if (q < qte(x)) alertes.push(`${x.designation} : ${q} appareil(s) détaillé(s) sur ${qte(x)} (limite de ${TERM_MAX} lignes), les autres à ajouter dans le calcul des terminaux.`);
      const ref = [d.marque, d.reference].filter(Boolean).join(' ');
      for (let k = 0; k < q; k++) {
        compteur[pre] = (compteur[pre] || 0) + 1;
        appareils.push({ rep: x.repere && q === 1 ? x.repere : `${pre}-${String(compteur[pre]).padStart(2, '0')}`, local: x.local || d.local || '', zone: '', type,
          Pch: P > 0 ? P : '', Pfr: Pfr > 0 ? Pfr : '', batterie, vanne, ...(nombre(x.Pel) > 0 && nombre(x.Pel) < 3 && type !== 'radElec' ? { Pvent: Math.round(nombre(x.Pel) * 1000) } : {}),
          ...(d.PelBe > 0 ? { Pbe: d.PelBe } : type === 'radElec' && nombre(x.Pel) > 0 ? { Pbe: nombre(x.Pel) } : {}), ...((x.carac || {}).tension ? { tension: x.carac.tension === '400 V' ? 'tri' : 'mono' } : {}), ref });
      }
      if (!(P > 0) && !(Pfr > 0) && type !== 'split') alertes.push(`${x.designation} : puissances non trouvées, à saisir.`);
      if (!x.local && !d.local) alertes.push(`${x.designation} : locaux non précisés au dossier, à compléter.`);
    });
    return { appareils, alertes };
  }

  /* ---------- Vers la régulation ---------- */
  // Marque de l'automate, supervision (GTB) et bus des équipements lus dans le dossier : entrées du calcul « elec »
  function versRegulation(inventaire) {
    const out = {}, sources = {};
    (inventaire || []).filter(x => x.inclus !== false && !x.variante && (x.details || {}).regulation).forEach(x => {
      const r = x.details.regulation, src = (x.sources || [])[0] || '';
      [['marque', 'marqueAutomate'], ['gtb', 'gtb'], ['bus', 'busEquip'], ['techno', 'techno']].forEach(([k, c]) => { if (r[k] && out[c] === undefined) { out[c] = r[k]; sources[c] = src; } });
    });
    return { entrees: out, sources };
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
  const PREFIXES = { pac: 'PAC', generateur: 'G', cta: 'CTA', ventilo: 'VC', aerotherme: 'AT', split: 'SP', pompe: 'P', vanne: 'VM', ventilateur: 'V', resistance: 'BEC' };
  function versElec(inventaire) {
    const out = [];
    // Ballon ECS électrique : résistance (puissance électrique citée, sinon 2,4 kW jusqu'à 300 L)
    const compteur = {};
    const elecDe = x => ((x.genre === 'ecs' || ['radiateurs', 'aerotherme', 'radiant'].includes(x.genre)) && x.alim === 'electrique' ? ['resistance', nombre(x.Pel) > 3.5 ? 'tri' : 'mono', 'tor'] : ELEC[x.genre]);
    inventaire.filter(x => x.inclus !== false && elecDe(x)).forEach((x, i) => {
      const [type, tension0, regulation] = elecDe(x), q = Math.max(1, Math.round(nombre(x.qte) || 1)), P = nombre(x.P), Pel = nombre(x.Pel);
      // Puissance électrique lue au CCTP (absorbée, moteur, batterie électrique), sinon estimée d'après la puissance thermique
      // Batterie électrique d'une CTA lue à part (« batterie électrique de préchauffage 6 kW ») : une ligne à elle, la
      // puissance électrique de la CTA n'est plus la sienne quand c'est la même valeur
      const PelBe = x.genre === 'cta' ? nombre((x.details || {}).PelBe) : NaN, PelSeule = PelBe > 0 && Pel === PelBe ? NaN : Pel;
      const Pfr = nombre(x.Pfr), eer = nombre((x.carac || {}).EER);
      const Pe = Number.isFinite(PelSeule) && PelSeule > 0 ? PelSeule : type === 'resistance' ? ((x.carac || {}).volume > 300 ? 3.6 : 2.4)
        : /^gf/.test(x.genre) && Pfr > 0 ? Math.round(Pfr / (eer > 1 ? eer : 3) * 10) / 10 : (PELEC[type] || (() => ''))(Number.isFinite(P) ? P : 0);
      const tension = (x.carac || {}).tension === '400 V' && tension0 === 'mono' && type !== 'vanne' ? 'tri' : (x.carac || {}).tension === '230 V' && tension0 === 'tri' && !(Pe > 3) ? 'mono' : tension0;
      const base = { type, tension, regulation, designation: x.designation.slice(0, 60), depart: type === 'ventilateur' ? 'variateur' : undefined };
      // Repère : celui du CCTP, sinon préfixe du type numéroté (VC-01, VC-02…)
      const pre = x.repere || PREFIXES[type] || 'EQ', suite = () => { compteur[pre] = (compteur[pre] || 0) + 1; return `${pre}-${String(compteur[pre]).padStart(2, '0')}`; };
      if (q <= 10) for (let k = 1; k <= q; k++) out.push({ src: `inv:${x.id || i}:${k}`, rep: x.repere && q === 1 ? x.repere : x.repere ? `${pre}-${String(k).padStart(2, '0')}` : suite(), ...base, P: Pe });
      else out.push({ src: `inv:${x.id || i}`, rep: `${pre} ×${q}`, ...base, designation: `${base.designation} (×${q})`, P: Pe === '' ? '' : Math.round(Pe * q * 100) / 100 });
      if (PelBe > 0) for (let k = 1; k <= Math.min(q, 10); k++) out.push({ src: `inv:${x.id || i}:be${k}`, rep: `${x.repere && q === 1 ? x.repere : `${pre}-${String(k).padStart(2, '0')}`}-BE`, type: 'resistance', tension: PelBe > 3.5 ? 'tri' : 'mono', regulation: 'tor', designation: `Batterie électrique ${{ prechauffage: 'de préchauffage', appoint: 'd\'appoint' }[((x.details || {}).batteries || {}).elec] || ''} — ${x.designation}`.replace('  ', ' ').slice(0, 60), P: PelBe });
    });
    return out;
  }

  return { depuisFeuilles, numeroEnTete, ecarts, ecartsTexte, LIB_ECART, cleRegle, appliquerRegles, apprendre, tableauEquipements, fusionnerAnnexe, caracteristiques, caracTexte, puissances, alimentation, rattacher, NATURES, NATURE, natureReseau, estReseau, reseauxCctp, fusionnerReseaux, REGLES, GENRES, classer, puissance, regime, debitAir, depuisCctp, depuisDpgf, depuisDpgfTexte, fusionner, versSchema, versSchemaAir, versElec, norm, details, provenance, aVerifier, valeurChamp, CHAMPS, LIB_CHAMP, versCta, versTerminaux, versRegulation, montageCircuit, versSchemas, estPrimaire };
})();
if (typeof module !== 'undefined') module.exports = InventaireCVC;
