// Recherche d'un chantier pour pointer : mots sur le code, le nom, le client, le chargé d'affaires et le site ; type et filtres.
const { test } = require('node:test');
const assert = require('node:assert');
const RC = require('../public/js/recherche-chantier');

const affaires = [
  { id: 'a1', code: 'CH-2026-001', nom: 'Ligne NEP inox', clientId: 'c1', chargeId: 'u1', siteId: 's1' },
  { id: 'a2', code: 'CH-2026-004', nom: 'Résidence Les Tilleuls', clientId: 'c2', chargeId: 'u2' },
  { id: 'h1', code: 'HD-2026-002', nom: 'Dépannage fuite vapeur', type: 'horsDevis', clientLibre: 'Papeterie du Rhône', siteLibre: 'Usine de Fos' },
];
const ctx = { client: a => ({ c1: 'Fromagerie Alpine', c2: 'Bâtir Habitat' }[a.clientId] || ''), charge: a => ({ u1: 'Claire Martin', u2: 'Julien Brun' }[a.chargeId] || ''),
  site: a => (a.siteId === 's1' ? 'Usine de Rumilly' : '') };
const ids = r => r.map(x => x.a.id);

test('chaque mot se retrouve : code, nom, client, chargé d\'affaires, site, sans accents', () => {
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'residence' }, ctx)), ['a2']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'fromagerie' }, ctx)), ['a1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'claire' }, ctx)), ['a1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'rumilly nep' }, ctx)), ['a1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'papeterie fos' }, ctx)), ['h1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'ch-2026-00' }, ctx)), ['a2', 'a1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { q: 'claire tilleuls' }, ctx)), []);
});

test('type (sur devis / hors devis), client, chargé d\'affaires ; prévus puis récents en tête', () => {
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { type: 'hd' }, ctx)), ['h1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { type: 'devis' }, ctx)).sort(), ['a1', 'a2']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { clientId: 'c2' }, ctx)), ['a2']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, { chargeId: 'u1' }, ctx)), ['a1']);
  assert.deepStrictEqual(ids(RC.filtrer(affaires, {}, { ...ctx, prevus: new Set(['a1']), recents: new Set(['h1']) })), ['a1', 'h1', 'a2']);
});
