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
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const TYPES = { cta: 'Centrale de traitement d\'air', generateur: 'Générateur (chaudière, PAC, groupe froid)', pompe: 'Pompe, circulateur', terminal: 'Terminal (cassette, ventilo-convecteur…)',
    vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS', bouche: 'Bouche, diffuseur, grille', robinet: 'Vanne, robinetterie, accessoire', sanitaire: 'Appareil sanitaire', inconnu: 'Non reconnu' };
  // Type d'équipement : ligne « Type : … » du format Pipe-Fit, sinon mots de la fiche et du nom du fichier
  const REGLES = [['sanitaire', /lavabo|lave-mains|mitigeur|douche|\bwc\b|cuvette|evier|vidoir|vide-seau|urinoir|bidet|baignoire|appareil sanitaire/],
    ['cta', /centrale de traitement|\bcta\b|double flux|air handling|unite de traitement d.air/], ['vase', /vase d.expansion|expansion vessel|\bvase\b/],
    ['generateur', /chaudiere|pompe a chaleur|\bpac\b|groupe (?:froid|de production|d.eau glacee)|chiller|heat pump|boiler|generateur/],
    ['terminal', /cassette|ventilo|gainable|aerotherme|poutre (?:froide|climatique)|radiateur|rideau d.air|unite interieure|\bsplit\b|terminal/],
    ['pompe', /circulateur|\bpompe\b|\bpump\b|accelerateur/], ['bouche', /diffuseur|grille|bouche|buse|plafonnier|diffuser|\bgrille\b/],
    ['ecs', /ballon|preparateur|\becs\b|chauffe-eau|eau chaude sanitaire/],
    ['robinet', /vanne|robinet|clapet|filtre|pot a boue|desemboueur|compteur d.energie|\bvalve\b|purgeur|soupape/]];
  // Indices tirés des libellés « clé : valeur » (fiche au format Pipe-Fit ou fiche bien structurée)
  function indices(L) {
    const x = norm(L.join('\n')), a = re => re.test(x);
    if (a(/pression de gonflage|pression de prechargement|precharge/)) return 'vase';
    if (a(/abaque|nombre de tours|\bkvs?\s*:/) && !a(/puissance (?:chaud|froid|calorifique|frigorifique)/)) return 'robinet';
    if (a(/debit\s*:\s*[\d.,]+\s*l\s*\/\s*(?:s|min)\b/) && a(/pression minimale/)) return 'sanitaire';
    if (a(/courbe|hauteur manometrique|\bhmt\b/)) return 'pompe';
    if (a(/volume nominal|capacite/) && a(/echangeur|serpentin/)) return 'ecs';
    if (a(/db\s*\(a\)|lw/) && a(/\d\s*pa\b/) && !a(/\bkw\b/)) return 'bouche';
    if (a(/puissance (?:chaud|froid)\s*:/)) return 'terminal';
    if (a(/puissance (?:calorifique|frigorifique) nominale/)) return 'generateur';
    return null;
  }
  function classer(lignes, nom = '') {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String);
    const regle = z => { const r = REGLES.find(([, re]) => re.test(norm(z))); return r ? r[0] : null; };
    const t = L.map(l => /^\s*type(?: d.equipement| d.équipement)?\s*:\s*(.+)$/i.exec(l)).find(Boolean);
    if (t) return regle(t[1]) || 'inconnu';
    return regle(nom) || indices(L) || regle(L.slice(0, 40).join(' ')) || regle(L.join(' ')) || 'inconnu';
  }
  // Lecture par le lecteur du type : valeurs, fabricant, référence, résumé lisible
  function lire(type, lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String);
    const nf = (v, d = 1) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '');
    let r, resume = [];
    if (type === 'cta') { r = FC().lire(L); const v = r.valeurs; resume = [v.Qs && `${nf(v.Qs, 0)} m³/h`, v.PchBC && `chaud ${nf(v.PchBC)} kW`, v.PfrBF && `froid ${nf(v.PfrBF)} kW`]; }
    else if (type === 'terminal') { r = T().lireFiche(L); const v = r.valeurs; resume = [v.Pch && `chaud ${nf(v.Pch, 2)} kW`, v.Pfr && `froid ${nf(v.Pfr, 2)} kW`, v.Pvent && `${nf(v.Pvent, 0)} W`]; }
    else if (type === 'bouche') { r = SA().lireFicheBouche(L); const v = r.valeurs; resume = [v.Q && `${nf(v.Q, 0)} m³/h`, v.dp && `${nf(v.dp, 0)} Pa`, v.Lw && `${nf(v.Lw, 0)} dB(A)`]; }
    else if (type === 'robinet') { r = Sc().lireFicheRobinet(L); const v = r.valeurs; resume = [v.dn && `DN ${v.dn}`, v.kv && `Kvs ${nf(v.kv, 2)}`, v.dp && `${nf(v.dp)} kPa`, v.abaque && 'abaque']; }
    else if (type === 'sanitaire') { r = SAN().lireFichePoint(L); const v = r.valeurs; resume = [v.q && `${nf(v.q, 2)} L/s`, v.pMin && `${nf(v.pMin)} bar`]; }
    else { r = FE().lire(L); const v = r.valeurs, c = type === 'pompe' ? PO().lireFiche(L) : '';
      if (c) v.courbe = c;
      resume = type === 'pompe' ? [v.Q && v.H && `${nf(v.Q, 2)} m³/h × ${nf(v.H)} mCE`, v.P1 && `${nf(v.P1, 0)} W`, c && 'courbe'] : type === 'vase' ? [v.V && `${nf(v.V, 0)} L`, v.p0 && `${nf(v.p0)} bar`]
        : type === 'ecs' ? [v.V && `${nf(v.V, 0)} L`, v.P && `${nf(v.P)} kW`] : [v.P && `${nf(v.P, 0)} kW`, v.Pfr && `froid ${nf(v.Pfr, 0)} kW`, v.P1 && `${nf(v.P1 / 1000)} kW élec.`]; }
    return { valeurs: r.valeurs || {}, fabricant: r.fabricant || '', reference: r.reference || '', resume: resume.filter(Boolean).join(' · '), nb: Object.keys(r.valeurs || {}).length };
  }
  // Destinations possibles dans l'étude pour un type : [clé, libellé]
  function destinations(et, type) {
    const notes = (et && et.notes) || [], lib = n => `N${notes.indexOf(n) + 1} — ${n.titre}`, de = t => notes.filter(n => n.type === t);
    const circuits = de('pid').flatMap(n => ((n.entrees || {}).circuits || []).filter(c => c.rep).map(c => [`pidc:${n.id}|${c.rep}`, `${lib(n)} : circuit ${c.rep}`]));
    const nouveau = (t, l) => [[`${t}:nouveau`, `Nouveau calcul « ${l} »`]];
    switch (type) {
      case 'terminal': return [...de('terminaux').map(n => [`term:${n.id}`, lib(n)]), ...nouveau('term', 'Terminaux')];
      case 'cta': return [...de('cta').map(n => [`cta:${n.id}`, lib(n)]), ...nouveau('cta', 'Centrale de traitement d\'air')];
      case 'generateur': return de('pid').map(n => [`pid:${n.id}`, `${lib(n)} : production`]);
      case 'pompe': return [...circuits.map(([k, l]) => [k, `${l} (pompe du circuit)`]), ...de('arbo').map(n => [`arbo:${n.id}`, `${lib(n)} : pompe du réseau`]), ...de('reseau').map(n => [`reseau:${n.id}`, lib(n)]),
        ...de('terminaux').map(n => [`termp:${n.id}`, `${lib(n)} : pompe de distribution (à placer sur une branche)`])];
      case 'vase': return [...de('vase').map(n => [`vase:${n.id}`, lib(n)]), ...nouveau('vase', 'Vase d\'expansion')];
      case 'ecs': return [...de('ecs').map(n => [`ecs:${n.id}`, lib(n)]), ...nouveau('ecs', 'Production d\'ECS')];
      case 'bouche': return de('aero').filter(n => (n.entrees || {}).structure === 'arborescence').map(n => [`aero:${n.id}`, `${lib(n)} : bouches`]);
      case 'robinet': return [...circuits.map(([k, l]) => [k, `${l} (robinetterie)`]), ...de('arbo').flatMap(n => ((n.entrees || {}).troncons || []).filter(t => t.rep).map(t => [`arbot:${n.id}|${t.rep}`, `${lib(n)} : tronçon ${t.rep}`]))];
      case 'sanitaire': return de('sanitaire').map(n => [`san:${n.id}`, `${lib(n)} : points de puisage`]);
      default: return [];
    }
  }
  // Type de terminal et batterie d'après la fiche
  function typeTerminal(texte, v) {
    const x = norm(texte), q = /4 tubes|4t\b|quatre tubes/.test(x);
    const type = /cassette/.test(x) ? (q ? 'cassette4' : 'cassette2') : /gainable/.test(x) ? 'gainable' : /ventilo/.test(x) ? (q ? 'vc4' : 'vc2') : /aerotherme/.test(x) ? 'aerotherme' : /poutre/.test(x) ? 'poutre'
      : /rideau/.test(x) ? 'rideau' : /radiateur/.test(x) ? 'radiateur' : /split|unite interieure/.test(x) ? 'split' : 'autre';
    const batterie = q ? '4t' : v.Pch && v.Pfr ? '2t' : v.Pfr ? 'froide' : v.Pch ? 'chaude' : '2t';
    return { type, batterie, prefixe: { cassette2: 'CA', cassette4: 'CA', gainable: 'GA', vc2: 'VC', vc4: 'VC', aerotherme: 'AE', poutre: 'PF', rideau: 'RA', radiateur: 'RD', split: 'UI' }[type] || 'T' };
  }
  const prochain = (prefixe, deja) => { let k = 1, r; do { r = `${prefixe}-${String(k++).padStart(2, '0')}`; } while (deja.has(r)); deja.add(r); return r; };
  const typeOrgane = x => (/equilibr/.test(x) ? 'equilibrage' : /clapet/.test(x) ? 'clapet' : /filtre/.test(x) ? 'filtre' : /pot a boue|desemboueur/.test(x) ? 'desemboueur' : /compteur/.test(x) ? 'compteur'
    : /motoris|regulation|3 voies|2 voies/.test(x) ? 'regulation' : /manchette|anti-?vibr/.test(x) ? 'manchette' : /soupape/.test(x) ? 'soupape' : /purgeur/.test(x) ? 'purgeur' : /thermometre|manometre/.test(x) ? 'thermometre' : 'isolement');
  // Applique un élément du vrac à sa destination ; nouvelleNote(type) crée une note ; renvoie un compte rendu
  function appliquer(et, item, cible, nouvelleNote) {
    const [genre, rest = ''] = String(cible || '').split(':'), [id, sous] = rest.split('|'), notes = et.notes, nom = [item.lu.fabricant, item.lu.reference].filter(Boolean).join(' ');
    const fiche = { nom: String(item.nom || '').slice(0, 120), fabricant: item.lu.fabricant, reference: item.lu.reference }, v = item.lu.valeurs, qte = Math.max(1, Math.round(Number(item.qte) || 1));
    const cibleNote = t => { if (id === 'nouveau') { const n = nouvelleNote(t); notes.push(n); return n; } return notes.find(n => n.id === id && n.type === t); };
    const texte = (item.lignes || []).join(' ');
    if (genre === 'term' || genre === 'termp') {
      const n = cibleNote('terminaux'); if (!n) return null;
      const l = n.entrees.appareils = (n.entrees.appareils || []).filter(a => a.rep || a.local), deja = new Set(l.map(a => a.rep));
      const tt = genre === 'termp' ? { type: 'pompeDist', batterie: 'aucune', prefixe: 'PD' } : typeTerminal(texte, v), champs = {};
      Object.entries(T().LIBELLES).forEach(([k, d]) => { if (v[k] !== undefined) champs[d[2]] = v[k]; });
      if (genre === 'termp') { if (v.Q !== undefined) champs.Qp = v.Q; if (v.H !== undefined) champs.Hp = v.H; if (v.P1 !== undefined) champs.Pvent = v.P1; }
      for (let k = 0; k < qte; k++) l.push({ rep: item.rep && qte === 1 ? item.rep : prochain(tt.prefixe, deja), local: item.local || '', type: tt.type, n: 1, batterie: tt.batterie, vanne: genre === 'termp' ? 'aucune' : '2v', alim: 'cvc', regul: 'propre', ...champs, ref: nom, fiche, ...(item.circuit ? { circuit: item.circuit } : {}) });
      return `${qte} ${genre === 'termp' ? 'pompe(s)' : 'terminal(aux)'} ajouté(s) dans ${n.titre}`;
    }
    if (genre === 'cta') { const n = cibleNote('cta'); if (!n) return null; const r = FC().lire(item.lignes);
      FC().champs('cta', r.valeurs).forEach(c => { n.entrees[c.k] = c.val; }); n.entrees.fiche = FC().fiche(r, item.nom); if (nom && id === 'nouveau') n.titre = `CTA ${nom}`; return `${n.titre} : ${FC().champs('cta', r.valeurs).length} valeur(s) reprise(s)`; }
    if (genre === 'pid') { const n = notes.find(x => x.id === id && x.type === 'pid'); if (!n) return null; const r = FE().lire(item.lignes);
      FE().champs('pid', r.valeurs).forEach(c => { n.entrees[c.k] = c.val; }); n.entrees.fiche = FE().fiche(r, item.nom); return `${n.titre} : production ${nom}`; }
    if (genre === 'pidc') { const n = notes.find(x => x.id === id && x.type === 'pid'); if (!n) return null;
      if (item.type === 'pompe') { const l = n.entrees.pompesFab = (n.entrees.pompesFab || []).filter(p => p.circuit !== sous); l.push({ circuit: sous, ref: nom, courbe: v.courbe || '', fiche }); return `Pompe du circuit ${sous} : ${nom}${v.courbe ? ' (courbe)' : ''}`; }
      const l = n.entrees.robinetterie = n.entrees.robinetterie || [];
      l.push({ rep: item.rep || `${typeOrgane(norm(texte)).slice(0, 2).toUpperCase()}${l.length + 1}`, circuit: sous, type: typeOrgane(norm(texte)), dn: v.dn || '', qte, kv: v.kv || '', dp: v.kv ? '' : v.dp || '', tours: v.tours || '', abaque: v.abaque || '', ref: nom, fiche });
      return `Robinetterie du circuit ${sous} : ${nom}`;
    }
    if (genre === 'arbo') { const n = notes.find(x => x.id === id && x.type === 'arbo'); if (!n) return null; Object.assign(n.entrees, { pompeRef: nom, pompeCourbe: v.courbe || n.entrees.pompeCourbe || '', pompeFiche: fiche }); return `Pompe de ${n.titre} : ${nom}`; }
    if (genre === 'arbot') { const n = notes.find(x => x.id === id && x.type === 'arbo'); if (!n) return null; const l = n.entrees.robinetterie = n.entrees.robinetterie || [];
      l.push({ rep: item.rep || `${typeOrgane(norm(texte)).slice(0, 2).toUpperCase()}${l.length + 1}`, troncon: sous, type: typeOrgane(norm(texte)), dn: v.dn || '', qte, kv: v.kv || '', dp: v.kv ? '' : v.dp || '', tours: v.tours || '', abaque: v.abaque || '', ref: nom, fiche });
      return `Robinetterie du tronçon ${sous} : ${nom}`; }
    if (genre === 'reseau' || genre === 'vase' || genre === 'ecs') { const n = cibleNote(genre); if (!n) return null; const r = FE().lire(item.lignes);
      FE().champs(genre, r.valeurs).forEach(c => { n.entrees[c.k] = c.val; }); n.entrees.fiche = FE().fiche(r, item.nom); return `${n.titre} : fiche ${nom}`; }
    if (genre === 'aero') { const n = notes.find(x => x.id === id && x.type === 'aero'); if (!n) return null; const l = n.entrees.bouchesL = n.entrees.bouchesL || [], deja = new Set(l.map(b => b.rep));
      for (let k = 0; k < qte; k++) l.push({ rep: item.rep && qte === 1 ? item.rep : prochain('B', deja), reseau: 'soufflage', salle: item.local || '', etage: '', type: 'plafond', Q: v.Q || '', troncon: '', dp: v.dp ?? '', Lw: v.Lw ?? '', ref: nom, fiche });
      return `${qte} bouche(s) ajoutée(s) dans ${n.titre} (tronçon à choisir)`; }
    if (genre === 'san') { const n = notes.find(x => x.id === id && x.type === 'sanitaire'); if (!n) return null; const l = n.entrees.points = n.entrees.points || [], deja = new Set(l.map(p => p.rep)), x = norm(texte);
      const type = /douche/.test(x) ? 'douche' : /baignoire/.test(x) ? 'baignoire' : /evier/.test(x) ? 'evier' : /wc|cuvette/.test(x) ? 'wc' : /urinoir/.test(x) ? 'urinoir' : /vidoir|vide-seau/.test(x) ? 'videSeau' : /lave-mains/.test(x) ? 'laveMains' : 'lavabo';
      for (let k = 0; k < qte; k++) l.push({ rep: prochain(type.slice(0, 2).toUpperCase(), deja), salle: item.local || '', etage: '', type, troncon: '', qEF: v.q || '', qECS: v.q || '', pMin: v.pMin || '', ref: nom, fiche });
      return `${qte} point(s) de puisage ajouté(s) dans ${n.titre} (tronçon à choisir)`; }
    return null;
  }
  // Fiches au format Pipe-Fit collées les unes à la suite (séparées par une ligne « --- ») : une fiche par bloc
  const decouper = texte => String(texte || '').split(/^\s*-{3,}\s*$/m).map(b => b.split(/\r?\n/).filter(l => l.trim())).filter(b => b.length);
  return { TYPES, classer, lire, destinations, appliquer, decouper, typeTerminal };
})();
if (typeof module !== 'undefined') module.exports = Vrac;
