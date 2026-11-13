// Estimation des puissances et des débits manquants d'une étude (avant-projet) : terminal sans puissance, circuit du
// schéma de principe sans puissance, CTA sans débit d'air, production sans puissance de générateur.
// Base : surface des locaux (bilans pièce par pièce, annexes de l'inventaire, sinon surface saisie une fois par zone),
// type de bâtiment et neuf / existant de l'étude, ratios W/m² et débits d'air réglementaires ci-dessous.
// Chaque valeur estimée est marquée dans la note : `_estimes: { champ: { estime: true, v, origine } }` (sur les entrées
// pour un champ simple, sur la ligne pour une colonne d'une liste). Elle n'est posée que sur une valeur vide, jamais sur une
// valeur saisie ou lue ; elle cesse d'être une estimation dès qu'une valeur réelle existe : valeur modifiée (saisie),
// valeur reprise d'un autre calcul (bilan, fiche technique, terminaux reliés, réseau aéraulique), besoin du bilan pièce
// par pièce de son local (qui la remplace). Module pur (testé sous Node).
const Estimations = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const Nt = () => (typeof Notes !== 'undefined' ? Notes : require('./notes'));
  const Ln = () => essai(() => (typeof Liens !== 'undefined' ? Liens : require('./liens')));
  const Pc = () => essai(() => (typeof Pieces !== 'undefined' ? Pieces : require('./pieces')));
  const Sch = () => essai(() => (typeof Schema !== 'undefined' ? Schema : require('./schema')));
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const vide = v => v === '' || v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const plafond = (x, pas) => Math.ceil(x / pas - 1e-9) * pas;
  const r1 = x => Math.round(x * 10) / 10;

  /* ---------- Ratios documentés ---------- */
  // Puissance de chauffage (déperditions de base, renouvellement d'air hygiénique compris) par m² de surface utile, pour
  // une température extérieure de base de −7 °C et 19 °C intérieurs (ΔT 26 K), hauteur sous plafond courante (2,5 à 3 m ;
  // gymnase : grand volume rapporté au m² de sol). Ordres de grandeur d'avant-projet couramment admis par les bureaux
  // d'études (guides COSTIC / AICVF, retours de dimensionnement) : neuf = RT 2012 / RE 2020 (30 à 50 W/m²) ; existant =
  // bâtiment des années 1970 à 2000 non rénové (80 à 120 W/m²). Valeurs prises dans le haut de la fourchette (prudentes).
  // [neuf, existant] en W/m²
  const CHAUD = { bureaux: [45, 90], enseignement: [50, 100], ehpad: [45, 90], creche: [50, 100], gymnase: [50, 110], logement: [35, 80],
    hotel: [40, 85], commerce: [50, 100], restauration: [55, 110], industrie: [60, 120] };
  // Puissance frigorifique (apports internes et solaires, air neuf compris) par m², climatisation de confort à 26 °C
  // intérieurs, 32 à 35 °C extérieurs ; ordres de grandeur usuels (bureaux 60 à 100 W/m², restauration > 120 W/m²).
  const FROID = { bureaux: [70, 90], enseignement: [60, 80], ehpad: [50, 70], creche: [50, 70], gymnase: [50, 70], logement: [40, 55],
    hotel: [60, 80], commerce: [90, 110], restauration: [120, 140], industrie: [80, 100] };
  // Débits d'air neuf réglementaires par usage : m³/h par occupant (q) et surface par occupant (m², densité d'occupation
  // usuelle des locaux) ; logement : débit par m² (≈ 0,5 vol/h).
  //  - Code du travail, art. R. 4222-6 (locaux à pollution non spécifique) : bureaux et locaux sans travail physique
  //    25 m³/h/occupant ; locaux de restauration, de vente, de réunion 30 ; ateliers, travail physique léger 45, autres 60 ;
  //  - Règlement sanitaire départemental type, art. 64 (locaux recevant du public) : classes maternelles et primaires 15,
  //    secondaires 18, chambres et hébergement 18, restauration 22, locaux de sport 25.
  //  Le plus exigeant des deux textes est retenu quand les deux s'appliquent.
  const AIR = {
    bureaux: { q: 25, m2: 10, source: 'Code du travail R. 4222-6 : 25 m³/h par occupant (bureaux), 1 occupant pour 10 m²' },
    enseignement: { q: 18, m2: 2.5, source: 'RSDT art. 64 : 18 m³/h par élève (15 en primaire), 1 élève pour 2,5 m²' },
    creche: { q: 15, m2: 4, source: 'RSDT art. 64 : 15 m³/h par enfant, 1 enfant pour 4 m²' },
    ehpad: { q: 25, m2: 12, source: 'RSDT art. 64 / Code du travail : 25 m³/h par occupant (hébergement, lieux de vie), 1 occupant pour 12 m²' },
    gymnase: { q: 25, m2: 10, source: 'RSDT art. 64 : 25 m³/h par occupant (locaux de sport), 1 occupant pour 10 m²' },
    logement: { parM2: 1.35, source: 'Arrêté du 24 mars 1982 : ≈ 0,5 vol/h, soit 1,35 m³/h par m² (2,7 m sous plafond)' },
    hotel: { q: 18, m2: 12, source: 'RSDT art. 64 : 18 m³/h par occupant (chambres), 1 occupant pour 12 m²' },
    commerce: { q: 30, m2: 5, source: 'Code du travail R. 4222-6 : 30 m³/h par occupant (locaux de vente), 1 occupant pour 5 m²' },
    restauration: { q: 30, m2: 1.5, source: 'Code du travail R. 4222-6 : 30 m³/h par occupant (restauration ; RSDT : 22), 1 couvert pour 1,5 m²' },
    industrie: { q: 45, m2: 10, source: 'Code du travail R. 4222-6 : 45 m³/h par occupant (atelier, travail physique léger), 1 occupant pour 10 m²' },
  };
  // Simultanéité des besoins pour la production : chauffage 1 (les déperditions de base sont simultanées par grand froid) ;
  // froid 0,8 (foisonnement des apports solaires et internes selon les orientations et l'occupation)
  const SIMULTANEITE = { chaud: 1, froid: 0.8 };
  const TBASE_REF = -7, TINT = 19;

  const typeEtude = et => (et && CHAUD[et.typeBatiment] ? et.typeBatiment : 'bureaux');
  const libType = et => { const t = et && et.typeBatiment; return CHAUD[t] ? t : 'bureaux (type de bâtiment non précisé)'; };
  const etat = et => (et && et.neuf === 'oui' ? 0 : 1); // non précisé : existant (prudent)
  const libEtat = et => (et && et.neuf === 'oui' ? 'neuf' : et && et.neuf === 'non' ? 'existant' : 'existant (non précisé)');
  // Ratio W/m² de l'étude pour une saison ; chauffage corrigé de la température de base du climat de l'étude
  function ratio(et, saison) {
    const t = typeEtude(et), k = etat(et);
    if (saison === 'froid') return { v: FROID[t][k], origine: `${FROID[t][k]} W/m² en froid (${libType(et)}, ${libEtat(et)})` };
    let f = 1, cl = null;
    const L = Ln(); if (L && L.climatEtude) cl = essai(() => L.climatEtude(et));
    if (cl && Number.isFinite(cl.Tbase)) f = Math.min(1.5, Math.max(0.6, (TINT - cl.Tbase) / (TINT - TBASE_REF)));
    const v = Math.round(CHAUD[t][k] * f);
    return { v, origine: `${v} W/m² en chaud (${libType(et)}, ${libEtat(et)}${f !== 1 ? `, base ${cl.Tbase} °C` : ''})` };
  }
  // Débit d'air neuf (m³/h) d'une surface selon l'usage du bâtiment
  function debitAir(et, S) {
    const a = AIR[typeEtude(et)];
    if (a.parM2) return { v: plafond(S * a.parM2, 10), origine: a.source };
    return { v: plafond(S / a.m2 * a.q, 10), origine: a.source };
  }

  /* ---------- Surfaces ---------- */
  // Surfaces connues par zone (clé normalisée) : saisies (et.surfaces), bilans pièce par pièce, annexes de l'inventaire
  function surfaces(et) {
    const out = new Map();
    (((et && et.inventaire) || []).filter(x => x.inclus !== false && x.local && num(x.S) > 0)).forEach(x => {
      const k = norm(x.local); if (!out.has(k)) out.set(k, { nom: x.local, S: num(x.S), source: 'annexe du dossier' });
    });
    const P = Pc();
    if (P && ((et && et.notes) || []).some(n => n.type === 'pieces')) {
      const b = essai(() => P.besoinsEtude(et)) || {};
      Object.values(b).forEach(p => { if (num(p.S) > 0) out.set(norm(p.nom), { nom: p.nom, S: num(p.S), source: 'bilan pièce par pièce' }); });
    }
    Object.entries((et && et.surfaces) || {}).forEach(([k, z]) => { if (z && num(z.S) > 0) out.set(k, { nom: z.nom || k, S: num(z.S), source: 'surface saisie' }); });
    return out;
  }
  // Besoins des pièces des bilans (puissances réelles) par local
  const besoins = et => { const P = Pc(), out = {}; if (P && ((et && et.notes) || []).some(n => n.type === 'pieces')) Object.values(essai(() => P.besoinsEtude(et)) || {}).forEach(p => { out[norm(p.nom)] = p; }); return out; };

  /* ---------- Marques ---------- */
  const estMarque = (o, k) => !!(o && o._estimes && o._estimes[k] && String(o[k]) === String(o._estimes[k].v));
  const marque = (o, k) => (estMarque(o, k) ? o._estimes[k] : null);
  function demarquer(o, k) { if (!o || !o._estimes || !o._estimes[k]) return false; delete o._estimes[k]; if (!Object.keys(o._estimes).length) delete o._estimes; return true; }
  function marquer(o, k, v, origine) { o[k] = v; o._estimes = o._estimes || {}; o._estimes[k] = { estime: true, v, origine }; }
  // Une valeur peut recevoir une estimation : vide, ou déjà estimée et inchangée (rafraîchie)
  const libre = (o, k) => vide(o[k]) || estMarque(o, k);
  // Marques devenues caduques (valeur modifiée depuis : c'est une saisie) retirées
  function nettoyer(o) { if (!o || !o._estimes) return 0; let k = 0; Object.keys(o._estimes).forEach(c => { if (!estMarque(o, c)) { demarquer(o, c); k++; } }); return k; }

  /* ---------- Analyse et application ---------- */
  const resoudre = (et, n) => { const L = Ln(); return (L && essai(() => L.resoudre(et, n))) || { entrees: n.entrees || {}, verrous: {} }; };
  const SAISONS_BAT = { chaude: ['chaud'], elec: ['chaud'], froide: ['froid'], 'froide+elec': ['froid'], '2t': ['chaud', 'froid'], '4t': ['chaud', 'froid'], aucune: [] };
  // Applique les estimations à l'étude (modifiée) ; rend { estimees, reelles, manquantes, retirees }
  //  - estimees : [{ note, cle, v, origine }] valeurs estimées posées ou rafraîchies ;
  //  - reelles : [{ note, cle, v, origine }] valeurs réelles reprises (bilan pièce par pièce) à la place d'une estimation ;
  //  - manquantes : [{ cle, nom, pour: [libellés] }] zones dont la surface est à saisir pour estimer ;
  //  - retirees : nombre de marques retirées (valeur saisie ou reprise d'un autre calcul depuis).
  function appliquer(et, opts = {}) {
    const notes = (et && et.notes) || [], S = surfaces(et), B = besoins(et), out = { estimees: [], reelles: [], manquantes: [], retirees: 0 };
    const manque = new Map();
    // rafraichir : seules les estimations déjà en place sont recalculées ou remplacées (aucune nouvelle sur une valeur vide)
    const peut = (o, k) => (opts.rafraichir ? estMarque(o, k) : libre(o, k));
    const demander = (nom, pour) => { const k = norm(nom) || 'batiment'; const z = manque.get(k) || { cle: k, nom: nom || 'Bâtiment', pour: [] }; if (!z.pour.includes(pour)) z.pour.push(pour); manque.set(k, z); };
    const surf = nom => S.get(norm(nom));
    const poser = (n, o, k, cle, v, origine) => { if (!opts.simulation) marquer(o, k, v, origine); out.estimees.push({ note: n.id, cle, v, origine }); };
    const reel = (n, o, k, cle, v, origine) => { if (!opts.simulation) { o[k] = v; demarquer(o, k); } out.reelles.push({ note: n.id, cle, v, origine }); };
    // Marque d'une valeur désormais reprise d'un autre calcul (verrou) : retirée
    const verrouille = (n, o, k, cle, verrous) => { if (verrous[cle]) { if (!opts.simulation && demarquer(o, k)) out.retirees++; return true; } return false; };
    if (!opts.simulation) notes.forEach(n => { const e = n.entrees || {}; out.retirees += nettoyer(e); Object.values(e).forEach(v => { if (Array.isArray(v)) v.forEach(l => { if (l && typeof l === 'object') out.retirees += nettoyer(l); }); }); });

    // 1. Terminaux : puissance chaud / froid de chaque appareil d'après son local (bilan, sinon surface × ratio)
    const inv = new Map(((et && et.inventaire) || []).map(x => [x.id, x]));
    notes.filter(n => n.type === 'terminaux').forEach(n => {
      const e = n.entrees || {}, ap = (e.appareils || []).filter(a => a && typeof a === 'object'), v = resoudre(et, n).verrous || {};
      const zone = a => String(a.local || '').trim() || String(a.zone || '').trim() || (a._zone || '') || 'Bâtiment';
      const parZone = new Map(); ap.forEach(a => { const z = norm(zone(a)); parZone.set(z, (parZone.get(z) || 0) + 1); });
      ap.forEach(a => {
        const i = (e.appareils || []).indexOf(a), z = zone(a), nb = parZone.get(norm(z)) || 1, b = B[norm(a.local)];
        // Split : unité intérieure seulement (une unité extérieure, en toiture ou en terrasse n'a pas de local à traiter)
        const ext = a.type === 'split' && /ext[ée]rieur|toiture|terrasse|\bue\b|groupe/i.test(`${a.local || ''} ${a.ref || ''} ${(inv.get(a._inv) || {}).designation || ''}`);
        const saisons = ext ? [] : a.type === 'split' ? ['chaud', 'froid'] : SAISONS_BAT[a.batterie || 'chaude'] || [];
        saisons.forEach(s => {
          const k = s === 'froid' ? 'Pfr' : 'Pch', cle = `appareils.${i}.${k}`;
          if (verrouille(n, a, k, cle, v) || !peut(a, k)) return;
          if (b && num(s === 'froid' ? b.Pfr : b.Pch) > 0) return reel(n, a, k, cle, plafond((s === 'froid' ? b.Pfr : b.Pch) / Math.max(1, ap.filter(x => norm(x.local) === norm(a.local)).length), 0.1), `bilan pièce par pièce (${b.nom})`);
          const su = surf(z);
          if (!su) return demander(z, `${a.rep || 'terminal'} (${s === 'froid' ? 'froid' : 'chaud'})`);
          const rt = ratio(et, s), P = plafond(su.S * rt.v / 1000 / nb, 0.1);
          poser(n, a, k, cle, r1(P), `${su.S} m² (${su.source}${nb > 1 ? `, partagés entre ${nb} terminaux` : ''}) × ${rt.origine}`);
        });
      });
    });
    // 2. CTA : débit d'air neuf d'après la surface desservie et l'usage
    notes.filter(n => n.type === 'cta').forEach(n => {
      const e = n.entrees = n.entrees || {}, v = resoudre(et, n).verrous || {}, x = inv.get(n.origineInv), z = String((x && x.local) || '').trim() || n.titre || 'CTA';
      const champs = ['Qs', ...(e.type !== 'simple' ? ['Qr'] : [])].filter(k => !verrouille(n, e, k, k, v) && peut(e, k));
      if (!champs.length) return;
      const su = surf(z);
      if (!su) return demander(z, `${n.titre || 'CTA'} (débit d'air)`);
      const d = debitAir(et, su.S);
      champs.forEach(k => poser(n, e, k, k, d.v, `${su.S} m² (${su.source}) — ${d.origine}`));
    });
    // 3. Circuits des schémas de principe sans puissance (ni bilan, ni réseau annexe, ni terminaux reliés)
    const Sc = Sch();
    notes.filter(n => n.type === 'pid').forEach(n => {
      const e = n.entrees || {}, r = resoudre(et, n), v = r.verrous || {}, re = r.entrees || {};
      const R = Sc && Sc.REGIMES[re.reseau], co = re.reseau === 'co', froidSchema = re.reseau === 'perso' ? num(re.Tdep) < num(re.Tret) : !!(R && R[1] < R[2]);
      (e.circuits || []).forEach((c, i) => {
        if (!c || typeof c !== 'object' || c.annexe || c.bilan || ['ecs', 'process', 'sousstation'].includes(c.emetteur)) return;
        const froidC = froidSchema || c.emetteur === 'plafond' || (/^(\d+)\/(\d+)$/.test(String(c.regime || '').trim()) && (() => { const [d, t] = String(c.regime).split('/').map(Number); return d < t; })());
        const champs = co ? [['P', 'chaud'], ['Pf', 'froid']] : [['P', froidC ? 'froid' : 'chaud']];
        champs.forEach(([k, s]) => {
          const cle = `circuits.${i}.${k}`;
          if (verrouille(n, c, k, cle, v) || !peut(c, k)) return;
          const su = surf(c.rep);
          if (!su) return demander(c.rep || `Circuit ${i + 1}`, `circuit « ${c.rep || i + 1} » de ${n.titre || 'schéma'} (${s})`);
          const rt = ratio(et, s);
          poser(n, c, k, cle, plafond(su.S * rt.v / 1000, 1), `${su.S} m² (${su.source}) × ${rt.origine}`);
        });
      });
    });
    // 4. Production sans puissance de générateur : somme des besoins des circuits × simultanéité, répartie sur les générateurs
    // Besoins incomplets (zone sans surface, terminal sans puissance) : pas de puissance de production estimée
    const incomplet = manque.size > 0 || notes.some(n => n.type === 'terminaux' && ((n.entrees || {}).appareils || []).some(a => a && a.rep && (SAISONS_BAT[a.batterie || 'chaude'] || []).some(s => vide(a[s === 'froid' ? 'Pfr' : 'Pch']))));
    if (!incomplet) notes.filter(n => n.type === 'pid').forEach(n => {
      const e = n.entrees = n.entrees || {}, r = resoudre(et, n), v = r.verrous || {}, re = r.entrees || {};
      if ((re.generateurs || []).some(g => g && num(g.P) > 0)) return;
      if (verrouille(n, e, 'Pgen', 'Pgen', v) || !peut(e, 'Pgen')) return;
      const R = Sc && Sc.REGIMES[re.reseau], froid = re.reseau === 'perso' ? num(re.Tdep) < num(re.Tret) : !!(R && R[1] < R[2]);
      const cs = (re.circuits || []).filter(c => c && (c.rep || c.P)), P = cs.reduce((s, c) => s + (num(c.P) > 0 ? num(c.P) : 0), 0), sans = cs.filter(c => !(num(c.P) > 0)).length;
      // Tous les circuits doivent avoir leur puissance (réelle ou estimée) : sinon la somme serait trompeuse
      if (!(P > 0) || sans) return;
      const s = froid ? 'froid' : 'chaud', k = SIMULTANEITE[s], nG = Math.max(1, Math.round(num(re.nGen) || 1)), Pg = plafond(P * k / nG, 1);
      poser(n, e, 'Pgen', 'Pgen', Pg, `${r1(P)} kW de besoins (${cs.length} circuit(s)) × simultanéité ${String(k).replace('.', ',')} (${s})${nG > 1 ? ` / ${nG} générateurs` : ''}`);
    });
    out.manquantes = [...manque.values()];
    return out;
  }
  // Valeurs estimées en place (marque présente, valeur inchangée) : [{ note, cle, libelle, v, origine }]
  // Libellé d'un champ (ou d'une colonne d'une liste) du calcul, unité comprise
  const libChamp = (type, k, liste) => {
    const T = essai(() => Nt().TYPES[type]) || {}, c = (T.champs || []).find(x => x.k === (liste || k));
    const col = liste ? ((c && c.colonnes) || []).find(x => x.k === k) : c;
    return col ? `${col.l}${col.u ? ` (${col.u})` : ''}` : k;
  };
  function enPlace(et) {
    const out = [];
    ((et && et.notes) || []).forEach(n => {
      const e = n.entrees || {};
      Object.entries(e._estimes || {}).forEach(([k, m]) => { if (estMarque(e, k)) out.push({ note: n.id, cle: k, libelle: libChamp(n.type, k), v: m.v, origine: m.origine }); });
      Object.entries(e).forEach(([lk, l]) => { if (Array.isArray(l)) l.forEach((o, i) => { if (o && o._estimes) Object.entries(o._estimes).forEach(([k, m]) => { if (estMarque(o, k)) out.push({ note: n.id, cle: `${lk}.${i}.${k}`, libelle: `${o.rep || o.designation || i + 1} — ${libChamp(n.type, k, lk)}`, v: m.v, origine: m.origine }); }); }); });
    });
    return out;
  }
  // Estimations d'une note confirmées : deviennent des valeurs saisies
  function confirmer(n) {
    const e = (n && n.entrees) || {}; let k = 0;
    if (e._estimes) { k += Object.keys(e._estimes).length; delete e._estimes; }
    Object.values(e).forEach(v => { if (Array.isArray(v)) v.forEach(o => { if (o && o._estimes) { k += Object.keys(o._estimes).length; delete o._estimes; } }); });
    return k;
  }
  // Surface d'une zone saisie (une fois par zone) : et.surfaces[clé] = { nom, S }
  function saisirSurface(et, nom, S) {
    const k = norm(nom) || 'batiment';
    et.surfaces = et.surfaces || {};
    if (num(S) > 0) et.surfaces[k] = { nom, S: num(S) }; else delete et.surfaces[k];
    return k;
  }
  return { CHAUD, FROID, AIR, SIMULTANEITE, ratio, debitAir, surfaces, appliquer, enPlace, confirmer, saisirSurface, estMarque, marque, marquer, demarquer, nettoyer, norm };
})();
if (typeof module !== 'undefined') module.exports = Estimations;
