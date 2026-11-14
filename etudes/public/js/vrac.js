// Matériel chargé en vrac : chaque fiche technique (PDF lu, texte au format Pipe-Fit) est reconnue (CTA, pompe, terminal,
// générateur, vase, ballon d'ECS, bouche, robinetterie, appareil sanitaire), lue par son lecteur, puis répartie dans
// l'étude : ligne de terminaux (et circuit du schéma de principe), calcul de CTA, production du schéma de principe, pompe
// d'un circuit ou d'un réseau arborescent, vase, ballon, bouche d'un schéma aéraulique, robinetterie d'un circuit ou d'un
// tronçon, point de puisage. Rien n'est ressaisi. Module pur (navigateur, node, tests).
const Vrac = (() => {
  // Modules frères : globales du navigateur (déclarées en const, donc absentes de globalThis), sinon require
  const N = () => (typeof Notes !== 'undefined' ? Notes : require('./notes')), FC = () => (typeof FicheCta !== 'undefined' ? FicheCta : require('./fiche-cta'));
  const FE = () => (typeof FicheEquip !== 'undefined' ? FicheEquip : require('./fiche-equipement')), T = () => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux'));
  const Sc = () => (typeof Schema !== 'undefined' ? Schema : require('./schema')), PO = () => (typeof Pompes !== 'undefined' ? Pompes : require('./pompes'));
  const SA = () => (typeof SchemaAir !== 'undefined' ? SchemaAir : require('./aeraulique-schema')), SAN = () => (typeof Sanitaire !== 'undefined' ? Sanitaire : require('./sanitaire'));
  const FA = () => (typeof FicheAnnexes !== 'undefined' ? FicheAnnexes : require('./fiche-annexes'));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const TYPES = { cta: 'Centrale de traitement d\'air', generateur: 'Générateur (chaudière, PAC, groupe froid)', pompe: 'Pompe, circulateur', terminal: 'Terminal (cassette, ventilo-convecteur…)',
    vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS', bouche: 'Bouche, diffuseur, grille', robinet: 'Vanne, robinetterie, accessoire', sanitaire: 'Appareil sanitaire', regulateur: 'Régulateur, module d\'extension',
    // Matériel des calculs annexes (fiche-annexes.js)
    drvUE: 'Unité extérieure DRV / VRF', radiateur: 'Radiateur', echangeur: 'Échangeur à plaques', deshu: 'Déshumidificateur, centrale de piscine', groupeFroid: 'Groupe de chambre froide', extracteur: 'Extracteur, tourelle, caisson',
    // Matériel sans calcul (registre, matériel retenu, DOE) et documents qui ne sont pas des fiches d'équipement
    accessoireSan: 'Accessoire sanitaire (barre, distributeur, miroir, caniveau…)', tampon: 'Ballon tampon', fumee: 'Note de calcul de conduit de fumée',
    document: 'Document commercial (devis, offre) : à déposer dans le matériel retenu ou la consultation', inconnu: 'Non reconnu' };
  const ANNEXES = ['drvUE', 'radiateur', 'echangeur', 'deshu', 'groupeFroid', 'extracteur'];
  // Type d'équipement : ligne « Type : … » du format Pipe-Fit, sinon mots de la fiche et du nom du fichier
  const REGLES = [['accessoireSan', /barre (?:d.appui|de (?:douche|relevage|maintien|soutien))|distributeur|porte-?\s?(?:brosse|papier|rouleau|serviette|savon)|miroir|siege (?:de douche|rabattable|accrochable)|patere|seche-mains|poubelle|cann?iveau|siphon de sol|accroche-siege/],
    ['sanitaire', /robinet (?:mural|temporise|de puisage|de lavabo|d.evier|de douche|lave-mains)|lave[- ]mains?|receveur|panneau de douche|colonne de douche|lavabo|lave-mains|mitigeur|douche|\bwc\b|cuvette|evier|vidoir|vide-seau|urinoir|bidet|baignoire|appareil sanitaire/],
    ['deshu', /deshumidif|dehumidif|centrale (?:de traitement d.air )?(?:de |pour )?piscine/],
    ['cta', /centrale de traitement|\bcta\b|double flux|air handling|unite de traitement d.air/],
    ['drvUE', /\bdrv\b|\bvrf\b|\bvrv\b|debit de refrigerant variable|detente directe|unite exterieure/],
    ['groupeFroid', /chambre froide|groupe de condensation|unite de condensation|condensing unit|monobloc frigorifique|groupe logette/],
    ['echangeur', /echangeur a plaques?|plate heat exchanger|echangeur brase/],
    ['radiateur', /^(?!.*terminal).*(?:radiateur|radiator|seche-serviettes)/],
    ['extracteur', /extracteur|tourelle|caisson (?:d.extraction|de ventilation|simple flux)|ventilateur (?:d.extraction|de desenfumage|helicoide|centrifuge|de toiture)|roof fan|exhaust fan/],
    ['vase', /vase d.expansion|expansion vessel|\bvase\b/],
    ['generateur', /chaudiere|pompe a chaleur|\bpac\b|groupe (?:froid|de production|d.eau glacee)|chiller|heat pump|boiler|generateur/],
    ['terminal', /cassette|ventilo|gainable|aerotherme|poutre (?:froide|climatique)|radiateur|rideau d.air|unite interieure|\bsplit\b|terminal/],
    ['pompe', /circulateur|\bpompe\b|\bpump\b|accelerateur/], ['bouche', /diffuseur|grille|bouche|buse|plafonnier|diffuser|\bgrille\b/],
    ['tampon', /ballon tampon|tampon d.eau|reservoir tampon|buffer tank/],
    ['ecs', /ballon|preparateur|\becs\b|chauffe[- ]eau|eau chaude sanitaire/],
    ['robinet', /vanne|robinet|clapet|filtre|pot a boue|desemboueur|compteur d.energie|\bvalve\b|purgeur|soupape/],
    ['regulateur', /regulateur|controleur|controller|synco|module d.extension|automate/]];
  // Indices tirés des libellés « clé : valeur » (fiche au format Pipe-Fit ou fiche bien structurée)
  // Documents qui ne sont pas des fiches d'un équipement, et familles nommées sans ambiguïté en tête de document
  // (avant les indices tirés des libellés, qu'un descriptif ou une note de calcul peut contenir par hasard)
  function nature(L) {
    const tete = norm(L.slice(0, 15).join('\n')), x = norm(L.join('\n'));
    if ((/^\s*(?:devis|offre de prix|proposition commerciale|bon de commande)\b/m.test(tete) || /demande de devis|reference (?:de |du )?devis|prix nets? hors taxes|conditions generales de vente/.test(x)) && /prix|€|\beur\b|hors taxes|\bht\b|montant|remise/.test(x)) return 'document';
    if (/conduits? de fumees?|en 13384|cheminee/.test(tete) && /dimensionnement|calcul|tirage/.test(tete)) return 'fumee';
    const T = [['cta', /centrale de traitement d.air|centrale double flux|cta double flux|\bcta\b \d|unite de ventilation (?:simple|double) flux|air handling unit|caisson double flux|^centrale\s*:\s*cta/m],
      ['terminal', /aerochauffeur|aerotherme|destratificateur|rooftop|roof-?top|unite de toiture/],
      ['extracteur', /caissons? d.(?:extraction|insufflation)|tourelles? d.extraction|extracteurs? d.air|ventilateurs? de desenfumage/],
      ['tampon', /ballon tampon|tampon d.eau/],
      ['vase', /maintien de pression|systeme (?:d.)?expansion|vase d.expansion/],
      ['generateur', /pompe a chaleur|refroidisseur|chiller|groupe (?:froid|d.eau glacee)|heat pump|chaudiere|\bpac\b.{0,12}(?:air|eau)|condensation par (?:eau|air)|water-?cooled|air to water/]];
    const t = T.find(([, re]) => re.test(tete));
    return t ? t[0] : null;
  }
  function indices(L) {
    const x = norm(L.join('\n')), a = re => re.test(x);
    // Matériel des calculs annexes : libellés propres à chaque fiche
    if (a(/unites? interieures?\s*:|longueur prechargee|nombre maxi(?:mal)? d.unites/)) return 'drvUE';
    if (a(/(?:δ|δ|delta)\s*t\s*=?\s*50|dt\s*50\s*:|en 442|exposant n/)) return 'radiateur';
    if (a(/nombre de plaques|perte de charge (?:primaire|secondaire)/)) return 'echangeur';
    if (a(/deshumidification\s*:|capacite de deshumidification/)) return 'deshu';
    if (a(/puissance frigorifique a -?\d|temperature d.evaporation/) && !a(/chambre/)) return 'groupeFroid';
    if (a(/debit\s*:\s*[\d.,]+\s*m(?:3|³)\s*\/\s*h/) && a(/pression(?: disponible| statique)?\s*:\s*[\d.,]+\s*pa\b/) && a(/tension|puissance absorbee/) && !a(/batterie|recuperateur|puissance (?:chaud|froid|calorifique|frigorifique)|\bhmt\b|courbe/)) return 'extracteur';
    if (a(/entrees? universelles?\s*:|sorties? relais\s*:|sorties? 0-10/)) return 'regulateur';
    if (a(/pression de gonflage|pression de prechargement|precharge/)) return 'vase';
    if (a(/abaque|nombre de tours|\bkvs?\s*:/) && !a(/puissance (?:chaud|froid|calorifique|frigorifique)/)) return 'robinet';
    if (a(/debit\s*:\s*[\d.,]+\s*l\s*\/\s*(?:s|min)\b/) && a(/pression minimale/)) return 'sanitaire';
    if (a(/hauteur manometrique|\bhmt\b/) || (a(/courbe/) && a(/circulateur|\bpompe\b|\bpump\b/) && !a(/ventilateur|batterie|m3\/h d.air/))) return 'pompe';
    if (a(/volume nominal|capacite/) && a(/echangeur|serpentin/)) return 'ecs';
    if (a(/db\s*\(a\)|lw/) && a(/\d\s*pa\b/) && !a(/\bkw\b/)) return 'bouche';
    if (a(/puissance (?:chaud|froid)\s*:/)) return 'terminal';
    if (a(/puissance (?:calorifique|frigorifique) nominale/)) return 'generateur';
    return null;
  }
  const SOUS = { ecs: ['tampon'], pompe: ['vase'], generateur: ['fumee'], vase: ['tampon'] };
  function classer(lignes, nom = '') {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String);
    const regle = z => { const r = REGLES.find(([, re]) => re.test(norm(z))); return r ? r[0] : null; };
    const t = L.map(l => /^\s*type(?: d.equipement| d.équipement)?\s*:\s*(.+)$/i.exec(l)).find(Boolean);
    // Ligne « Type : … » du format Pipe-Fit ; « Type : EX4-F 12x14 » (modèle du fabricant) n'est pas un type : on continue
    if (t && regle(t[1])) return regle(t[1]);
    // Nom du fichier d'abord ; le contenu l'emporte quand il est plus précis (« ballon.pdf » : ballon tampon) ou quand ce
    // n'est pas une fiche d'équipement (devis, note de calcul de conduit de fumée)
    const n = regle(nom), nt = nature(L);
    if (nt && (!n || nt === 'document' || nt === 'fumee' || (SOUS[n] || []).includes(nt))) return nt;
    return n || indices(L) || regle(L.slice(0, 40).join(' ')) || regle(L.join(' ')) || 'inconnu';
  }
  // Lecture par le lecteur du type : valeurs, fabricant, référence, résumé lisible
  function lire(type, lignes, nom = '') {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String);
    const nf = (v, d = 1) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '');
    let r, resume = [];
    if (type === 'cta') { r = FC().lire(L); const v = r.valeurs; resume = [v.Qs && `${nf(v.Qs, 0)} m³/h`, v.PchBC && `chaud ${nf(v.PchBC)} kW`, v.PfrBF && `froid ${nf(v.PfrBF)} kW`]; }
    else if (type === 'terminal') { r = T().lireFiche(L); const v = r.valeurs; resume = [v.Pch && `chaud ${nf(v.Pch, 2)} kW`, v.Pfr && `froid ${nf(v.Pfr, 2)} kW`, v.Pvent && `${nf(v.Pvent, 0)} W`]; }
    else if (type === 'bouche') { r = SA().lireFicheBouche(L); const v = r.valeurs; resume = [v.Q && `${nf(v.Q, 0)} m³/h`, v.dp && `${nf(v.dp, 0)} Pa`, v.Lw && `${nf(v.Lw, 0)} dB(A)`]; }
    else if (type === 'robinet') { r = Sc().lireFicheRobinet(L); const v = r.valeurs; resume = [v.dn && `DN ${v.dn}`, v.kv && `Kvs ${nf(v.kv, 2)}`, v.dp && `${nf(v.dp)} kPa`, v.abaque && 'abaque']; }
    else if (type === 'regulateur') { r = (typeof Regulation !== 'undefined' ? Regulation : require('./regulation')).lireFiche(L); const v = r.valeurs; resume = [v.app && `application ${v.app}`, v.X !== undefined && `${v.X} entrées`, v.Y !== undefined && `${v.Y} sorties 0-10 V`, v.Q !== undefined && `${v.Q} relais`]; }
    else if (type === 'sanitaire') {
      r = SAN().lireFichePoint(L); const v = r.valeurs, a = appareil(`${nom} ${L.slice(0, 30).join(' ')}`), A = SAN().APPAREILS[a];
      if (a) v.appareil = a;
      // Débit de base par défaut selon l'appareil (DTU 60.11) quand la fiche ne le donne pas : repris par le calcul
      resume = [A && A[0], v.q ? `${nf(v.q, 2)} L/s` : A && `${nf(A[1], 2)} L/s par défaut`, v.pMin && `${nf(v.pMin)} bar`];
    }
    else if (type === 'accessoireSan' || type === 'tampon' || type === 'document') { r = type === 'document' ? { valeurs: {} } : FE().lire(L); if (type === 'accessoireSan') r = { ...r, valeurs: {} };
      resume = type === 'document' ? ['document commercial : à déposer dans le matériel retenu ou la consultation'] : type === 'tampon' ? [r.valeurs.V && `${nf(r.valeurs.V, 0)} L`, r.valeurs.pmax && `${nf(r.valeurs.pmax)} bar`] : ['accessoire : registre et DOE, sans calcul']; }
    else if (type === 'fumee') { r = lireFumee(L); const v = r.valeurs; resume = [v.P && `${nf(v.P, 0)} kW`, v.D && `Ø ${nf(v.D, 0)} mm`, v.H && `H ${nf(v.H)} m`, v.Tf && `fumées ${nf(v.Tf, 0)} °C`]; }
    else if (ANNEXES.includes(type)) { r = FA().lire(type, L); resume = [FA().resume(type, r.valeurs)]; }
    else { r = FE().lire(L); const v = r.valeurs, c = type === 'pompe' ? PO().lireFiche(L) : '';
      if (c) v.courbe = c;
      resume = type === 'pompe' ? [v.Q && v.H && `${nf(v.Q, 2)} m³/h × ${nf(v.H)} mCE`, v.P1 && `${nf(v.P1, 0)} W`, c && 'courbe'] : type === 'vase' ? [v.V && `${nf(v.V, 0)} L`, v.p0 && `${nf(v.p0)} bar`]
        : type === 'ecs' ? [v.V && `${nf(v.V, 0)} L`, v.P && `${nf(v.P)} kW`] : [v.P && `${nf(v.P, 0)} kW`, v.Pfr && `froid ${nf(v.Pfr, 0)} kW`, v.P1 && `${nf(v.P1 / 1000)} kW élec.`]; }
    // Fabricant et référence contrôlés pour tous les types : jamais l'entreprise utilisatrice, un organisme, une norme, un
    // numéro de document ni des coordonnées (un devis n'a ni fabricant ni référence d'équipement)
    const id = type === 'document' || type === 'fumee' ? { fabricant: '', reference: '' } : FE().identifier(L, r.fabricant || '', r.reference || '');
    const reference = r.gamme ? '' : id.reference;
    if (r.gamme) resume.unshift(`documentation de gamme (${r.gamme}) : choisir le modèle`);
    return { valeurs: r.valeurs || {}, fabricant: id.fabricant || '', reference, resume: resume.filter(Boolean).join(' · '), nb: Object.keys(r.valeurs || {}).length,
      ...(r.sources ? { sources: r.sources } : {}), ...(r.gamme ? { gamme: r.gamme, modeles: r.modeles || [] } : {}) };
  }
  // Modèle choisi dans une documentation de gamme (liste lu.modeles) : valeurs et référence de ce modèle
  const choisirModele = (lu, k) => { const x = FE().choisir(lu, k); return x === lu ? lu : { ...x, nb: Object.keys(x.valeurs || {}).length, resume: [x.modele, lu.resume.replace(/^documentation de gamme[^·]*·?\s*/, '')].filter(Boolean).join(' · ') }; };
  // Appareil sanitaire d'après le nom du fichier et le début de la fiche (clé des appareils du calcul sanitaire)
  function appareil(t) {
    const x = norm(t);
    return /vidoir|vide-seau/.test(x) ? 'videSeau' : /lave[- ]mains?/.test(x) ? 'laveMains' : /\bwc\b|cuvette|toilette/.test(x) && !/lave/.test(x) ? 'wc' : /urinoir/.test(x) ? 'urinoir' : /evier/.test(x) ? 'evier'
      : /douche|receveur/.test(x) ? 'douche' : /baignoire/.test(x) ? 'baignoire' : /bidet/.test(x) ? 'bidet' : /lavabo|vasque/.test(x) ? 'lavabo' : /robinet (?:mural|de puisage|exterieur)/.test(x) ? 'puisage' : /mitigeur|robinet/.test(x) ? 'lavabo' : '';
  }
  // Note de calcul de conduit de fumée (logiciel du fabricant de conduits) : appareil raccordé et conduit
  function lireFumee(L) {
    const v = {}, src = {}, num = s => Number(String(s).replace(/\s/g, '').replace(',', '.'));
    let section = '';
    L.forEach(l => {
      const x = norm(l), c = l.split('\t'), val = re => { const m = re.exec(x); return m ? num(m[1]) : undefined; }, pose = (k, y, min, max) => { if (v[k] === undefined && Number.isFinite(y) && y >= min && y <= max) { v[k] = y; src[k] = l.trim().slice(0, 140); } };
      if (/^(?:generateur|conduit du raccordement|cheminee)\b/.test(x)) section = /^generateur/.test(x) ? 'gen' : /raccordement/.test(x) ? 'racc' : 'chem';
      if (/puissance (?:therm\.? )?nominale|puissance utile/.test(x)) pose('P', val(/(\d+(?:[.,]\d+)?)\s*kw/), 1, 50000);
      if (/^combustible/.test(x) && !v.combustible) { const k = /gaz/.test(x) ? 'gaz' : /propane/.test(x) ? 'propane' : /fioul/.test(x) ? 'fioul' : /bois|granul/.test(x) ? 'bois' : ''; if (k) { v.combustible = k; src.combustible = l.trim(); } }
      if (/co2/.test(x) && /teneur|contenu/.test(x)) pose('CO2', val(/(\d+(?:[.,]\d+)?)\s*%/), 1, 20);
      if (/temperature de fumee/.test(x)) pose('Tf', val(/(\d+(?:[.,]\d+)?)\s*°?\s*c/), 30, 400);
      if (/^buse de fumee|^section\b/.test(x) && /circulaire/.test(x)) pose('D', val(/(\d{2,4})\s*mm/), 50, 2000);
      if (/^hauteur developpee/.test(x) && section === 'chem') pose('H', val(/(\d+(?:[.,]\d+)?)\s*m\b/), 0.5, 300);
      if (/^long(?:u)?eur developpee/.test(x) && section === 'racc') pose('Lr', val(/(\d+(?:[.,]\d+)?)\s*m\b/), 0, 100);
      if (/^altitude/.test(x)) pose('altitude', val(/(\d+(?:[.,]\d+)?)\s*m\b/), 0, 4000);
      if (/^(?:fabricant, type|appareil)/.test(x) && section === 'gen' && c[1] && !v.generateur) { v.generateur = c[1].trim().slice(0, 60); src.generateur = l.trim(); }
    });
    return { valeurs: v, sources: src, fabricant: '', reference: '' };
  }
  // Destinations possibles dans l'étude pour un type : [clé, libellé]
  function destinations(et, type) {
    const notes = (et && et.notes) || [], lib = n => `N${notes.indexOf(n) + 1} — ${n.titre}`, de = t => notes.filter(n => n.type === t);
    const circuits = de('pid').flatMap(n => ((n.entrees || {}).circuits || []).filter(c => c.rep).map(c => [`pidc:${n.id}|${c.rep}`, `${lib(n)} : circuit ${c.rep}`]));
    const nouveau = (t, l) => [[`${t}:nouveau`, `Nouveau calcul « ${l} »`]];
    // Pompes de la production (primaires, échangeur, récupération, refroidissement) : même tableau « pompesFab »
    const pompesProd = () => de('pid').flatMap(n => { try { return Sc().pompesProduction(n.entrees, Sc().dimensionner(n.entrees)).map(p => [`pidc:${n.id}|${p.cle}`, `${lib(n)} : ${p.lib} (${p.cle})`]); } catch (e) { return []; } });
    switch (type) {
      case 'terminal': return [...de('terminaux').map(n => [`term:${n.id}`, lib(n)]), ...nouveau('term', 'Terminaux')];
      case 'cta': return [...de('cta').map(n => [`cta:${n.id}`, lib(n)]), ...nouveau('cta', 'Centrale de traitement d\'air')];
      case 'generateur': return de('pid').map(n => [`pid:${n.id}`, `${lib(n)} : production`]);
      case 'pompe': return [...circuits.map(([k, l]) => [k, `${l} (pompe du circuit)`]), ...pompesProd(), ...de('arbo').map(n => [`arbo:${n.id}`, `${lib(n)} : pompe du réseau`]), ...de('reseau').map(n => [`reseau:${n.id}`, lib(n)]),
        ...de('terminaux').map(n => [`termp:${n.id}`, `${lib(n)} : pompe de distribution (à placer sur une branche)`])];
      case 'vase': return [...de('vase').map(n => [`vase:${n.id}`, lib(n)]), ...nouveau('vase', 'Vase d\'expansion')];
      case 'ecs': return [...de('ecs').map(n => [`ecs:${n.id}`, lib(n)]), ...nouveau('ecs', 'Production d\'ECS')];
      case 'bouche': { const SA = typeof SchemaAir !== 'undefined' ? SchemaAir : require('./aeraulique-schema'), I = new Map(SA.installationsAir(et)); return de('aero').filter(n => (n.entrees || {}).structure === 'arborescence').map(n => [`aero:${n.id}`, `Bouches de ${I.get(n.id) || lib(n)}`]); }
      case 'robinet': return [...circuits.map(([k, l]) => [k, `${l} (robinetterie)`]), ...de('arbo').flatMap(n => ((n.entrees || {}).troncons || []).filter(t => t.rep).map(t => [`arbot:${n.id}|${t.rep}`, `${lib(n)} : tronçon ${t.rep}`]))];
      case 'sanitaire': return de('sanitaire').map(n => [`san:${n.id}`, `${lib(n)} : points de puisage`]);
      // Matériel des calculs annexes : calculs de l'étude du type qui le reçoit, et nouveau calcul
      case 'drvUE': case 'radiateur': case 'echangeur': case 'deshu': case 'groupeFroid': case 'extracteur':
        return FA().CALCULS[type].flatMap(t => [...de(t).map(n => [`${t}:${n.id}`, lib(n)]), ...nouveau(t, N().TYPES[t] ? N().TYPES[t].titre : t)]);
      case 'regulateur': return de('elec').flatMap(n => [['production', 'production'], ['chauffage', 'chauffage et ECS'], ['ventilation', 'ventilation, CTA'], ['autre', 'auxiliaires'], ['extension', 'modules d\'extension']].map(([a, l]) => [`reg:${n.id}|${a}`, `${lib(n)} : régulateur ${l}`]));
      // Note de conduit de fumée : calcul annexe « conduit de fumée » (valeurs saisies, générateur non repris)
      case 'fumee': return [...de('conduitFumee').map(n => [`fumee:${n.id}`, lib(n)]), ...nouveau('fumee', N().TYPES.conduitFumee ? N().TYPES.conduitFumee.titre : 'Conduit de fumée')];
      default: return [];
    }
  }
  // Applique un élément du vrac : le modèle entre au registre des équipements de l'étude (ou y est mis à jour), puis il
  // est placé dans le calcul choisi ; nouvelleNote(type) crée un calcul ; renvoie un compte rendu
  const Rg = () => (typeof Registre !== 'undefined' ? Registre : require('./registre'));
  const versRegistre = (et, item) => Rg().ajouter(et, { type: item.type, fabricant: item.lu.fabricant, reference: item.lu.reference, valeurs: item.lu.valeurs, nom: item.nom });
  function appliquer(et, item, cible, nouvelleNote) {
    // Document commercial : ni registre ni calcul ; note de conduit de fumée : valeurs reportées dans le calcul annexe
    if (item.type === 'document') return `${item.nom || 'Document'} : document commercial, à déposer dans le matériel retenu ou la consultation`;
    if (item.type === 'fumee') return appliquerFumee(et, item, cible, nouvelleNote);
    const x = versRegistre(et, item);
    return cible ? Rg().placer(et, x, cible, { qte: item.qte, rep: item.rep, local: item.local, circuit: item.circuit, branche: item.branche, texte: (item.lignes || []).join(' ') }, nouvelleNote) : `${Rg().nomEq(x)} : inscrit au registre (à placer)`;
  }
  // Destination la plus cohérente pour une fiche lue (au lieu de la première de la liste) : pompe sur le circuit dont le débit
  // et la hauteur calculés sont les plus proches de son point de fonctionnement, générateur sur la production de puissance la
  // plus proche, CTA sur la centrale de débit le plus proche encore sans modèle (ou celle qui porte déjà ce modèle), vase et
  // ballon sur le calcul encore libre. pris : destinations déjà choisies pour les autres fiches du même lot (une par fiche).
  const ecartLog = (a, b) => (a > 0 && b > 0 ? Math.abs(Math.log(a / b)) : 9);
  function proposer(et, type, lu, pris = new Set()) {
    const d = destinations(et, type);
    if (!d.length) return '';
    const v = (lu && lu.valeurs) || {}, notes = (et && et.notes) || [], note = id => notes.find(n => n.id === id), x0 = lu && (lu.fabricant || lu.reference) ? Rg().nomEq({ fabricant: lu.fabricant, reference: lu.reference }) : '';
    const meme = n => { const e = (n && n.entrees) || {}, x = e.eq && Rg().parId(et, e.eq); return !!(x && x0 && Rg().nomEq(x) === x0); };
    const libres = d.filter(([k]) => !pris.has(k) || /:nouveau$/.test(k)), cands = libres.length ? libres : d;
    const meilleur = score => { let best = null, s0 = Infinity; cands.forEach(([k]) => { const s = score(k); if (s < s0) { s0 = s; best = k; } }); return best || cands[0][0]; };
    if (type === 'pompe') {
      const dims = new Map(), dim = id => { if (!dims.has(id)) { try { const e = note(id).entrees, dd = Sc().dimensionner(e); dims.set(id, { e, dd, prod: Sc().pompesProduction(e, dd) }); } catch (er) { dims.set(id, null); } } return dims.get(id); };
      return meilleur(k => {
        const m = /^pidc:([^|]+)\|(.+)$/.exec(k); if (!m) return 50;
        const D = dim(m[1]); if (!D) return 40;
        const c = (D.dd.circuits || []).find(y => y.rep === m[2]) || D.prod.find(y => y.cle === m[2]); if (!c) return 40;
        const occupe = (D.e.pompesFab || []).some(p => p && p.circuit === m[2] && String(p.courbe || '').trim()) ? 3 : 0;
        return (v.Q > 0 && v.H > 0 ? ecartLog(v.Q, c.Q) + ecartLog(v.H, c.hmt) : 1) + occupe;
      });
    }
    if (type === 'generateur') return meilleur(k => { const n = note(k.split(':')[1]), e = (n && n.entrees) || {}; return meme(n) ? -1 : ecartLog(v.P || v.Pfr, Number(e.Pgen) || 0) + (e.eq ? 3 : 0); });
    if (type === 'cta') return meilleur(k => { if (/:nouveau$/.test(k)) return 5; const n = note(k.split(':')[1]), e = (n && n.entrees) || {}; return meme(n) ? -1 : (e.eq ? 6 : 0) + (v.Qs > 0 ? ecartLog(v.Qs, Number(e.Qs) || 0) : 0.5); });
    // Calculs annexes : celui dont la puissance (ou le débit) calculée est la plus proche de la fiche, encore sans modèle
    if (ANNEXES.includes(type)) {
      const calc = (n, k) => { try { return (N().calculer(n.type, n.entrees || {}).valeurs || {})[k]; } catch (er) { return undefined; } };
      const repere = { drvUE: [v.Pfr, n => Number((n.entrees || {}).PfrUE) || calc(n, 'Pui')], radiateur: [0, () => 0], echangeur: [v.P, n => calc(n, 'P')], deshu: [v.mDeshu, n => calc(n, 'm')],
        groupeFroid: [v.Pfr, n => calc(n, 'Pevap')], extracteur: [v.Qair, n => calc(n, n.type === 'parking' ? 'Qext' : 'Q')] }[type];
      return meilleur(k => {
        const [t, id] = k.split(':'); if (id === 'nouveau') return 5 + FA().CALCULS[type].indexOf(t) * 0.1;
        const n = note(id); if (meme(n)) return -1;
        const c = repere[1](n);
        return (n && n.entrees && n.entrees.eq ? 6 : 0) + (repere[0] > 0 ? ecartLog(repere[0], c) : 0.5);
      });
    }
    if (type === 'vase' || type === 'ecs') return meilleur(k => { if (/:nouveau$/.test(k)) return 5; const n = note(k.split(':')[1]); return meme(n) ? -1 : (n && n.entrees && n.entrees.eq ? 6 : 0); });
    return cands[0][0];
  }
  function appliquerFumee(et, item, cible, nouvelleNote) {
    const v = (item.lu && item.lu.valeurs) || {}, notes = (et && et.notes) || [], id = String(cible || '').split(':')[1];
    let n = id && id !== 'nouveau' ? notes.find(y => y.id === id && y.type === 'conduitFumee') : null;
    if (!n && cible && typeof nouvelleNote === 'function') n = nouvelleNote('conduitFumee');
    if (!n) return `${item.nom || 'Note de conduit'} : aucun calcul de conduit de fumée`;
    const e = n.entrees = n.entrees || {}, pris = [];
    ['P', 'combustible', 'CO2', 'Tf', 'D', 'H', 'Lr', 'altitude'].forEach(k => { if (v[k] !== undefined) { e[k] = v[k]; pris.push(k); } });
    if (pris.length) e.source = '';
    return `${item.nom || 'Note de conduit'} : ${pris.length} valeur(s) reportée(s) dans ${n.titre || 'le calcul de conduit de fumée'}${v.generateur ? ` (générateur ${v.generateur})` : ''}`;
  }
  const typeTerminal = (texte, v) => Rg().typeTerminal(texte, v);
  // Fiches au format Pipe-Fit collées les unes à la suite (séparées par une ligne « --- ») : une fiche par bloc
  const decouper = texte => String(texte || '').split(/^\s*-{3,}\s*$/m).map(b => b.split(/\r?\n/).filter(l => l.trim())).filter(b => b.length);
  return { TYPES, classer, lire, choisirModele, destinations, proposer, appliquer, versRegistre, decouper, typeTerminal, appareil };
})();
if (typeof module !== 'undefined') module.exports = Vrac;
