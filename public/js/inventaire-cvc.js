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
    // Avant les PAC (« échangeur … rejet PAC », « circuit pompe rejet PAC ») : l'accessoire n'est pas la PAC
    [/echangeur[^.]*(?:nappe|captage|forage|geotherm|piscine|process)|(?:nappe|captage)[^.]*echangeur/, 'auxiliaire', 'echangeur-aux', 'Échangeur (nappe, process)'],
    [/^circuits? (?:de )?pompes?|pompes? (?:de |du )?(?:rejet|circulation|distribution|relevage|charge)/, 'auxiliaire', 'pompe', 'Pompe'],
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
    [/regulation|automate|\bgtb\b|\bgtc\b|sonde|armoire electrique|pilotage/, 'auxiliaire', 'regulation', 'Régulation, armoire'],
  ];
  // Lignes qui ne sont pas des équipements (même si elles en citent un) : tuyauteries, calorifuge, essais, études…
  // Mots entiers (« plans » ne doit pas écarter « plancher chauffant »)
  const EXCLU = /^(?:tuyauteries?|reseaux?|calorifug\w*|isolation|fourreaux?|supports?|supportage|essais?|mise en service|etudes?|plans?|doe|dossier|nettoyage|depose|demontage|reperage|peinture|formation|garantie|maintenance|raccordements?|alimentation electrique|cablage|liaisons?|percements?|manutention|charges? frigorifiques?|chemins? de cables?|pieces? d'adaptation|ensemble des|trappes?|cadres?|bacs?|plenums?|manchettes?|a partir de|conteneurs?|moyens? de levage|repli|operations? de reception)\b/;
  // Accessoires d'un équipement (« Accessoires Pompe à chaleur », « Supportage CTA », « Batterie électrique CTA »…) : jamais
  // l'équipement lui-même ; la régulation et l'armoire restent des auxiliaires
  const ACCESSOIRE = /^(?:accessoires?|armoires?(?: electriques?)?|regulations?|gtc|gtb|pilotage|bouclage|equipements? externes?|commande deportee|batterie electrique|pieges? a son|registres?|clapets?|remplissage|vannes? (?:de sectionnement|de reglage|generales?)|raccordement|by-?pass|clarificateur|compteurs?|grilles? de rejet)\b/;
  // Variantes, options, moins-values : chiffrées à part, pas l'installation de base
  const VARIANTE = /\b(?:variantes?|options?|moins[- ]?values?|plus[- ]?values?|pse|prestations? supplementaires?)\b/;
  const GENRES = Object.fromEntries(REGLES.map(r => [r[2], { categorie: r[1], libelle: r[3] }]));
  function classer(texte) {
    const t = norm(texte).replace(/^(?:(?:moins|plus)[- ]?values?\s*:?\s*)/, '').replace(/^(?:fourniture,? (?:et |& )?pose (?:de |d'|du |des )?(?:la |le |l'|les )?)/, '');
    if (!t || EXCLU.test(t)) return null;
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
  function puissances(texte) {
    // « 2200W » compte aussi (en kW)
    const t = String(texte || ''), out = {}, re = /(\d+(?:[.,]\d+)?)(?:\s*(?:à|-)\s*(\d+(?:[.,]\d+)?))?\s*(k?)w(c|f|th|e)?\b/gi;
    let m;
    while ((m = re.exec(t))) {
      if (!m[3] && !/^\d{3,5}$/.test(m[1])) continue;
      const v = Math.max(nombre(m[1]), m[2] ? nombre(m[2]) : 0) / (m[3] ? 1 : 1000);
      // Mots qui précèdent dans la même phrase / le même membre (« Puissance froid : », « batterie électrique de »)
      const avant = norm(t.slice(Math.max(0, m.index - 80), m.index)).split(/[.;|•]\s|,\s|\s-\s|\n/).pop();
      const suf = String(m[4] || '').toLowerCase();
      const k = suf === 'e' || /absorb|electri|moteur|ventilateur|consomm|\bp1\b|resistance|appoint|\belec\b/.test(avant) ? 'Pel'
        : suf === 'f' || /froid|frigorifique|refroidissement|rafraichissement|eau glacee|climatisation|\bclim\b|sensible|latente/.test(avant) ? 'Pfr'
          : /chaud|calorifique|chauffage|\bcalo\b|thermique|restitu|condensation/.test(avant) ? 'Pch' : 'P';
      if (Number.isFinite(v) && v > 0 && out[k] === undefined) out[k] = v;
    }
    return out;
  }
  const nbr = s => nombre(String(s).replace(/\s/g, ''));
  const FRIGO = /\br[ -]?(32|410a|454b|290|134a|513a|1234ze|1234yf|744|407c|452b|448a|449a|600a)\b/;
  function caracteristiques(texte) {
    const t = String(texte || ''), x = norm(t), c = puissances(t);
    // Débit d'air annoncé « débit … » (le maxi d'une plage « 1490 / 2560 m³/h »), sinon le premier cité
    let m = /debit[^0-9.]{0,40}?(\d[\d\s]{0,6}(?:[.,]\d+)?)(?:\s*\/\s*(\d[\d\s]{0,6}))?\s*m(?:3|³)\s*\/\s*h/.exec(x);
    if (m) c.Q = nbr(m[2] || m[1]); else { const q = debitAir(t); if (Number.isFinite(q)) c.Q = q; }
    m = /pression (?:disponible|statique(?: disponible| externe)?|utile|externe|totale disponible)[^0-9]{0,25}(\d{2,4})\s*pa\b/.exec(x); if (m) c.Pdispo = +m[1];
    m = /(?:hmt|hauteur manometrique)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(mce|kpa|m\b)/.exec(x); if (m) c.HMT = m[2] === 'kpa' ? Math.round(nombre(m[1]) / 9.81 * 10) / 10 : nombre(m[1]);
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
    m = /(\d{2,5})\s*litres?\b/.exec(x) || /(?:capacite|volume|contenance|ballon|stockage|cuve|tampon)[^0-9]{0,25}(\d{2,5})\s*l\b(?!\s*\/)/.exec(x); if (m) c.volume = +m[1];
    return c;
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
  const puissancesItem = (c, genre) => {
    const gf = /^gf/.test(genre || ''), P = Number.isFinite(c.Pch) ? c.Pch : Number.isFinite(c.P) && !gf && !Number.isFinite(c.Pfr) ? c.P : NaN;
    return { P, Pfr: Number.isFinite(c.Pfr) ? c.Pfr : gf && Number.isFinite(c.P) ? c.P : NaN, Pel: Number.isFinite(c.Pel) ? c.Pel : NaN };
  };

  // Alimentation d'un émetteur : par quel fluide il est alimenté (texte de l'article, chapitres) — eau (batterie à eau,
  // raccordé à la PAC), change-over, eau chaude, eau glacée ; ou électrique / solaire (ballon ECS autonome, CTA à batterie
  // électrique seule) : ceux-là ne sont pas des circuits de la production
  function alimentation(texte, genre) {
    const x = norm(texte);
    const eau = /batteries? (?:a eau|hydrauliques?|eau chaude|eau glacee|chaude a eau|froide a eau|change.?over)|raccorde\w* (?:a|au|sur) (?:la |le |l'|une |un )?(?:pac|pompe a chaleur|chaudiere|groupe|reseau|production|sous.?station)|accessoires? hydrauliques?|vannes? (?:2|3|deux|trois) voies|serpentin|echangeur (?:a plaques )?primaire|circuit primaire/;
    if (genre === 'ecs') {
      if (/solaire/.test(x) && !/raccorde\w* (?:a|au|sur) (?:la |le |l'|une |un )?(?:pac|pompe a chaleur|chaudiere|reseau|production)/.test(x)) return 'solaire';
      if (eau.test(x)) return 'eau';
      return /electrique|thermodynamique|instantane|resistance|chauffe.?eau/.test(x) ? 'electrique' : '';
    }
    const fr = /eau glacee|batteries? froides?|\b[67] ?\/ ?1[12]\b|rafraichissement/.test(x), ch = /eau chaude|batteries? chaudes?|\b(?:35|40|45|50|55|60|70|80|90) ?\/ ?\d{2} ?°?c/.test(x);
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
    ['plomberie', 'Plomberie (eau froide, évacuations)', /eaux? (?:usees|vannes|pluviales)|evacuations?|\b(?:eu|ev|ep|eg|eug|efa)\b|eau froide sanitaire|\bef\b|eau de ville|adduction|incendie|\bria\b|\bgaz\b|condensats? (?:cta|de|des|pvc|clim)|reseaux? condensats?/, false],
    ['captage', 'Eau de nappe / captage (primaire de la PAC)', /nappe|captage|forage|geotherm|sondes? geothermiques?/, true],
    ['ecs', 'Eau chaude sanitaire', /eau chaude sanitaire|\becs\b|bouclage|\bbecs\b|\bec\b|\bpremix\b/, true],
    ['desenfumage', 'Désenfumage', /desenfumage/, false],
    ['soufflage', 'Soufflage', /soufflage|insufflation|air traite|air souffle/, false],
    ['reprise', 'Reprise', /reprise|air repris/, false],
    ['extraction', 'Extraction', /extraction|\bvmc\b|air vicie/, false],
    ['air-neuf', 'Air neuf / rejet', /air neuf|prise d'air|rejet/, false],
    ['vapeur', 'Vapeur et condensats', /vapeur/, true],
    ['change-over', 'Eau chaude / eau glacée (change-over)', /change.?over|2 tubes reversibles?|reversible|chauffage ?\/ ?climatisation|eau chaude ?\/ ?eau glacee|chaud ?\/ ?froid/, true],
    ['eau-glacee', 'Eau glacée', /eau glacee|eau froide (?:de )?(?:climatisation|cta)|\beg\b|eau de refroidissement|\bfroid\b|rafraichissement|7 ?\/ ?12|6 ?\/ ?12/, true],
    ['chauffage', 'Chauffage (eau chaude)', /chauffage|eau chaude|radiateurs?|plancher chauffant|aerothermes?|ventilo|calorifique|\d{2} ?\/ ?\d{2} ?°?c/, true],
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
  const estReseau = texte => { const x = norm(texte).replace(/^[\d.\s-]+/, ''); return MOT_RESEAU.test(x) && !!natureReseau(x) && !/^(?:essais?|calorifug|isolation|depose|mise en service|nettoyage)/.test(x) && !ACCESSOIRE.test(x) && !VARIANTE.test(x); };
  // Titre de chapitre de réseau : mot de réseau dans les premiers mots (« Distribution tuyauterie », « Réseau d'extraction »)
  const titreReseau = texte => { const x = norm(texte).replace(/^[\d.\s-]+/, ''); return MOT_RESEAU.test(x.split(' ').slice(0, 3).join(' ')) && !ACCESSOIRE.test(x) && !VARIANTE.test(x) && !/^(?:essais?|calorifug|isolation|depose)/.test(x); };
  const idReseau = nom => norm(nom).replace(/^[\d.\s-]+/, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
  // Longueur et diamètre des tuyauteries / gaines d'un réseau (lignes « ml » du DPGF)
  const estTube = (des, unite) => /^(?:ml|m)$/.test(norm(unite)) || /\b(?:tubes?|tuyau|tuyauteries?|canalisations?|gaines?|conduits?)\b/.test(norm(des));
  const dnDe = des => { const x = norm(des); const m = /\bdn ?(\d{2,3})\b/.exec(x) || /\b(\d{2,3}(?:[.,]\d)?) ?x ?\d(?:[.,]\d+)?\b/.exec(x) || /ø ?(\d{2,4})/.exec(String(des || '').toLowerCase()); return m ? nombre(m[1]) : NaN; };
  function nouveauReseau(nom, source, texte = '') {
    // La nature du titre prime (« Réseau d'extraction / rejet » dont le texte parle aussi de reprise)
    const nature = natureReseau(nom) || natureReseau(`${nom} ${texte}`);
    return { id: idReseau(nom), nom: String(nom).replace(/^[\d.\s-]+/, '').trim().slice(0, 80), nature, hydro: !!(NATURE[nature] || {}).hydro, regime: regime(`${nom} ${texte}`), L: 0, dnMax: NaN, sources: [source] };
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
    return tous.filter(a => !a.general && titreReseau(a.titre) && natureSure(a) && !enVariante(a) && !/^(?:essais?|calorifug|isolation|depose|mise en service|nettoyage)/.test(norm(a.titre))).map(a => {
      const r = { ...nouveauReseau(a.titre, `CCTP art. ${a.num}`, a.texte || ''), nature: natureSure(a) }, parent = parentDe(a.num, titres);
      r.hydro = !!(NATURE[r.nature] || {}).hydro;
      return { ...r, id: parent ? `${r.id} @ ${idReseau(parent)}` : r.id, chapitre: parent ? String(parent).trim().slice(0, 80) : '', article: a.num };
    });
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
    (equipements || []).forEach(x => {
      // Réseau décrit (« Distribution ballon ECS jusqu'aux équipements ») : pas un équipement
      // Titre muet (« Compensation Cuisine », « Extraction hotte ») : le type lu par CctpLecture dans le texte
      const c = classer(`${x.designation} ${x.caract || ''}`) || PAR_PREFIXE[x.prefixe] || null;
      if (!c || (titreReseau(x.designation) && c.genre !== 'pompe')) return;
      const texte = `${x.designation}. ${x.texte || x.caract || ''} ${x.prescrit || ''}`, r = reseauDeArticle(x.article, reseaux);
      const variante = /^(?:variantes?|options?|moins[- ]?values?|plus[- ]?values?|pse)\b/.test(norm(x.designation)) || ancetres(x.article).some(t => VARIANTE.test(norm(t)));
      const carac = caracteristiques(texte), pw = puissancesItem(carac, c.genre);
      const e = { ...c, designation: x.designation, qte: Math.max(1, nombre(x.quantite) || 1), ...pw, regime: regime(texte) || (r ? r.regime : ''), Q: Number.isFinite(carac.Q) ? carac.Q : NaN, repere: x.repere || '', prescrit: x.prescrit || '', carac, reseau: r ? r.id : '', sources: [`CCTP art. ${x.article}`], article: x.article, _texte: texte };
      if (x.quantiteLue && Number.isFinite(nombre(x.quantite))) e.qteCctp = nombre(x.quantite);
      if (variante) e.variante = true;
      const gros = c.categorie === 'producteur' || ['cta', 'ventilateur', 'desenfumage', 'ecs', 'split'].includes(c.genre);
      // Sous-article d'un gros équipement (« III.1.3.1 Centrale de traitement d'air » sous « III.1.3 CTA salle de
      // restauration ») : le même équipement, décrit plus en détail — prescription, puissances, débit et caractéristiques complétés
      const pere = gros && out.find(o => o.genre === c.genre && !!o.variante === !!e.variante && !o.repere && !e.repere && String(x.article).startsWith(`${o.article}.`));
      if (pere) {
        if (e.prescrit && !pere.prescrit.includes(e.prescrit)) pere.prescrit = [pere.prescrit, e.prescrit].filter(Boolean).join(' ; ');
        ['P', 'Q', 'Pfr', 'Pel'].forEach(k => { if (!Number.isFinite(pere[k]) && Number.isFinite(e[k])) pere[k] = e[k]; });
        Object.entries(carac).forEach(([k, v]) => { if (pere.carac[k] === undefined) pere.carac[k] = v; });
        pere.regime = pere.regime || e.regime;
        pere._texte += ` ${texte}`;
        pere.sources.push(...e.sources);
        return;
      }
      if (gros && !variante) e.principal = true;
      if (gros) { const ch = ancetres(x.article)[0]; if (ch) e.chapitre = String(ch).slice(0, 80); }
      out.push(e);
    });
    out.forEach(e => {
      e.alim = alimentation(`${e._texte} ${enfants(e.article)} ${e.genre === 'ecs' ? ancetres(e.article).join(' ') : ''}`, e.genre);
      // Ballon électrique : la « puissance » citée est électrique
      if (e.genre === 'ecs' && e.alim === 'electrique' && !Number.isFinite(e.Pel) && Number.isFinite(e.carac.P)) { e.Pel = e.carac.P; e.P = NaN; }
    });
    // Intitulés identiques (« Centrale double flux » dans deux chapitres) : nommés par leur chapitre
    const doubles = out.filter(e => e.chapitre && out.some(o => o !== e && norm(o.designation) === norm(e.designation)));
    doubles.forEach(e => { e.designation = `${e.designation} — ${e.chapitre}`; });
    return out.map(({ article: _, _texte: __, ...e }) => e);
  }

  /* ---------- DPGF ---------- */
  const SYN = { designation: ['designation', 'libelle', 'description', 'designation des ouvrages', 'nature des ouvrages', 'ouvrages', 'intitule', 'prestations'], qte: ['quantite', 'qte', 'qt', 'q', 'quantites', 'quant'], unite: ['u', 'unite', 'un', 'unit'], num: ['n', 'no', 'num', 'numero', 'n prix', 'article', 'art', 'poste', 'code', 'ref', 'item', 'repere'], marque: ['marque', 'fabricant'] };
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
    // Contextes ouverts par les titres de chapitres (lignes sans quantité), refermés par un titre de même niveau ou plus haut :
    // réseau en cours, variante / option / moins-value, chapitre d'un gros équipement (« Pompe à chaleur eau / eau »)
    let ctx = null, ctxVar = null, ctxEq = null, derniere = null;
    const titres = {}; // titre du chapitre par niveau : nomme les réseaux de même intitulé dans des chapitres différents
    const profondeur = n => (String(n || '').match(/\d+/g) || []).length;
    // Un même intitulé (« Réseau de soufflage / air neuf ») dans deux chapitres = deux réseaux, nommés par leur chapitre
    const ajouterReseau = (nom, num) => {
      const p = profondeur(num), parent = num && p > 1 ? String(titres[p - 1] || '').replace(/^[\d.\s-]+/, '').trim() : '', id = `${idReseau(nom)}${parent ? ` @ ${idReseau(parent)}` : ''}`;
      const r = reseaux.get(id) || { ...nouveauReseau(nom, `DPGF${num ? ` ${num}` : ''}`), id, chapEq: ctxEq ? ctxEq.titre : '', chapitre: parent };
      reseaux.set(id, r); return r;
    };
    const GROS = ['producteur'], GROS_GENRES = ['cta', 'ventilateur', 'ecs', 'split', 'desenfumage'];
    rows.slice(entete + 1).forEach(r => {
      const des = String((r || [])[map.designation] ?? '').trim(), q = nombre((r || [])[map.qte]), unite = String((r || [])[map.unite] ?? ''), num = map.num !== undefined ? String((r || [])[map.num] ?? '').trim() : '';
      if (!des) return;
      const prof = profondeur(num), x = norm(des);
      if (!(q > 0) && !/^(?:ml|m|u|ens|ft)$/.test(norm(unite))) {
        if (num) { titres[prof] = des; Object.keys(titres).forEach(k => { if (+k > prof) delete titres[k]; }); }
        derniere = null;
        const ferme = c => c && (num ? prof <= c.prof : true);
        if (ferme(ctxVar)) ctxVar = null;
        if (VARIANTE.test(x)) { ctxVar = { prof: num ? prof : 99 }; return; }
        if (ctxEq && (num ? prof <= ctxEq.prof : false)) ctxEq = null;
        const ce = classer(des);
        if (ce && (GROS.includes(ce.categorie) || GROS_GENRES.includes(ce.genre)) && !ctxEq) ctxEq = { titre: des.replace(/\s*:\s*$/, ''), prof: num ? prof : 99, genre: ce.genre };
        // Titre de réseau : ouvre un contexte (sa nature pourra venir de ses lignes) ; un sous-titre de même famille le garde
        if (titreReseau(des) || estReseau(des)) {
          const sous = ctx && num && prof > ctx.prof && (!natureReseau(des) || natureReseau(des) === reseaux.get(ctx.id).nature);
          if (!sous) { const res = ajouterReseau(des, num); ctx = { id: res.id, prof: num ? prof : 99 }; }
        } else if (ctx && (num ? prof <= ctx.prof : !/robinetterie|tuyauterie|accessoires?|calorifug|emetteurs?|equipements?|appareillage|regulation|supportage|collecteurs?|antennes?/.test(x))) ctx = null;
        return;
      }
      if (!(q > 0) && !VARIANTE.test(x)) return;
      const variante = !!ctxVar || VARIANTE.test(x), res = ctx ? reseaux.get(ctx.id) : null;
      // Tuyauteries et gaines (au mètre) : jamais un équipement ; longueur et plus gros diamètre du réseau en cours,
      // rangées dans un sous-réseau quand leur nature diffère (primaire nappe / secondaire chauffage dans un même chapitre)
      if (/^(?:ml|m)$/.test(norm(unite))) {
        if (variante) return;
        let cible = res || (estReseau(des) || titreReseau(des) ? ajouterReseau(des, num) : null);
        const nl = natureReseau(des), hydroL = !!(NATURE[nl] || {}).hydro;
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
        if (cible && /^(?:ml|m)$/.test(norm(unite))) { cible.L += q; const dn = dnDe(des); if (Number.isFinite(dn) && !(cible.dnMax >= dn)) cible.dnMax = dn; }
        return;
      }
      let c = classer(des);
      // Bouche, grille ou diffuseur linéaire : sa propre mention (« soufflage », « reprise ») d'abord, sinon son réseau
      if ((!c || /^bouche/.test(c.genre)) && res && !res.hydro && /bouches?|grilles?|diffuseurs?|anemostats?|buses?|tron[cç]ons? de soufflage/.test(x)) {
        const n = /soufflage|insufflation/.test(x) ? 'soufflage' : /reprise|extraction/.test(x) ? 'reprise' : res.nature;
        c = n === 'soufflage' ? { categorie: 'emetteur', genre: 'bouche-soufflage' } : ['reprise', 'extraction'].includes(n) ? { categorie: 'emetteur', genre: 'bouche-extraction' } : c;
      }
      // Ligne « Réseau … » chiffrée au forfait : le réseau lui-même
      if (!c && !variante && /^(?:ens|ft|forfait)$/.test(norm(unite)) && titreReseau(des) && natureReseau(des)) { ajouterReseau(des, num); return; }
      if (!c) return;
      // Gros équipement : la désignation du chapitre est souvent plus parlante (« Pompe à chaleur EAU / EAU R454B »)
      const gros = GROS.includes(c.categorie) || GROS_GENRES.includes(c.genre);
      const marque = /\bde marque\s+([A-Za-z0-9][\w&'-]*(?:\s[A-Z0-9][\w&'-]*)?)/i.exec(des), marqueCol = map.marque !== undefined ? String((r || [])[map.marque] ?? '').trim() : '';
      const libelle = gros && ctxEq && /^fourniture/.test(x) ? `${ctxEq.titre}${marque ? ` (marque ${marque[1]})` : ''}` : des.replace(/\s*:\s*$/, '');
      const carac = caracteristiques(des), contexte = `${Object.keys(titres).sort((a, b) => a - b).map(k => titres[k]).join(' ')} ${des}`;
      items.push({ ...c, designation: libelle, qte: q, unite, ...puissancesItem(carac, c.genre), carac, alim: alimentation(contexte, c.genre), regime: regime(des) || (res ? res.regime : ''), Q: Number.isFinite(carac.Q) ? carac.Q : NaN, repere: '', prescrit: [marque ? `marque ${marque[1]}` : '', marqueCol && !(marque && norm(marqueCol) === norm(marque[1])) ? `marque prévue au DPGF : ${marqueCol}` : ''].filter(Boolean).join(', '), reseau: res && !variante ? res.id : '',
        chapitre: ctxEq && gros ? ctxEq.titre : '', principal: gros && !variante, ...(variante ? { variante: true } : {}), sources: [`DPGF${num ? ` ${num}` : ''}`] });
    });
    // Réseaux vides (titres seuls, sans tuyauterie ni équipement) ou sans nature : écartés
    [...reseaux.values()].filter(r => (!r.nature || !r.L) && !items.some(x => x.reseau === r.id)).forEach(r => reseaux.delete(r.id));
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
  // Numéro d'article (CCTP) ou code de ligne (DPGF) : « III.1.3 », « III.1.3.5.34 »
  const codeDe = x => { const m = (x.sources || []).map(t => /^(?:CCTP art\.|DPGF) (\S+)/.exec(t)).find(Boolean); return m ? m[1] : ''; };
  const sousCode = (a, b) => !!a && !!b && (b === a || b.startsWith(`${a}.`));
  // Caractéristiques d'un article valables pour chacune des lignes qui le détaillent (pas les puissances ni les débits)
  const communs = c => Object.fromEntries(Object.entries(c || {}).filter(([k]) => ['regimeChaud', 'regimeFroid', 'frigorigene', 'tension', 'filtres'].includes(k)));
  function fusionner(cctp, dpgf) {
    const out = cctp.map((x, i) => ({ id: `c${i}`, ...x }));
    const garder = (a, b) => (Number.isFinite(a) ? a : b);
    const completer = (m, d) => Object.assign(m, { qteCctp: m.qteCctp, qte: d.qte, P: garder(m.P, d.P), Pfr: garder(m.Pfr, d.Pfr), Pel: garder(m.Pel, d.Pel), Q: garder(m.Q, d.Q), regime: m.regime || d.regime, reseau: m.reseau || d.reseau || '',
      carac: { ...(d.carac || {}), ...(m.carac || {}) }, alim: m.alim || d.alim || '', prescritDpgf: d.prescrit || '', dpgf: true, sources: [...m.sources, ...d.sources] });
    // Numérotation commune (le DPGF reprend les articles du CCTP, cas le plus courant) : une ligne du DPGF va à l'article
    // du CCTP qui la contient, de même genre ; c'est plus sûr que la ressemblance des intitulés
    const commun = dpgf.filter(d => cctp.some(c => sousCode(codeDe(c), codeDe(d)))).length >= 3;
    const pere = d => (commun ? out.filter(o => !o.dpgf && o.genre === d.genre && !!o.variante === !!d.variante && sousCode(codeDe(o), codeDe(d))).sort((a, b) => codeDe(b).length - codeDe(a).length)[0] : null);
    const enfants = new Map();
    if (commun) dpgf.forEach(d => { const p = pere(d); if (p) enfants.set(p, (enfants.get(p) || 0) + 1); });
    const remplaces = new Set();
    dpgf.forEach((d, i) => {
      if (commun && codeDe(d)) {
        // Équipements repérés un par un dans le même article (CH-01, CH-02) et une ligne « quantité 2 » : la même chose
        const p = pere(d), freres = p ? out.filter(o => !o.dpgf && o.genre === d.genre && o.repere && codeDe(o) === codeDe(p)) : [];
        if (freres.length > 1 && freres.length === d.qte) { freres.forEach(o => Object.assign(o, { P: Number.isFinite(o.P) ? o.P : d.P, reseau: o.reseau || d.reseau || '', dpgf: true, sources: [...o.sources, ...d.sources] })); return; }
        // Une seule ligne : le même équipement. Plusieurs (« Unité extérieure » + « Unité intérieure », deux ballons) :
        // les lignes du DPGF détaillent l'article, qui est remplacé par elles (sa prescription reprise)
        if (p && enfants.get(p) === 1) { completer(p, d); return; }
        if (p) { remplaces.add(p); out.push({ id: `d${i}`, ...d, prescrit: p.prescrit || d.prescrit || '', prescritDpgf: d.prescrit || '', reseau: d.reseau || p.reseau || '', alim: d.alim || p.alim || '', carac: { ...communs(p.carac), ...(d.carac || {}) }, sources: [...p.sources, ...d.sources], dpgf: true, detaille: true }); return; }
        out.push({ id: `d${i}`, ...d, dpgf: true });
        return;
      }
      if (d.variante) { out.push({ id: `d${i}`, ...d, dpgf: true }); return; }
      const memes = out.filter(o => o.genre === d.genre && !o.dpgf && !o.variante);
      // Équipements repérés un par un dans le CCTP (CH-01, CH-02) et une ligne « quantité 2 » au DPGF : la même chose
      const reperes = memes.filter(o => o.repere);
      if (reperes.length > 1 && reperes.length === d.qte && reperes.every(o => ressemblance(o.designation, d.designation) >= 0.5 || dpgf.filter(x => x.genre === d.genre).length === 1)) {
        reperes.forEach(o => Object.assign(o, { P: Number.isFinite(o.P) ? o.P : d.P, reseau: o.reseau || d.reseau || '', dpgf: true, sources: [...o.sources, ...d.sources] }));
        return;
      }
      // Même genre : la ligne la plus ressemblante (ou la seule de ce genre de chaque côté)
      const seule = memes.length === 1 && dpgf.filter(x => x.genre === d.genre).length === 1;
      const o = memes.map(m => [m, ressemblance(m.designation, d.designation)]).sort((a, b) => b[1] - a[1]).find(([, s]) => s >= 0.5 || seule);
      if (o) completer(o[0], d);
      else out.push({ id: `d${i}`, ...d, dpgf: true });
    });
    remplaces.forEach(p => out.splice(out.indexOf(p), 1));
    // Gros équipements d'abord (production, CTA, caissons, ECS), puis émetteurs et auxiliaires ; variantes non retenues
    const rang = x => (x.variante ? 9 : x.categorie === 'producteur' ? 0 : ['cta', 'ventilateur', 'desenfumage', 'ecs', 'split'].includes(x.genre) ? 1 : x.categorie === 'emetteur' ? 2 : 3);
    const vide = v => (Number.isFinite(v) ? v : '');
    return out.map(({ dpgf: _, ...x }) => ({ ...x, principal: x.principal || rang(x) <= 1, P: vide(x.P), Pfr: vide(x.Pfr), Pel: vide(x.Pel), Q: vide(x.Q), inclus: !x.variante }))
      .map((x, k) => [x, k]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(([x]) => x);
  }

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
    });
    return out;
  }
  const LIB_ECART = { 'absent-dpgf': 'Absent du DPGF', 'absent-cctp': 'Absent du CCTP', quantite: 'Quantité différente', marque: 'Marque différente' };
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
    const distrib = (reseaux || []).filter(r => r.hydro && ['change-over', 'chauffage', 'eau-glacee'].includes(r.nature));
    const chapProd = inventaire.filter(x => x.categorie === 'producteur' && x.inclus !== false && !x.variante).map(x => codeDe(x).split('.').slice(0, 2).join('.')).filter(c => c.includes('.'));
    inventaire.forEach(x => {
      if (!HYDRO_EM.includes(x.genre) || x.variante) return;
      delete x.horsSchema;
      if (x.genre === 'ecs' && ['electrique', 'solaire'].includes(x.alim)) { x.horsSchema = x.alim === 'solaire' ? 'ECS solaire (hors production)' : 'ECS électrique'; return; }
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
        const l = distrib.filter(z => z.nature === n);
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
    // Production réversible (PAC « chauffage / climatisation », régimes chaud et froid cités) : change-over
    const pp = principal && prod.find(x => x.genre === principal[0]), rev = pp && /^pac/.test(pp.genre) && (pp.genre === 'pac-rev' || pp.alim === 'change-over' || ((pp.carac || {}).regimeChaud && (pp.carac || {}).regimeFroid));
    if (rev) { e.reseau = 'co'; delete e.Tdep; delete e.Tret; }
    // ECS électrique ou solaire : pas un circuit de la production
    inc.filter(x => x.horsSchema).forEach(x => alertes.push(`${x.designation} : ${x.horsSchema}, hors schéma hydraulique${x.horsSchema === 'ECS électrique' ? ' (repris dans l\'alimentation électrique)' : ''}.`));
    const em = inc.filter(x => x.categorie === 'emetteur' && Sc.EMETTEURS[x.genre] && !x.horsSchema);
    // Réseaux hydrauliques reconnus (hors plomberie, ECS sanitaire traitée comme un émetteur) : un circuit par réseau,
    // avec ses émetteurs (puissance cumulée), son régime et la longueur de ses tuyauteries
    // Réseaux du fluide de la production : eau chaude (et ECS) pour une chaudière ou une PAC, eau glacée pour un groupe
    // froid, les deux en change-over (PAC réversible)
    const fluide = e.reseau === 'co' || rev ? ['chauffage', 'ecs', 'eau-glacee', 'change-over'] : (principal && /^gf/.test(principal[0])) || /^eg/.test(e.reseau || '') ? ['eau-glacee'] : ['chauffage', 'ecs', 'change-over'];
    const parId = new Map((reseaux || []).map(r => [r.id, r])), hydro = (reseaux || []).filter(r => r.hydro && fluide.includes(r.nature));
    (reseaux || []).filter(r => r.hydro && r.nature !== 'vapeur' && !fluide.includes(r.nature)).forEach(r => alertes.push(`Réseau « ${r.nom} » (${(NATURE[r.nature] || {}).libelle || r.nature}) : autre fluide que la production principale, à traiter dans un second schéma.`));
    // Réseau d'ECS sans ballon alimenté par la production (ballons électriques ou solaires) : pas un circuit
    const circuitsReseaux = hydro.filter(r => r.nature !== 'ecs' || em.some(x => x.reseau === r.id) || !inc.some(x => x.genre === 'ecs' && x.horsSchema)).map(r => {
      const ems = em.filter(x => x.reseau === r.id);
      const dominant = ems.length ? ems.reduce((m, x) => ((nombre(x.qte) || 1) > (nombre(m.qte) || 1) ? x : m), ems[0]).genre : (classer(r.nom) || {}).genre;
      const emet = Sc.EMETTEURS[dominant] ? dominant : r.nature === 'ecs' ? 'ecs' : r.nature === 'eau-glacee' ? 'ventilo' : 'radiateurs';
      const froid = r.nature === 'eau-glacee' || (r.nature === 'change-over' && principal && /^gf/.test(principal[0]));
      const Ps = ems.map(x => { const P = pTherm(x, froid), q = nombre(x.qte) || 1; return Number.isFinite(P) && P > 0 ? P * q : NaN; });
      const P = Ps.length && Ps.every(Number.isFinite) ? Math.round(Ps.reduce((s, v) => s + v, 0) * 10) / 10 : '';
      if (P === '') alertes.push(`Réseau « ${r.nom} » : puissance ${ems.length ? 'de certains émetteurs' : 'des émetteurs'} non trouvée, à saisir dans le schéma.`);
      return { rep: r.nom.slice(0, 40), emetteur: emet, P, regime: r.regime && r.regime !== reg ? r.regime : '', regulation: emet === 'ecs' ? 'direct' : emet === 'ventilo' ? '2v' : '3v', L: r.L > 0 ? Math.round(r.L) : 50, reseau: r.id };
    });
    // Émetteurs hors réseau reconnu : un circuit chacun ; ceux d'un réseau d'un autre fluide ne sont pas repris ici
    const sansReseau = em.filter(x => !x.reseau || !parId.has(x.reseau) || (!parId.get(x.reseau).hydro && !['soufflage', 'reprise', 'extraction', 'air-neuf'].includes(parId.get(x.reseau).nature)));
    e.circuits = [...circuitsReseaux, ...sansReseau.map(x => {
      // Puissance citée = puissance unitaire (« aérotherme 25 kW », quantité 4 → circuit de 100 kW)
      const P = pTherm(x, fluide.length === 1 && fluide[0] === 'eau-glacee'), q = nombre(x.qte) || 1, total = Number.isFinite(P) && P > 0 ? Math.round(P * q * 10) / 10 : '';
      return { rep: `${x.designation.slice(0, 40)}${q > 1 && !/^\d/.test(x.designation) ? ` (×${q})` : ''}`, emetteur: x.genre, P: total, regime: x.regime && x.regime !== reg ? x.regime : '', regulation: x.genre === 'ecs' ? 'direct' : x.genre === 'ventilo' ? '2v' : '3v', L: 50 };
    })];
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
  const PREFIXES = { pac: 'PAC', generateur: 'G', cta: 'CTA', ventilo: 'VC', aerotherme: 'AT', split: 'SP', pompe: 'P', vanne: 'VM', ventilateur: 'V', resistance: 'BEC' };
  function versElec(inventaire) {
    const out = [];
    // Ballon ECS électrique : résistance (puissance électrique citée, sinon 2,4 kW jusqu'à 300 L)
    const compteur = {};
    const elecDe = x => (x.genre === 'ecs' && x.alim === 'electrique' ? ['resistance', nombre(x.Pel) > 3.5 ? 'tri' : 'mono', 'tor'] : ELEC[x.genre]);
    inventaire.filter(x => x.inclus !== false && elecDe(x)).forEach((x, i) => {
      const [type, tension0, regulation] = elecDe(x), q = Math.max(1, Math.round(nombre(x.qte) || 1)), P = nombre(x.P), Pel = nombre(x.Pel);
      // Puissance électrique lue au CCTP (absorbée, moteur, batterie électrique), sinon estimée d'après la puissance thermique
      const Pe = Number.isFinite(Pel) && Pel > 0 ? Pel : type === 'resistance' ? ((x.carac || {}).volume > 300 ? 3.6 : 2.4) : (PELEC[type] || (() => ''))(Number.isFinite(P) ? P : 0);
      const tension = (x.carac || {}).tension === '400 V' && tension0 === 'mono' && type !== 'vanne' ? 'tri' : (x.carac || {}).tension === '230 V' && tension0 === 'tri' && !(Pe > 3) ? 'mono' : tension0;
      const base = { type, tension, regulation, designation: x.designation.slice(0, 60), depart: type === 'ventilateur' ? 'variateur' : undefined };
      // Repère : celui du CCTP, sinon préfixe du type numéroté (VC-01, VC-02…)
      const pre = x.repere || PREFIXES[type] || 'EQ', suite = () => { compteur[pre] = (compteur[pre] || 0) + 1; return `${pre}-${String(compteur[pre]).padStart(2, '0')}`; };
      if (q <= 10) for (let k = 1; k <= q; k++) out.push({ src: `inv:${x.id || i}:${k}`, rep: x.repere && q === 1 ? x.repere : x.repere ? `${pre}-${String(k).padStart(2, '0')}` : suite(), ...base, P: Pe });
      else out.push({ src: `inv:${x.id || i}`, rep: `${pre} ×${q}`, ...base, designation: `${base.designation} (×${q})`, P: Pe === '' ? '' : Math.round(Pe * q * 100) / 100 });
    });
    return out;
  }

  return { ecarts, ecartsTexte, LIB_ECART, cleRegle, appliquerRegles, apprendre, tableauEquipements, fusionnerAnnexe, caracteristiques, caracTexte, puissances, alimentation, rattacher, NATURES, NATURE, natureReseau, estReseau, reseauxCctp, fusionnerReseaux, REGLES, GENRES, classer, puissance, regime, debitAir, depuisCctp, depuisDpgf, depuisDpgfTexte, fusionner, versSchema, versSchemaAir, versElec, norm };
})();
if (typeof module !== 'undefined') module.exports = InventaireCVC;
