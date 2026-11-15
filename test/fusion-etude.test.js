// Fusion à trois d'enregistrements concurrents d'une étude (public/js/fusion-etude.js) et règles des versions
// (etudes/public/js/versions-etude.js).
const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../public/js/fusion-etude');
const VE = require('../etudes/public/js/versions-etude');

const copie = o => JSON.parse(JSON.stringify(o));
const base = {
  objet: 'Chaufferie groupe scolaire', indice: 'A', description: '', historique: [{ indice: '0', date: '2026-01-02' }],
  notes: [
    { id: 'n1', type: 'tuyauterie', titre: 'Antenne CTA', entrees: { Q: 12, DN: 50, troncons: [{ id: 't1', L: 10 }, { id: 't2', L: 5 }] }, commentaire: '' },
    { id: 'n2', type: 'bilan', titre: 'Bilan RDC', entrees: { pieces: [{ nom: 'Classe 1', S: 50 }, { nom: 'Classe 2', S: 48 }] } },
  ],
  materiel: { 'cta:CTA1': { reference: 'DF-3000', statut: 'propose' } },
  suiviEtapes: { e1: { etat: 'a-faire', historique: [] } },
};

test('changements sur des parties différentes : réunis sans conflit', () => {
  const l = copie(base), d = copie(base);
  l.notes[0].entrees.Q = 15;                                     // moi : un champ d'une note
  l.notes.push({ id: 'n3', type: 'ecs', titre: 'ECS', entrees: {} }); // moi : une note ajoutée
  l.materiel['pompe:P1'] = { reference: 'P-40' };                 // moi : matériel retenu (clé)
  d.notes[0].entrees.DN = 65;                                     // l'autre : autre champ de la même note
  d.notes[1].entrees.pieces[1].S = 52;                            // l'autre : ligne sans identifiant, même position
  d.notes[0].entrees.troncons.find(t => t.id === 't2').L = 7;     // l'autre : ligne identifiée
  d.objet = 'Chaufferie groupe scolaire Jean Moulin';             // l'autre : en-tête
  d.materiel['cta:CTA1'].statut = 'valide';                       // l'autre : même matériel, autre champ
  d.suiviEtapes.e1 = { etat: 'fait', historique: [{ action: 'fait', par: 'Claire' }] };
  const { fusion, conflits } = F.fusionner(base, l, d);
  assert.deepStrictEqual(conflits, []);
  assert.strictEqual(fusion.notes[0].entrees.Q, 15);
  assert.strictEqual(fusion.notes[0].entrees.DN, 65);
  assert.strictEqual(fusion.notes[0].entrees.troncons[1].L, 7);
  assert.strictEqual(fusion.notes[1].entrees.pieces[1].S, 52);
  assert.deepStrictEqual(fusion.notes.map(n => n.id), ['n1', 'n2', 'n3']);
  assert.strictEqual(fusion.objet, 'Chaufferie groupe scolaire Jean Moulin');
  assert.deepStrictEqual(fusion.materiel['cta:CTA1'], { reference: 'DF-3000', statut: 'valide' });
  assert.ok(fusion.materiel['pompe:P1']);
  assert.strictEqual(fusion.suiviEtapes.e1.etat, 'fait');
});

test('ajouts et retraits de notes, réordonnancement, historiques complétés des deux côtés', () => {
  const l = copie(base), d = copie(base);
  l.notes.reverse();                                         // moi : ordre changé
  d.notes.push({ id: 'n9', type: 'cta', titre: 'CTA', entrees: {} }); // l'autre : note ajoutée en fin
  l.historique.push({ indice: 'A', date: '2026-02-01' });
  d.historique.push({ indice: 'A', date: '2026-02-03' });
  let r = F.fusionner(base, l, d);
  assert.deepStrictEqual(r.conflits, []);
  assert.deepStrictEqual(r.fusion.notes.map(n => n.id), ['n2', 'n1', 'n9']);
  assert.strictEqual(r.fusion.historique.length, 3);
  // Note supprimée par l'un, inchangée chez l'autre : supprimée
  const l2 = copie(base), d2 = copie(base);
  l2.notes = l2.notes.filter(n => n.id !== 'n2'); d2.notes[0].commentaire = 'vu';
  r = F.fusionner(base, l2, d2);
  assert.deepStrictEqual(r.conflits, []);
  assert.deepStrictEqual(r.fusion.notes.map(n => n.id), ['n1']);
  assert.strictEqual(r.fusion.notes[0].commentaire, 'vu');
});

test('même donnée changée des deux côtés : conflit, choix par élément', () => {
  const l = copie(base), d = copie(base);
  l.notes[0].entrees.Q = 15; d.notes[0].entrees.Q = 18;      // même champ
  l.notes = l.notes.filter(n => n.id !== 'n2'); d.notes[1].titre = 'Bilan rez-de-chaussée'; // supprimée / modifiée
  l.indice = 'B'; d.indice = 'C';
  d.notes[0].entrees.DN = 80;                                // sans conflit
  const r = F.fusionner(base, l, d);
  assert.strictEqual(r.conflits.length, 3);
  const cles = r.conflits.map(c => c.cle);
  assert.ok(cles.includes('notes/#n1/entrees/Q') && cles.includes('notes/#n2') && cles.includes('indice'));
  // Libellés lisibles
  const c = r.conflits.find(x => x.cle === 'notes/#n1/entrees/Q');
  assert.strictEqual(F.libelle(c, { champ: (t, k) => (t === 'tuyauterie' && k === 'Q' ? 'Débit' : '') }), 'Calcul « Antenne CTA » › Débit');
  assert.strictEqual(F.apercu(r.conflits.find(x => x.cle === 'notes/#n2').local), '(supprimé)');
  // Par défaut : mes changements ; choix « ceux de l'autre » appliqués élément par élément
  assert.strictEqual(r.fusion.notes[0].entrees.Q, 15);
  assert.strictEqual(r.fusion.notes[0].entrees.DN, 80);
  const r2 = F.fusionner(base, l, d, { choix: { 'notes/#n1/entrees/Q': 'distant', 'notes/#n2': 'distant' } });
  assert.strictEqual(r2.fusion.notes[0].entrees.Q, 18);
  assert.deepStrictEqual(r2.fusion.notes.map(n => n.titre), ['Antenne CTA', 'Bilan rez-de-chaussée']);
  assert.strictEqual(r2.fusion.indice, 'B');
  // Dialogue : données échappées
  const html = F.dialogueHtml(r.conflits, { autre: '<b>Claire</b>' });
  assert.ok(!html.includes('<b>Claire</b>') && html.includes('&lt;b&gt;Claire&lt;/b&gt;'));
  assert.strictEqual((html.match(/type="radio"/g) || []).length, 6);
});

test('champs recalculés et méta-données : jamais en conflit ; listes sans identifiant modifiées différemment : conflit', () => {
  const b = { ...copie(base), avancement: { fait: 1 }, _v: 3 }, l = { ...copie(b), avancement: { fait: 2 } }, d = { ...copie(b), avancement: { fait: 3 }, _v: 4 };
  assert.deepStrictEqual(F.fusionner(b, l, d).conflits, []);
  const l2 = copie(base), d2 = copie(base);
  l2.notes[1].entrees.pieces.push({ nom: 'Classe 3', S: 40 });
  d2.notes[1].entrees.pieces.shift();
  const r = F.fusionner(base, l2, d2);
  assert.deepStrictEqual(r.conflits.map(c => c.cle), ['notes/#n2/entrees/pieces']);
  // Sans version de départ : seules les différences sont des conflits
  assert.deepStrictEqual(F.fusionner(null, { objet: 'a', x: 1 }, { objet: 'a', x: 2 }).conflits.map(c => c.cle), ['x']);
});

test('versions : résumé des changements, règle d\'enregistrement, limites', () => {
  const apres = copie(base);
  apres.notes = apres.notes.filter(n => n.id !== 'n2');
  apres.notes[0].entrees.Q = 20;
  apres.notes.push({ id: 'n4', type: 'cta', titre: 'CTA 2', entrees: {} });
  apres.objet = 'Autre objet';
  apres.avancement = { fait: 3 };
  const r = VE.resumer(base, apres);
  assert.deepStrictEqual([r.notesAjoutees, r.notesSupprimees, r.notesModifiees, r.entete], [['CTA 2'], ['Bilan RDC'], ['Antenne CTA'], ['objet']]);
  assert.match(VE.texte(r), /1 calcul\(s\) ajouté\(s\) : « CTA 2 » · 1 calcul\(s\) supprimé\(s\) : « Bilan RDC »/);
  assert.ok(VE.vide(VE.resumer(base, { ...copie(base), avancement: { x: 1 } })), 'champ recalculé seul : pas une nouvelle version');
  const t0 = '2026-11-15T10:00:00.000Z', t5 = '2026-11-15T10:05:00.000Z', t30 = '2026-11-15T10:30:00.000Z';
  const der = { auteur: 'Jacky', created_at: t0, motif: '' }, modif = VE.resumer(base, { ...copie(base), indice: 'B' });
  assert.strictEqual(VE.politique(null, modif, { auteur: 'Jacky', maintenant: t5 }), 'ajouter');
  assert.strictEqual(VE.politique(der, modif, { auteur: 'Jacky', maintenant: t5 }), 'remplacer');
  assert.strictEqual(VE.politique(der, modif, { auteur: 'Claire', maintenant: t5 }), 'ajouter');
  assert.strictEqual(VE.politique(der, modif, { auteur: 'Jacky', maintenant: t30 }), 'ajouter');
  assert.strictEqual(VE.politique(der, modif, { auteur: 'Jacky', maintenant: t5, reglages: { intervalleMin: 2 } }), 'ajouter');
  assert.strictEqual(VE.politique(der, r, { auteur: 'Jacky', maintenant: t5 }), 'ajouter', 'calcul supprimé : il reste dans la version précédente');
  assert.strictEqual(VE.politique(der, modif, { auteur: 'Jacky', maintenant: t5, motif: 'Restauration' }), 'ajouter');
  assert.strictEqual(VE.politique(der, VE.resumer(base, copie(base)), { auteur: 'Jacky', maintenant: t5 }), 'rien');
  const vs = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, date: `2026-0${i + 1}-01T00:00:00Z` }));
  assert.deepStrictEqual(VE.aPurger(vs, { reglages: { max: 3, jours: 0 }, maintenant: '2026-07-01T00:00:00Z' }), [1, 2, 3]);
  assert.deepStrictEqual(VE.aPurger(vs, { reglages: { max: 50, jours: 70 }, maintenant: '2026-07-01T00:00:00Z' }), [1, 2, 3, 4]);
  assert.deepStrictEqual(VE.aPurger(vs.slice(0, 1), { reglages: { max: 1, jours: 1 }, maintenant: '2027-01-01T00:00:00Z' }), [], 'la plus récente reste');
  // Calcul restauré : nouvel identifiant si le sien est repris
  const et = copie(base), n = VE.restaurerNote(et, base.notes[0], () => 'nouveau');
  assert.strictEqual(n.id, 'nouveau'); assert.strictEqual(et.notes.length, 3);
});
