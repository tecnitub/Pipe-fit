// Calculs annexes → bilan électrique de l'armoire et points GTC (mesures, sécurités, comptages, commandes)
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'terminaux', 'sanitaire'].forEach(m => require(`../etudes/public/js/${m}`));
const AE = require('../etudes/public/js/annexes-elec');
const E = require('../etudes/public/js/electricite'), L = require('../etudes/public/js/liens');

let k = 0;
const nn = (type, x = {}) => ({ id: `n${++k}`, type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...x } });
const lignes = (...notes) => { const et = { objet: 'Essai', notes }; return { et, eqs: E.equipementsEtude(et, L) }; };
const de = (eqs, n) => eqs.filter(q => String(q.src).startsWith(`${n.id}:`));

test('chaque calcul annexe qui pose du matériel donne ses lignes à l\'armoire', () => {
  const attendus = { plancher: /Thermostat de sécurité/, plafonds: /Détecteurs de condensation/, echangeurPlaques: /départ secondaire/, geothermie: /Contrôleur de débit/,
    solaireEcs: /Compteur d'énergie solaire/, hotte: /Électrovanne gaz/, parking: /Mesure CO/, piscine: /hygrométrie du hall/, puitsCanadien: /by-pass/,
    legionelle: /retour de bouclage/, traitementEau: /Compteur d'eau d'appoint/, chambreFroide: /personne enfermée/ };
  Object.entries(attendus).forEach(([t, re]) => {
    const n = nn(t), { eqs } = lignes(n);
    assert.ok(de(eqs, n).some(q => re.test(q.designation)), `${t} : ${de(eqs, n).map(q => q.designation).join(' | ')}`);
  });
});

test('les lignes propres d\'un calcul sont gardées et complétées (pompe solaire + sondes, extracteur + asservissement gaz)', () => {
  const s = nn('solaireEcs'), h = nn('hotte'), { eqs } = lignes(s, h);
  assert.ok(de(eqs, s).some(q => q.type === 'pompe'));
  assert.ok(de(eqs, s).filter(q => q.regulation === 'sonde').length >= 2);
  assert.ok(de(eqs, h).some(q => q.type === 'ventilateur'));
  assert.ok(de(eqs, h).some(q => q.regulation === 'evGaz'));
});

test('détection de fuite frigorigène à partir de 500 t éq. CO₂ ou prévue sur l\'équipement', () => {
  const f = nn('fluides', { equipements: [{ rep: 'GF1', fluide: 'R410A', charge: 300 }, { rep: 'GF2', fluide: 'R410A', charge: 5 }, { rep: 'GF3', fluide: 'R32', charge: 3, detection: 'oui' }] });
  const reps = de(lignes(f).eqs, f).map(q => q.rep);
  assert.deepStrictEqual(reps, ['DF-GF1', 'DF-GF3']);
});

test('calculs de vérification sans matériel : aucune ligne', () => {
  ['radiateurs', 'conduitFumee', 'energieAnnuelle', 'aidesCee', 'airNeuf', 'confort', 'eauxPluviales', 'calorifugeEco'].forEach(t => {
    const n = nn(t); assert.strictEqual(de(lignes(n).eqs, n).length, 0, t);
  });
});

test('deux calculs du même type : repères distincts', () => {
  const a = nn('legionelle'), b = nn('legionelle'), { eqs } = lignes(a, b);
  const reps = [...de(eqs, a), ...de(eqs, b)].map(q => q.rep);
  assert.strictEqual(new Set(reps).size, reps.length, reps.join(' '));
});

test('points GTC : mesures, alarmes, comptages et commandes générés par l\'armoire', () => {
  const g = nn('geothermie'), s = nn('solaireEcs'), el = nn('elec'), { et, eqs } = lignes(g, s, el);
  el.entrees.equipements = E.fusionner(el.entrees.equipements, eqs, new Set(et.notes.map(n => n.id))).lignes;
  const js = JSON.stringify(L.calculer(et, el));
  ['TEGEO_T', 'CDGEO_DEF', 'CPTGEO_NRJ', 'PSOL_CMD', 'CPTSOL_NRJ', 'SURSOL_DEF'].forEach(p => assert.ok(js.includes(p), p));
});

test('branchement idempotent', () => {
  AE.brancher(); AE.brancher();
  const n = nn('plancher'), c = de(lignes(n).eqs, n).filter(q => q.rep === 'TS-PL').length;
  assert.strictEqual(c, 1);
});
