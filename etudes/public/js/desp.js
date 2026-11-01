// Classement des équipements sous pression selon la directive 2014/68/UE (DESP), transposée au Code de l'environnement (R557-9).
// Pur calcul (navigateur et node) : à partir de PS, TS, du fluide, du DN (tuyauterie) ou du volume (récipient, générateur),
// dit si l'équipement est exclu (PS ≤ 0,5 bar), relève de l'article 4.3 (règles de l'art) ou d'une catégorie I à IV.
const Desp = (() => {
  // Fluides courants : état physique à la pression atmosphérique et groupe (1 = dangereux : inflammable, toxique, comburant ; 2 = autres)
  // etat 'eau' : liquide ou gaz selon la pression de vapeur à TS ; 'gaz' : gaz, gaz liquéfié ou vapeur ; 'liquide' : liquide.
  // eclair : point d'éclair (°C) d'un liquide inflammable, groupe 1 seulement si TS dépasse le point d'éclair.
  const FLUIDES = {
    'eau': { libelle: 'Eau (chauffage, eau glacée, ECS, process)', etat: 'eau', groupe: 2 },
    'eau-glycolee': { libelle: 'Eau glycolée', etat: 'eau', groupe: 2 },
    'eau-surchauffee': { libelle: 'Eau surchauffée', etat: 'eau', groupe: 2 },
    'vapeur': { libelle: 'Vapeur d\'eau', etat: 'gaz', groupe: 2 },
    'condensats': { libelle: 'Condensats (retour vapeur)', etat: 'eau', groupe: 2 },
    'air': { libelle: 'Air comprimé', etat: 'gaz', groupe: 2 },
    'azote': { libelle: 'Azote', etat: 'gaz', groupe: 2 },
    'co2': { libelle: 'CO₂ / R744', etat: 'gaz', groupe: 2 },
    'argon': { libelle: 'Argon, gaz inertes', etat: 'gaz', groupe: 2 },
    'r410a': { libelle: 'R410A / R134a / R407C / R513A (frigorigènes A1)', etat: 'gaz', groupe: 2 },
    'r32': { libelle: 'R32 / R454B / R1234yf / R1234ze (frigorigènes A2L)', etat: 'gaz', groupe: 1 },
    'r290': { libelle: 'Propane R290 / isobutane R600a', etat: 'gaz', groupe: 1 },
    'nh3': { libelle: 'Ammoniac R717', etat: 'gaz', groupe: 1 },
    'gaz-naturel': { libelle: 'Gaz naturel', etat: 'gaz', groupe: 1 },
    'propane': { libelle: 'Propane / butane (GPL)', etat: 'gaz', groupe: 1 },
    'hydrogene': { libelle: 'Hydrogène', etat: 'gaz', groupe: 1 },
    'oxygene': { libelle: 'Oxygène', etat: 'gaz', groupe: 1 },
    'acetylene': { libelle: 'Acétylène', etat: 'gaz', groupe: 1, instable: true },
    'fioul': { libelle: 'Fioul domestique / gazole', etat: 'liquide', groupe: 2, eclair: 55 },
    'huile-thermique': { libelle: 'Huile thermique (fluide caloporteur)', etat: 'liquide', groupe: 2, eclair: 200, vapeur: true },
    'solvant': { libelle: 'Liquide inflammable (solvant, alcool)', etat: 'liquide', groupe: 1 },
    'soude': { libelle: 'Soude, acides, liquides corrosifs non inflammables', etat: 'liquide', groupe: 2 },
  };
  const PATM = 1.01325;
  // Pression de vapeur saturante de l'eau (bar absolus), équation d'Antoine (1 à 374 °C)
  function pvapEau(T) {
    const [A, B, Cc] = T <= 100 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
    return 10 ** (A - B / (Cc + T)) * PATM / 760;
  }
  // Température au-delà de laquelle l'eau est un « gaz » au sens de la directive (pression de vapeur > 0,5 bar effectif) ≈ 111 °C
  const T_EAU_GAZ = (() => { let a = 90, b = 130; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (pvapEau(m) - PATM > 0.5) b = m; else a = m; } return (a + b) / 2; })();

  // Nature du fluide à TS : { etat: 'liquide'|'gaz', groupe, raison }
  function nature(fluide, TS, perso = {}) {
    const f = FLUIDES[fluide] || { libelle: perso.libelle || 'Fluide saisi', etat: perso.etat === 'gaz' ? 'gaz' : 'liquide', groupe: Number(perso.groupe) === 1 ? 1 : 2 };
    let etat = f.etat, groupe = f.groupe, raison = '';
    if (etat === 'eau') {
      const pv = pvapEau(TS);
      etat = pv - PATM > 0.5 ? 'gaz' : 'liquide';
      raison = `pression de vapeur à ${fmt(TS, 0)} °C : ${fmt(Math.max(0, pv - PATM), 2)} bar effectif ${etat === 'gaz' ? '> 0,5 bar : classé comme un gaz' : '≤ 0,5 bar : liquide'}`;
    }
    if (f.eclair !== undefined && TS > f.eclair) { groupe = 1; raison = `TS (${fmt(TS, 0)} °C) supérieure au point d'éclair (≈ ${f.eclair} °C) : groupe 1`; }
    if (f.vapeur && TS > 300) { etat = 'gaz'; raison = `${raison ? `${raison} ; ` : ''}phase vapeur possible au-delà de 300 °C : vérifier la pression de vapeur sur la fiche du fluide`; }
    return { libelle: f.libelle, etat, groupe, raison, instable: !!f.instable };
  }

  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const ROMAIN = ['', 'I', 'II', 'III', 'IV'];
  const res = (cat, tableau, regle) => ({ soumis: cat > 0, categorie: cat, libelle: cat > 0 ? `Catégorie ${ROMAIN[cat]}` : cat === 0 ? 'Article 4.3' : 'Exclu', tableau, regle });

  // Tuyauterie (article 4.1.c, annexe II tableaux 6 à 9)
  function tuyauterie({ PS, DN, TS, etat, groupe, instable }) {
    if (!(PS > 0.5)) return res(-1, '', 'PS ≤ 0,5 bar : hors champ de la directive (article 1).');
    const x = PS * DN;
    if (etat === 'gaz' && groupe === 1) {
      if (DN <= 25) return res(0, 'Tableau 6', 'Gaz du groupe 1 et DN ≤ 25 : article 4.3.');
      let c = DN <= 100 && x <= 1000 ? 1 : DN <= 350 && x <= 3500 ? 2 : 3;
      if (instable && c < 3) c = 3;
      return res(c, 'Tableau 6', `Gaz du groupe 1, DN ${DN} > 25, PS·DN = ${fmt(x, 0)}${instable ? ' (gaz instable : catégorie III)' : ''}.`);
    }
    if (etat === 'gaz') {
      if (DN <= 32 || x <= 1000) return res(0, 'Tableau 7', `Gaz du groupe 2 : soumis seulement si DN > 32 et PS·DN > 1000 (ici DN ${DN}, PS·DN = ${fmt(x, 0)}) : article 4.3.`);
      let c = DN <= 100 && x <= 3500 ? 1 : DN <= 250 && x <= 5000 ? 2 : 3;
      const chaud = c === 2 && TS > 350;
      if (chaud) c = 3;
      return res(c, 'Tableau 7', `Gaz du groupe 2, DN ${DN} > 32, PS·DN = ${fmt(x, 0)} > 1000${chaud ? ' ; TS > 350 °C : catégorie II portée en III' : ''}.`);
    }
    if (groupe === 1) {
      if (DN <= 25 || x <= 2000) return res(0, 'Tableau 8', `Liquide du groupe 1 : soumis seulement si DN > 25 et PS·DN > 2000 (ici DN ${DN}, PS·DN = ${fmt(x, 0)}) : article 4.3.`);
      return res(PS <= 10 ? 1 : PS <= 500 ? 2 : 3, 'Tableau 8', `Liquide du groupe 1, DN ${DN} > 25, PS·DN = ${fmt(x, 0)} > 2000, PS = ${fmt(PS)} bar.`);
    }
    if (!(PS > 10) || DN <= 200 || x <= 5000) return res(0, 'Tableau 9', `Liquide du groupe 2 : soumis seulement si PS > 10 bar, DN > 200 et PS·DN > 5000 (ici PS ${fmt(PS)} bar, DN ${DN}, PS·DN = ${fmt(x, 0)}) : article 4.3.`);
    return res(PS <= 500 ? 1 : 2, 'Tableau 9', `Liquide du groupe 2, PS = ${fmt(PS)} bar > 10, DN ${DN} > 200, PS·DN = ${fmt(x, 0)} > 5000.`);
  }

  // Récipient (article 4.1.a, tableaux 1 à 4) — V en litres
  function recipient({ PS, V, etat, groupe, instable }) {
    if (!(PS > 0.5)) return res(-1, '', 'PS ≤ 0,5 bar : hors champ de la directive (article 1).');
    const x = PS * V, t = `PS·V = ${fmt(x, 0)} bar·L (V = ${fmt(V, 0)} L)`;
    if (etat === 'gaz' && groupe === 1) {
      if (V <= 1) return PS > 200 ? res(PS > 1000 ? 4 : 3, 'Tableau 1', `Gaz du groupe 1, V ≤ 1 L et PS > 200 bar.`) : res(0, 'Tableau 1', `Gaz du groupe 1, V ≤ 1 L et PS ≤ 200 bar : article 4.3.`);
      if (x <= 25) return res(0, 'Tableau 1', `Gaz du groupe 1, ${t} ≤ 25 : article 4.3.`);
      let c = x <= 50 ? 1 : x <= 200 ? 2 : x <= 1000 ? 3 : 4;
      if (instable && c < 3) c = 3;
      return res(c, 'Tableau 1', `Gaz du groupe 1, ${t}.`);
    }
    if (etat === 'gaz') {
      if (V <= 1) return PS > 1000 ? res(3, 'Tableau 2', 'Gaz du groupe 2, V ≤ 1 L et PS > 1000 bar.') : res(0, 'Tableau 2', 'Gaz du groupe 2, V ≤ 1 L et PS ≤ 1000 bar : article 4.3.');
      if (x <= 50) return res(0, 'Tableau 2', `Gaz du groupe 2, ${t} ≤ 50 : article 4.3.`);
      return res(x <= 200 ? 1 : x <= 1000 ? 2 : x <= 3000 || PS <= 4 ? 3 : 4, 'Tableau 2', `Gaz du groupe 2, ${t}.`);
    }
    if (groupe === 1) {
      if (V <= 1) return PS > 500 ? res(2, 'Tableau 3', 'Liquide du groupe 1, V ≤ 1 L et PS > 500 bar.') : res(0, 'Tableau 3', 'Liquide du groupe 1, V ≤ 1 L et PS ≤ 500 bar : article 4.3.');
      if (x <= 200 && PS <= 500) return res(0, 'Tableau 3', `Liquide du groupe 1, ${t} ≤ 200 : article 4.3.`);
      return res(PS <= 10 ? 1 : PS <= 500 ? 2 : 3, 'Tableau 3', `Liquide du groupe 1, ${t}, PS = ${fmt(PS)} bar.`);
    }
    if (V <= 10) return PS > 1000 ? res(1, 'Tableau 4', 'Liquide du groupe 2, V ≤ 10 L et PS > 1000 bar.') : res(0, 'Tableau 4', 'Liquide du groupe 2, V ≤ 10 L et PS ≤ 1000 bar : article 4.3.');
    if (!(PS > 10) || x <= 10000) return res(0, 'Tableau 4', `Liquide du groupe 2 : soumis seulement si PS > 10 bar et PS·V > 10 000 (ici PS ${fmt(PS)} bar, ${t}) : article 4.3.`);
    return res(PS <= 500 ? 1 : 2, 'Tableau 4', `Liquide du groupe 2, PS = ${fmt(PS)} bar, ${t}.`);
  }

  // Générateur de vapeur ou d'eau surchauffée à plus de 110 °C, chauffé avec risque de surchauffe (article 4.1.b, tableau 5)
  function generateur({ PS, V, TS }) {
    if (!(PS > 0.5)) return res(-1, '', 'PS ≤ 0,5 bar : hors champ de la directive (article 1).');
    if (!(TS > 110)) return res(0, 'Tableau 5', 'TS ≤ 110 °C : pas un générateur au sens de l\'article 4.1.b ; classer comme récipient.');
    if (V <= 2) return res(0, 'Tableau 5', 'Générateur de volume ≤ 2 L : article 4.3 (hors autocuiseurs).');
    const x = PS * V;
    return res(PS > 32 || x > 3000 ? 4 : x <= 50 ? 1 : x <= 200 ? 2 : 3, 'Tableau 5', `Générateur, PS·V = ${fmt(x, 0)} bar·L (V = ${fmt(V, 0)} L)${PS > 32 ? ', PS > 32 bar' : ''}.`);
  }

  function classer(equipement, p) {
    const n = nature(p.fluide, p.TS, p.perso || {});
    const q = { ...p, etat: n.etat, groupe: n.groupe, instable: n.instable };
    const r = equipement === 'recipient' ? recipient(q) : equipement === 'generateur' ? generateur(q) : tuyauterie(q);
    return { ...r, nature: n };
  }

  // Exigences de fabrication et d'évaluation de la conformité par catégorie
  function exigences(cat) {
    if (cat < 0) return ['Hors champ de la DESP : appliquer les règles de l\'art et, le cas échéant, d\'autres textes (gaz : arrêté du 23/02/2018, frigorigènes : EN 378).'];
    if (cat === 0) return ['Article 4.3 : conception et fabrication selon les règles de l\'art (NF EN 13480 pour les tuyauteries), sans marquage CE ni déclaration UE de conformité.',
      'Instructions d\'utilisation suffisantes et marquage permettant d\'identifier le fabricant.', 'Épreuve d\'étanchéité selon le CCTP ou les règles de l\'art.'];
    const l = [`Marquage CE, déclaration UE de conformité et notice d'instructions (annexe I § 3.3 et 3.4).`,
      `Modules d'évaluation possibles : ${['', 'A (contrôle interne de la fabrication)', 'A2, D1 ou E1 — avec organisme notifié', 'B + D, B + F, B + E, B + C2 ou H — avec organisme notifié', 'B + D, B + F, G ou H1 — avec organisme notifié'][cat]}.`,
      'Analyse des risques, note de calcul (NF EN 13480-3) et dossier technique conservés 10 ans.',
      'Épreuve hydrostatique finale (annexe I § 3.2.2) et vérification finale documentée.'];
    if (cat >= 2) l.push('Modes opératoires de soudage (QMOS) et soudeurs approuvés par un organisme notifié ou une entité tierce reconnue (annexe I § 3.1.2).',
      'Matériaux des parties principales avec certificat de contrôle spécifique EN 10204 3.1.');
    if (cat >= 3) l.push('Personnel des contrôles non destructifs approuvé par une entité tierce reconnue (annexe I § 3.1.3).');
    return l;
  }
  // Pression d'épreuve (annexe I § 7.4) : max(1,25 · PS · f20/fTS ; 1,43 · PS)
  const epreuve = (PS, f20 = 1, fTS = 1) => Math.max(1.25 * PS * (fTS > 0 ? f20 / fTS : 1), 1.43 * PS);

  return { FLUIDES, pvapEau, T_EAU_GAZ, nature, tuyauterie, recipient, generateur, classer, exigences, epreuve, ROMAIN };
})();
if (typeof module !== 'undefined') module.exports = Desp;
