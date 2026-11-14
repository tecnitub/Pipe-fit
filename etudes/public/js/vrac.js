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
    vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS', bouche: 'Bouche, diffuseur, grille', robinet: 'Vanne, robinetterie, accessoire', sanitaire: 'Appareil sanitaire', regulateur: 'Régulateur, module d\'extension', inconnu: 'Non reconnu' };
  // Type d'équipement : ligne « Type : … » du format Pipe-Fit, sinon mots de la fiche et du nom du fichier
  const REGLES = [['sanitaire', /lavabo|lave-mains|mitigeur|douche|\bwc\b|cuvette|evier|vidoir|vide-seau|urinoir|bidet|baignoire|appareil sanitaire/],
    ['cta', /centrale de traitement|\bcta\b|double flux|air handling|unite de traitement d.air/], ['vase', /vase d.expansion|expansion vessel|\bvase\b/],
    ['generateur', /chaudiere|pompe a chaleur|\bpac\b|groupe (?:froid|de production|d.eau glacee)|chiller|heat pump|boiler|generateur/],
    ['terminal', /cassette|ventilo|gainable|aerotherme|poutre (?:froide|climatique)|radiateur|rideau d.air|unite interieure|\bsplit\b|terminal/],
    ['pompe', /circulateur|\bpompe\b|\bpump\b|accelerateur/], ['bouche', /diffuseur|grille|bouche|buse|plafonnier|diffuser|\bgrille\b/],
    ['ecs', /ballon|preparateur|\becs\b|chauffe-eau|eau chaude sanitaire/],
    ['robinet', /vanne|robinet|clapet|filtre|pot a boue|desemboueur|compteur d.energie|\bvalve\b|purgeur|soupape/],
    ['regulateur', /regulateur|controleur|controller|synco|module d.extension|automate/]];
  // Indices tirés des libellés « clé : valeur » (fiche au format Pipe-Fit ou fiche bien structurée)
  function indices(L) {
    const x = norm(L.join('\n')), a = re => re.test(x);
    if (a(/entrees? universelles?\s*:|sorties? relais\s*:|sorties? 0-10/)) return 'regulateur';
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
    else if (type === 'regulateur') { r = (typeof Regulation !== 'undefined' ? Regulation : require('./regulation')).lireFiche(L); const v = r.valeurs; resume = [v.app && `application ${v.app}`, v.X !== undefined && `${v.X} entrées`, v.Y !== undefined && `${v.Y} sorties 0-10 V`, v.Q !== undefined && `${v.Q} relais`]; }
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
      case 'regulateur': return de('elec').flatMap(n => [['production', 'production'], ['chauffage', 'chauffage et ECS'], ['ventilation', 'ventilation, CTA'], ['autre', 'auxiliaires'], ['extension', 'modules d\'extension']].map(([a, l]) => [`reg:${n.id}|${a}`, `${lib(n)} : régulateur ${l}`]));
      default: return [];
    }
  }
  // Applique un élément du vrac : le modèle entre au registre des équipements de l'étude (ou y est mis à jour), puis il
  // est placé dans le calcul choisi ; nouvelleNote(type) crée un calcul ; renvoie un compte rendu
  const Rg = () => (typeof Registre !== 'undefined' ? Registre : require('./registre'));
  const versRegistre = (et, item) => Rg().ajouter(et, { type: item.type, fabricant: item.lu.fabricant, reference: item.lu.reference, valeurs: item.lu.valeurs, nom: item.nom });
  function appliquer(et, item, cible, nouvelleNote) {
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
    if (type === 'vase' || type === 'ecs') return meilleur(k => { if (/:nouveau$/.test(k)) return 5; const n = note(k.split(':')[1]); return meme(n) ? -1 : (n && n.entrees && n.entrees.eq ? 6 : 0); });
    return cands[0][0];
  }
  const typeTerminal = (texte, v) => Rg().typeTerminal(texte, v);
  // Fiches au format Pipe-Fit collées les unes à la suite (séparées par une ligne « --- ») : une fiche par bloc
  const decouper = texte => String(texte || '').split(/^\s*-{3,}\s*$/m).map(b => b.split(/\r?\n/).filter(l => l.trim())).filter(b => b.length);
  return { TYPES, classer, lire, destinations, proposer, appliquer, versRegistre, decouper, typeTerminal };
})();
if (typeof module !== 'undefined') module.exports = Vrac;
