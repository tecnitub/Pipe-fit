// Compatibilité des études enregistrées par une version précédente : chaque calcul s'ouvre avec des entrées vides,
// partielles (champ ajouté depuis) ou des lignes incomplètes, sans exception ; les liens tolèrent les notes supprimées.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
['cta', 'industriel', 'terminaux', 'schema', 'equilibrage', 'aeraulique-schema', 'electricite', 'cables', 'sanitaire', 'evacuation', 'gaz-reseau', 'desenfumage', 'pieces'].forEach(m => {
  const x = require(`../etudes/public/js/${m}`);
  const g = { terminaux: 'Terminaux', sanitaire: 'Sanitaire', pieces: 'Pieces', evacuation: 'Evacuation' }[m];
  if (g) global[g] = x;
});
const Liens = require('../etudes/public/js/liens');
const M = require('../etudes/public/js/metre');
const PM = require('../etudes/public/js/points-mes');
const types = Object.keys(N.TYPES);

test('migration : tous les types de calcul existent (contrôle de la liste)', () => {
  ['sanitaire', 'evacuation', 'gazReseau', 'desenfumage', 'pieces', 'terminaux', 'elec', 'pid', 'arbo', 'aero', 'cta', 'ecs'].forEach(t => assert.ok(types.includes(t), t));
});

test('migration : entrées par défaut, vides et partielles', () => {
  types.forEach(t => {
    const d = N.defauts(t);
    assert.doesNotThrow(() => N.calculer(t, d), `${t} (défauts)`);
    // Ancienne version : seuls la moitié des champs étaient enregistrés, complétés par les défauts à l'ouverture
    const partiel = Object.fromEntries(Object.entries(d).filter((_, i) => i % 2 === 0));
    assert.doesNotThrow(() => N.calculer(t, { ...d, ...partiel }), `${t} (partiel)`);
    // Lignes enregistrées avant l'ajout de colonnes : clés manquantes
    const lignes = Object.fromEntries(Object.entries(d).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.map(l => (l && typeof l === 'object' ? Object.fromEntries(Object.entries(l).slice(0, 2)) : l))]));
    assert.doesNotThrow(() => N.calculer(t, { ...d, ...lignes }), `${t} (lignes incomplètes)`);
  });
});

test('migration : étude complète d\'une version précédente (liens rompus, notes sans entrées)', () => {
  const notes = types.map((t, i) => ({ id: `n${i}`, type: t, titre: t, entrees: i % 3 ? N.defauts(t) : {} }));
  // Liens vers des notes supprimées
  notes.find(n => n.type === 'sanitaire').entrees.production = 'supprimee';
  notes.find(n => n.type === 'terminaux').entrees.prodChaud = 'supprimee';
  notes.push({ id: 'orph', type: 'reseau', titre: 'Réseau', entrees: N.defauts('reseau'), lien: { note: 'supprimee', circuit: 0, role: 'reseau' } });
  const et = { id: 'e', notes };
  notes.forEach(n => assert.doesNotThrow(() => Liens.calculer(et, n), n.type));
  assert.doesNotThrow(() => M.metre(et));
  assert.doesNotThrow(() => PM.extraire(et, n => Liens.calculer(et, n)));
  const Ele = require('../etudes/public/js/electricite');
  assert.doesNotThrow(() => Ele.equipementsEtude(et, Liens));
});
