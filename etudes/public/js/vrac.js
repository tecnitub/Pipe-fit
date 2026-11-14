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
    vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS', bouche: 'Bouche, diffuseur, grille', robinet: 'Vanne, robinetterie, accessoire', sanitaire: 'Appareil sanitaire', regulateur: 'Régulateur, module d\'extension', capteur: 'Capteur, instrumentation (débit, pression, température…)',
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
    ['capteur', /capteurs? (?:de |du )?(?:debit|pression|temperature|niveau)|transmetteurs? (?:de )?(?:debit|pression|temperature|niveau)|debitmetre|(?:controleur|detecteur) de debit|fluxostat|pressostat/],
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
      ['generateur', /pompe a chaleur|refroidisseur|chiller|groupe (?:froid|d.eau glacee)|heat pump|chaudiere|\bpac\b.{0,12}(?:air|eau)|condensation par (?:eau|air)|water-?cooled|air to water/],
      // Instrumentation : capteur, transmetteur, débitmètre, contrôleur de débit (titre du document)
      ['capteur', /^\s*(?:boitier de (?:controle|commande) pour )?capteurs? (?:de |du )?(?:debit|pression|temperature|niveau)|^\s*transmetteurs? (?:de )?(?:debit|pression|temperature|niveau)|^\s*debitmetre|^\s*(?:controleur|detecteur) de debit/m]];
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
    if (a(/\b(?:capteur|transmetteur|debitmetre|detecteur)s?\b/) && a(/4\s*-\s*20\s*ma|impulsions?|sortie (?:relais|tor|analogique)/) && !a(/puissance (?:chaud|froid|calorifique|frigorifique)|\bhmt\b/)) return 'capteur';
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
    else if (type === 'robinet') {
      r = Sc().lireFicheRobinet(L);
      // Gamme par DN (tableau des Kvs, dimensions, poids, servomoteur) : le DN « premier venu » n'est pas celui du modèle
      const gm = FE().gammeRobinet(L);
      if (gm) { r = { ...r, valeurs: { ...r.valeurs }, gamme: gm.titre, modeles: gm.modeles }; ['dn', 'kv', 'dp', 'tours', 'abaque'].forEach(k => { delete r.valeurs[k]; if (r.sources) delete r.sources[k]; }); }
      const v = r.valeurs; resume = [v.dn && `DN ${v.dn}`, v.kv && `Kvs ${nf(v.kv, 2)}`, v.dp && `${nf(v.dp)} kPa`, v.abaque && 'abaque'];
    }
    else if (type === 'capteur') { r = lireCapteur(L); const v = r.valeurs; resume = [v.grandeur && `capteur de ${Rg().GRANDEURS[v.grandeur] || v.grandeur}`, v.sortie && `sortie ${SORTIES[v.sortie] || v.sortie}`, v.alim && `alim. ${v.alim === '24V' ? '24 V' : v.alim === 'mono' ? '230 V' : v.alim}`]; }
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
      ...(r.sources ? { sources: r.sources } : {}), ...(r.gamme ? { gamme: r.gamme, modeles: r.modeles || [], ...(id.reference ? { refGamme: id.reference } : {}) } : {}) };
  }
  // Modèle choisi dans une documentation de gamme (liste lu.modeles) : valeurs et référence de ce modèle
  const choisirModele = (lu, k) => { const x = FE().choisir(lu, k); return x === lu ? lu : { ...x, nb: Object.keys(x.valeurs || {}).length, resume: [libelleModele(lu.modeles[k]), lu.resume.replace(/^documentation de gamme[^·]*·?\s*/, '')].filter(Boolean).join(' · ') }; };
  // Libellé lisible d'un modèle de gamme : référence et grandeur principale (« 500 L », « EXA 13 — 1 800 kW »,
  // « EX 1 — L 1,2 m — 540 W », « DN 50 — Kvs 164 »)
  const milliers = (y, d = 1) => { const t = String(Math.round(y * 10 ** d) / 10 ** d).split('.'); return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (t[1] ? `,${t[1]}` : ''); };
  function libelleModele(m) {
    if (!m) return '';
    const ref = String(m.ref || '').trim(), g = [];
    if (Number.isFinite(m.dn) && !/^DN\s*\d+$/i.test(ref)) g.push(`DN ${m.dn}`);
    if (Number.isFinite(m.kv)) g.push(`Kvs ${milliers(m.kv, 2)}`);
    if (Number.isFinite(m.P)) g.push(`${milliers(m.P)} kW`);
    if (Number.isFinite(m.Pfr)) g.push(`froid ${milliers(m.Pfr)} kW`);
    if (Number.isFinite(m.Qs)) g.push(`${milliers(m.Qs, 0)} m³/h`);
    if (Number.isFinite(m.Lmm)) g.push(`L ${milliers(m.Lmm / 1000, 2)} m`);
    if (Number.isFinite(m.P50)) g.push(`${milliers(m.P50, 0)} W`);
    // Capacité d'un ballon : la référence « 1000 L » s'écrit « 1 000 L »
    const capa = Number.isFinite(m.V) && new RegExp(`^${m.V}\\s*L$`, 'i').test(ref.replace(/\s(?=\d)/g, ''));
    if (Number.isFinite(m.V) && !capa) g.push(`${milliers(m.V, 0)} L`);
    if (m.servo) g.push(m.servo);
    return [capa ? `${milliers(m.V, 0)} L` : ref, ...g].filter(Boolean).join(' — ');
  }
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
  // Capteur, transmetteur, contrôleur de débit (instrumentation) : grandeur mesurée, signal de sortie (régulation de la ligne
  // d'armoire : mesure analogique, impulsions de comptage, contact), alimentation, consommation, indice IP, plage, DN
  const SORTIES = { '4-20mA': '4-20 mA', '0-10V': '0-10 V', impulsion: 'impulsions', relais: 'relais (contact)', bus: 'bus (M-Bus, Modbus…)' };
  function lireCapteur(L) {
    const v = {}, src = {}, X = L.map(norm), tout = X.join('\n'), tete = X.slice(0, 15).join(' '), num = s => Number(String(s).replace(',', '.'));
    const pose = (k, y, i) => { if (v[k] === undefined && y !== undefined && y !== '' && !(typeof y === 'number' && !Number.isFinite(y))) { v[k] = y; src[k] = i >= 0 ? L[i].trim().slice(0, 140) : ''; } };
    const ligne = re => X.findIndex(x => re.test(x));
    const g = [['debit', /debit|flow/], ['pression', /pression|pressure/], ['temperature', /temperature/], ['niveau', /niveau|level/], ['qualite d\'air', /co2|qualite d.air/]].find(([, re]) => re.test(tete));
    if (g) pose('grandeur', g[0], ligne(g[1]));
    // Signal de sortie : analogique d'abord (mesure continue), puis impulsions, contact (relais, TOR), bus
    const S = [['4-20mA', /4\s*(?:-|\.\.\.?|…|a)\s*20\s*ma/], ['0-10V', /0\s*(?:-|\.\.\.?|…|a)\s*10\s*v\b/], ['impulsion', /impulsions?|pulse/], ['relais', /relais|sortie tor|contact (?:sec|inverseur)|technologie relais|pouvoir de coupure/], ['bus', /m-?bus|modbus|bacnet|knx/]];
    const sx = S.find(([, re]) => re.test(tout)); if (sx) pose('sortie', sx[0], ligne(sx[1]));
    // Alimentation : 24 V (TBT, depuis l'armoire) ou 230 V (« 90…240 V AC » : réseau)
    X.forEach((x, i) => {
      if (v.alim === undefined && /alimentation|tension/.test(x)) {
        const plage = /(\d{2,3})\s*(?:\.{1,3}|…|-|a)\s*(\d{2,3})\s*(?:v\b|vac|vdc|ac\b|dc\b)/.exec(x), u = /(\d{2,3})\s*v(?:\b|ac|dc|ca|cc)/.exec(x), hi = plage ? +plage[2] : u ? +u[1] : 0;
        if (hi >= 90) pose('alim', 'mono', i); else if (hi >= 12 && hi <= 48) pose('alim', '24V', i);
      }
      if (/consommation|puissance absorbee|power consumption/.test(x)) { const m = /(\d+(?:[.,]\d+)?)\s*(?:va|w)\b/.exec(x) || /\[(?:va|w)\]\s*(\d+(?:[.,]\d+)?)/.exec(x); if (m && num(m[1]) > 0 && num(m[1]) <= 200) pose('Paux', num(m[1]), i); }
      if (/indice de protection|\bip\s*\d{2}\b/.test(x)) { const m = /\bip\s*(\d{2})\b/.exec(x); if (m) pose('ip', +m[1], i); }
      if (/plage de mesure|etendue de mesure|measuring range/.test(x)) { const m = /(?:plage|etendue) de mesure[^:\t]*[:\t]\s*(.+)$/.exec(L[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()); if (m) pose('plage', L[i].slice(L[i].length - m[1].length).trim().slice(0, 40), i); }
      if (v.dn === undefined) { const m = /\bdn\s*(\d{2,3})\b/.exec(x); if (m) pose('dn', +m[1], i); }
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
      // Ballon tampon : ballon en série ou de découplage du schéma de principe, ballon élément du schéma, ou nouveau ballon
      case 'tampon': return de('pid').flatMap(n => {
        const e = n.entrees || {}, pos = e.bouteille === 'ballon' ? 'découplage' : e.tampon === 'depart' ? 'départ' : e.tampon === 'oui' ? 'retour' : '';
        return [...(pos ? [[`tamp:${n.id}`, `${lib(n)} : ballon tampon (${pos})`]] : []),
          ...(e.ballons || []).map((b, i) => [b, i]).filter(([b]) => b && ['tampon', 'decouplage', 'stockage', undefined, ''].includes(b.fonction) && (b.fonction || b.rep || b.V)).map(([b, i]) => [`tamp:${n.id}|b${i}`, `${lib(n)} : ballon ${String(b.rep || '').trim() || `BAL${i + 1}`}`]),
          [`tamp:${n.id}|+`, `${lib(n)} : nouveau ballon tampon (production)`]];
      });
      // Capteur, instrumentation : ligne « sonde » de l'armoire électrique de l'étude
      case 'capteur': return de('elec').map(n => [`capt:${n.id}`, `${lib(n)} : capteur (ligne d'armoire)`]);
      // Document commercial : pièce jointe, sans lecture de caractéristiques
      case 'document': return [['doc:materiel', 'Joindre au matériel retenu'], ['doc:consultation', 'Joindre à la consultation']];
      default: return [];
    }
  }
  // Applique un élément du vrac : le modèle entre au registre des équipements de l'étude (ou y est mis à jour), puis il
  // est placé dans le calcul choisi ; nouvelleNote(type) crée un calcul ; renvoie un compte rendu
  const Rg = () => (typeof Registre !== 'undefined' ? Registre : require('./registre'));
  // Documentation de gamme dont le modèle n'est pas choisi : la gamme suit le modèle au registre (choix possible plus tard)
  const aChoisir = lu => !!(lu && lu.gamme && !lu.modele);
  const versRegistre = (et, item) => Rg().ajouter(et, { type: item.type, fabricant: item.lu.fabricant, reference: item.lu.reference, valeurs: item.lu.valeurs, nom: item.nom,
    ...(Rg().LIBRES[item.type] ? { qte: item.qte } : {}), ...(aChoisir(item.lu) ? { gamme: { titre: item.lu.gamme, modeles: item.lu.modeles || [], ...(item.lu.refGamme ? { refGamme: item.lu.refGamme } : {}) } } : {}) });
  function appliquer(et, item, cible, nouvelleNote) {
    // Document commercial : ni registre ni calcul (joint au matériel retenu ou à la consultation, ou ignoré)
    if (item.type === 'document') {
      const ou = { 'doc:materiel': 'joint au matériel retenu', 'doc:consultation': 'joint à la consultation' }[cible];
      return `${item.nom || 'Document'} : document commercial${ou ? `, ${ou}` : ' ignoré (non joint au matériel retenu ni à la consultation)'}`;
    }
    const x = versRegistre(et, item), gm = aChoisir(item.lu) ? ` — gamme ${item.lu.gamme} : modèle à choisir` : '';
    // Note de conduit de fumée : valeurs reportées dans le calcul annexe (générateur non repris)
    if (item.type === 'fumee' && !cible) return `${item.nom || 'Note de conduit'} : aucun calcul de conduit de fumée`;
    const m = cible ? Rg().placer(et, x, cible, { qte: item.qte, rep: item.rep, local: item.local, circuit: item.circuit, branche: item.branche, texte: (item.lignes || []).join(' ') }, nouvelleNote) : null;
    if (item.type === 'fumee') return m ? `${item.nom || 'Note de conduit'} : ${m}${item.lu.valeurs.generateur ? ` (générateur ${item.lu.valeurs.generateur})` : ''}` : `${item.nom || 'Note de conduit'} : aucun calcul de conduit de fumée`;
    if (m) return m + gm;
    return `${Rg().nomEq(x)} : inscrit au registre${Rg().LIBRES[item.type] ? ' (matériel retenu et DOE)' : ' (à placer)'}${gm}`;
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
  // Modèle d'une gamme le plus proche du besoin de la destination : puissance de la production (par générateur), volume du
  // ballon tampon calculé, débit de la CTA, volume du vase ou du ballon d'ECS calculé, DN du circuit ; plus petit modèle qui
  // couvre le besoin (sinon le plus grand). -1 : besoin inconnu (modèle à choisir)
  function besoin(et, type, cible) {
    const [g, rest = ''] = String(cible || '').split(':'), [id, sous] = rest.split('|'), n = ((et && et.notes) || []).find(y => y.id === id), num = y => Number(String(y ?? '').replace(',', '.')) || 0;
    // Entrées résolues (valeurs reprises des calculs reliés : besoins des terminaux, CTA…), sinon entrées saisies
    const e = (() => { if (!n) return {}; try { const Li = typeof Liens !== 'undefined' ? Liens : require('./liens'); return Li.resoudre(et, n).entrees || n.entrees || {}; } catch (er) { return n.entrees || {}; } })();
    const dims = () => { try { return Sc().dimensionner(e); } catch (er) { return null; } };
    const calc = (t, k) => { try { return num((N().calculer(t, e).valeurs || {})[k]); } catch (er) { return 0; } };
    if (!n) return null;
    if (type === 'generateur' && g === 'pid') { const d = dims(), nG = Math.max(1, num(e.nGen) || 1); return { cle: 'P', val: d && d.Pdem > 0 ? d.Pdem / nG : num(e.Pgen) }; }
    if (type === 'cta' && g === 'cta') return { cle: 'Qs', val: num(e.Qs) };
    if (type === 'tampon' && g === 'tamp') {
      const d = dims(); if (!d) return null;
      if (!sous) return { cle: 'V', val: d.tampon ? d.tampon.Vreq || d.tampon.V : 0 };
      if (sous === '+') return { cle: 'V', val: num(e.ratioTampon || 10) * (d.Pprod || 0) };
      // Index de l'élément saisi → index parmi les ballons remplis (ceux que dimensionne le schéma)
      const k = Number(sous.slice(1)), f = (e.ballons || []).slice(0, k).filter(y => y && (y.fonction || y.rep || num(y.V) > 0)).length, x = (d.ballons || []).find(y => y.i === f);
      return { cle: 'V', val: x ? x.Vcalc || x.V : 0 };
    }
    if (type === 'vase' && g === 'vase') return { cle: 'V', val: calc('vase', 'Vn') };
    if (type === 'ecs' && g === 'ecs') return { cle: 'V', val: calc('ecs', 'Vb') };
    if (type === 'robinet' && g === 'pidc') { const d = dims(), c = d && (d.circuits || []).find(y => y.rep === sous); return { cle: 'dn', val: c && c.t ? num(c.t.dn) : 0 }; }
    return null;
  }
  function modeleConseille(et, type, lu, cible) {
    const M = (lu && lu.modeles) || [], b = M.length ? besoin(et, type, cible) : null;
    if (!b || !(b.val > 0)) return -1;
    const ok = M.map((m, k) => [Number(m[b.cle]), k]).filter(([y]) => Number.isFinite(y) && y > 0);
    if (!ok.length) return -1;
    // DN : le même DN que le circuit d'abord
    const juste = ok.filter(([y]) => y >= b.val * (b.cle === 'dn' ? 1 : 0.999)).sort((p, q) => p[0] - q[0]);
    return juste.length ? juste[0][1] : ok.sort((p, q) => q[0] - p[0])[0][1];
  }
  // Destination (clé des destinations) d'un emplacement du registre : pour conseiller un modèle de gamme sur une fiche remplacée
  function cibleEmplacement(p) {
    const n = p && p.note; if (!n) return '';
    const el = p.el || {};
    switch (p.genre) {
      case 'pid': return `pid:${n.id}`;
      case 'cta': case 'vase': case 'ecs': return `${p.genre}:${n.id}`;
      case 'tamp': return `tamp:${n.id}`;
      case 'bal': return `tamp:${n.id}|b${p.i}`;
      case 'pompe': return `pidc:${n.id}|${el.circuit || ''}`;
      case 'rob': return n.type === 'pid' ? `pidc:${n.id}|${el.circuit || ''}` : `arbot:${n.id}|${el.troncon || ''}`;
      default: return '';
    }
  }
  const typeTerminal = (texte, v) => Rg().typeTerminal(texte, v);
  // Fiches au format Pipe-Fit collées les unes à la suite (séparées par une ligne « --- ») : une fiche par bloc
  const decouper = texte => String(texte || '').split(/^\s*-{3,}\s*$/m).map(b => b.split(/\r?\n/).filter(l => l.trim())).filter(b => b.length);
  return { TYPES, SORTIES, classer, lire, choisirModele, libelleModele, modeleConseille, cibleEmplacement, aChoisir, destinations, proposer, appliquer, versRegistre, decouper, typeTerminal, appareil };
})();
if (typeof module !== 'undefined') module.exports = Vrac;
